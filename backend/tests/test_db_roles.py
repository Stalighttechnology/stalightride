"""The load-bearing piece: queries run as the right role, and RLS follows."""

import json
import uuid

import pytest
from django.db import connection, transaction
from django.http import HttpResponse

from core.db import db_role, set_db_role
from core.middleware import DbRoleMiddleware

pytestmark = pytest.mark.django_db


def q(sql, params=None):
    with connection.cursor() as c:
        c.execute(sql, params)
        return c.fetchall()


def make_user(email):
    uid = uuid.uuid4()
    q("INSERT INTO auth.users (id, email) VALUES (%s, %s) RETURNING id", [uid, email])
    return uid


APP_SCHEMAS = ['public', 'auth', 'storage']
DJANGO_TABLE = r"^(django_|auth_|accounts_|token_blacklist_)"


def test_schema_matches_the_original_migrations():
    """Counts taken from the 51 original migration files loaded on 2026-11-11, plus the
    realtime trigger (one function, six triggers) and the admin location policy from
    drizzle/. A change here means the schema changed."""
    tables = q("SELECT count(*) FROM pg_tables WHERE schemaname = ANY(%s) AND NOT (schemaname = 'public' AND tablename ~ %s)",
               [APP_SCHEMAS, DJANGO_TABLE])[0][0]
    functions = q("SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = ANY(%s)",
                  [APP_SCHEMAS])[0][0]
    triggers = q("""SELECT count(*) FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
                    JOIN pg_namespace n ON n.oid = c.relnamespace WHERE NOT t.tgisinternal AND n.nspname = ANY(%s)""",
                 [APP_SCHEMAS])[0][0]
    policies = q("SELECT count(*) FROM pg_policies")[0][0]
    grants = q("""SELECT count(*) FROM information_schema.role_table_grants
                  WHERE grantee IN ('anon', 'authenticated', 'service_role') AND table_name !~ %s""", [DJANGO_TABLE])[0][0]
    assert (tables, functions, triggers, policies, grants) == (49, 94, 83, 137, 980)


def test_signup_trigger_creates_profile_and_role():
    uid = make_user("a@example.com")
    assert q("SELECT count(*) FROM public.profiles WHERE id = %s", [uid])[0][0] == 1
    assert q("SELECT role::text FROM public.user_roles WHERE user_id = %s", [uid]) == [("customer",)]


def test_signup_trigger_referral_code_handles_shared_uuid_prefix():
    uid1 = uuid.UUID("c0000000-0000-4000-8000-000000000001")
    uid2 = uuid.UUID("c0000000-0000-4000-8000-000000000002")
    q("INSERT INTO auth.users (id, email) VALUES (%s, %s) RETURNING id", [uid1, "c1@example.com"])
    q("INSERT INTO auth.users (id, email) VALUES (%s, %s) RETURNING id", [uid2, "c2@example.com"])
    rows = q(
        "SELECT id, referral_code FROM public.profiles WHERE id = ANY(%s) ORDER BY id",
        [[uid1, uid2]],
    )
    assert len(rows) == 2
    code1, code2 = rows[0][1], rows[1][1]
    assert code1 and code1.startswith("SYN-") and len(code1) >= 16
    assert code2 and code2.startswith("SYN-") and len(code2) >= 16
    assert code1 != code2


def test_rls_follows_the_role():
    a, b = make_user("a@example.com"), make_user("b@example.com")

    with db_role("authenticated", a):
        assert q("SELECT auth.uid()")[0][0] == a
        assert [r[0] for r in q("SELECT id FROM public.profiles")] == [a]
    with db_role("authenticated", b):
        assert [r[0] for r in q("SELECT id FROM public.profiles")] == [b]
    with db_role("anon"):
        assert q("SELECT id FROM public.profiles") == []
    with db_role("service_role"):
        assert len(q("SELECT id FROM public.profiles")) == 2


def test_role_is_restored():
    owner = q("SELECT current_user")[0][0]
    with db_role("anon"):
        assert q("SELECT current_user")[0][0] == "anon"
    assert q("SELECT current_user")[0][0] == owner


@pytest.mark.django_db(transaction=True)
def test_set_db_role_refuses_outside_a_transaction():
    with pytest.raises(RuntimeError):
        set_db_role("anon")
    with transaction.atomic():
        set_db_role("anon")


def test_middleware_starts_every_request_as_anon(rf):
    seen = []

    def view(request):
        seen.append(q("SELECT current_user")[0][0])
        return HttpResponse()

    DbRoleMiddleware(view)(rf.get("/"))
    assert seen == ["anon"]


def test_wash_booking_status_and_advance_wash_status():
    customer = make_user("wash-customer@example.com")
    cleaner = make_user("wash-cleaner@example.com")
    service_id = q("SELECT id FROM public.wash_services WHERE active LIMIT 1")[0][0]
    booking_id = q(
        """
        INSERT INTO public.wash_bookings (customer_id, service_id, city, address, slot_date, slot_time, price)
        VALUES (%s, %s, 'Bengaluru', '123 MG Road', CURRENT_DATE + 1, '10:00', 499)
        RETURNING id
        """,
        [customer, service_id],
    )[0][0]

    # Confirm and assign cleaner (tests tg_notify_wash_booking & enforce_wash_booking_forward_progress)
    q(
        "UPDATE public.wash_bookings SET status = 'confirmed', assigned_cleaner_id = %s WHERE id = %s RETURNING id",
        [cleaner, booking_id],
    )
    q(
        "UPDATE public.wash_bookings SET progress = 'assigned' WHERE id = %s RETURNING id",
        [booking_id],
    )

    with db_role("authenticated", cleaner):
        res1 = json.loads(q("SELECT public.advance_wash_status(%s, 'on_the_way')", [booking_id])[0][0])
        assert res1["progress"] == "on_the_way"
        res2 = json.loads(
            q(
                "SELECT public.advance_wash_status(%s, 'started', ARRAY['before.jpg'])",
                [booking_id],
            )[0][0]
        )
        assert res2["progress"] == "started"
        res3 = json.loads(
            q(
                "SELECT public.advance_wash_status(%s, 'completed', ARRAY['after.jpg'])",
                [booking_id],
            )[0][0]
        )
        assert res3["progress"] == "completed"

    status, progress = q(
        "SELECT status::text, progress::text FROM public.wash_bookings WHERE id = %s",
        [booking_id],
    )[0]
    assert (status, progress) == ("completed", "completed")
