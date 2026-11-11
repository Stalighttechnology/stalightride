"""Run queries as the database role the Supabase SQL expects.

Every policy, guard trigger and SECURITY DEFINER function in the schema
decides what to allow from two things: the current role (`anon`,
`authenticated`, `service_role`) and auth.uid(). PostgREST used to set both;
now this module does. Both settings are transaction-local, so they can never
leak into another request.
"""

from contextlib import contextmanager

from django.db import connection

ROLES = ("anon", "authenticated", "service_role")

_SET = "SELECT set_config('role', %s, true), set_config('request.jwt.claim.sub', %s, true)"


def set_db_role(role, user_id=None):
    """Switch role for the rest of the current transaction."""
    if role not in ROLES:
        raise ValueError(f"unknown database role: {role}")
    if not connection.in_atomic_block:
        # Outside a transaction the switch would not stick and queries would
        # run as the owner, which bypasses row-level security.
        raise RuntimeError("set_db_role needs an open transaction")
    with connection.cursor() as c:
        c.execute(_SET, [role, str(user_id) if user_id else ""])


@contextmanager
def db_role(role, user_id=None):
    """Temporarily act as another role, e.g. `with db_role("service_role"):`."""
    with connection.cursor() as c:
        c.execute("SELECT current_user, current_setting('request.jwt.claim.sub', true)")
        prev_role, prev_sub = c.fetchone()
    set_db_role(role, user_id)
    try:
        yield
    finally:
        with connection.cursor() as c:
            # 'none' = back to the login role (the owner; migrations and tests run as it).
            c.execute(_SET, [prev_role if prev_role in ROLES else "none", prev_sub or ""])
