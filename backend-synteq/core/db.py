"""Run queries as the database role the schema's rules are written for.

Every policy, guard trigger and SECURITY DEFINER function decides what to
allow from two things: the current role (`anon`, `authenticated`,
`service_role`) and auth.uid(). This module sets both. Both settings are
transaction-local, so they can never leak into another request.
"""

from contextlib import contextmanager

from django.db import connection

ROLES = ("anon", "authenticated", "service_role")

_SET = "SELECT set_config('role', %s, true), set_config('request.jwt.claim.sub', %s, true)"


def _switch(role, user_id):
    if not connection.in_atomic_block:
        # Outside a transaction the switch would not stick and queries would
        # run as the owner, which bypasses row-level security.
        raise RuntimeError("set_db_role needs an open transaction")
    with connection.cursor() as c:
        c.execute(_SET, [role, str(user_id) if user_id else ""])


def set_db_role(role, user_id=None):
    """Switch role for the rest of the current transaction."""
    if role not in ROLES:
        raise ValueError(f"unknown database role: {role}")
    _switch(role, user_id)


def reset_role():
    """Back to the login role (the owner) for the rest of the transaction."""
    _switch("none", "")


@contextmanager
def _restoring():
    with connection.cursor() as c:
        c.execute("SELECT current_user, current_setting('request.jwt.claim.sub', true)")
        prev_role, prev_sub = c.fetchone()
    try:
        yield
    finally:
        # 'none' = back to the login role (the owner).
        _switch(prev_role if prev_role in ROLES else "none", prev_sub or "")


@contextmanager
def db_role(role, user_id=None):
    """Temporarily act as another role, e.g. `with db_role("service_role"):`."""
    with _restoring():
        set_db_role(role, user_id)
        yield


@contextmanager
def as_owner():
    """Temporarily act as the login role, for Django's own tables (users, tokens)."""
    with _restoring():
        _switch("none", "")
        yield
