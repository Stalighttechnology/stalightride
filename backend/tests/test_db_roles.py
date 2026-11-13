"""The load-bearing piece: queries run as the right role, and RLS follows."""

import json
import uuid

import pytest
from django.db import DatabaseError, connection, transaction
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
    assert (tables, functions, triggers, policies, grants) == (49, 97, 86, 138, 981)


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


def test_customer_cannot_approve_own_licence():
    """RN-12.1: the profile guard keeps dl_status the admin's; resubmitting goes back to review."""
    uid = make_user("dl@example.com")
    with db_role("authenticated", uid):
        q("UPDATE public.profiles SET dl_status = 'approved', referral_rewarded = true WHERE id = %s RETURNING id", [uid])
        assert q("SELECT dl_status::text, referral_rewarded FROM public.profiles WHERE id = %s", [uid]) == [("none", False)]
        q("UPDATE public.profiles SET dl_number = 'DL-1', dl_status = 'approved' WHERE id = %s RETURNING id", [uid])
        assert q("SELECT dl_status::text FROM public.profiles WHERE id = %s", [uid]) == [("pending",)]
    q("UPDATE public.profiles SET dl_status = 'approved' WHERE id = %s RETURNING id", [uid])  # owner (admin path)
    assert q("SELECT dl_status::text FROM public.profiles WHERE id = %s", [uid]) == [("approved",)]


def test_only_host_decides_a_booking():
    """RN-12.2: a customer can't confirm their own request; the host can, once."""
    host, cust = make_user("host@example.com"), make_user("cust@example.com")
    q("UPDATE public.profiles SET dl_status = 'approved', dl_expiry = CURRENT_DATE + 365 WHERE id = %s RETURNING id", [cust])
    q("INSERT INTO public.vendors (id, business_name) VALUES (%s, 'Fleet') RETURNING id", [host])
    vehicle = q("""INSERT INTO public.vehicles (vendor_id, title, category, brand, model, year, city, price_daily)
                   VALUES (%s, 'Swift', 'car', 'Maruti', 'Swift', 2023, 'Bengaluru', 1000) RETURNING id""", [host])[0][0]
    booking = q("""INSERT INTO public.bookings (vehicle_id, vendor_id, customer_id, start_date, end_date, base_price, total_price)
                   VALUES (%s, %s, %s, CURRENT_DATE + 30, CURRENT_DATE + 31, 1000, 1000) RETURNING id""",
                [vehicle, host, cust])[0][0]

    def set_status(user, status):
        with db_role("authenticated", user), transaction.atomic():
            q("UPDATE public.bookings SET status = %s WHERE id = %s RETURNING id", [status, booking])

    with pytest.raises(DatabaseError, match="Only the host"):
        set_status(cust, "confirmed")
    set_status(host, "confirmed")
    with pytest.raises(DatabaseError, match="Only pending requests"):
        set_status(host, "rejected")
    assert q("SELECT status::text FROM public.bookings WHERE id = %s", [booking]) == [("confirmed",)]


def test_only_driver_decides_a_hire():
    """A customer can't confirm their own hire; a driver can't reject one already accepted (and paid)."""
    admin, driver, cust = make_user("adm@example.com"), make_user("drv@example.com"), make_user("hc@example.com")
    q("INSERT INTO public.user_roles (user_id, role) VALUES (%s, 'admin') RETURNING user_id", [admin])
    q("""INSERT INTO public.drivers (id, full_name, city, hourly_rate, daily_rate, dl_number, dl_expiry)
         VALUES (%s, 'D', 'Bengaluru', 300, 1500, 'DL', CURRENT_DATE + 365) RETURNING id""", [driver])
    with db_role("authenticated", admin):  # the verification guard keeps approval with admins
        q("UPDATE public.drivers SET verification_status = 'approved', status = 'active' WHERE id = %s RETURNING id", [driver])
    with db_role("authenticated", cust):
        hire = q("""INSERT INTO public.driver_bookings (driver_id, customer_id, rate_type, start_date, end_date,
                                                         start_time, end_time, total_price)
                    VALUES (%s, %s, 'daily', CURRENT_DATE + 10, CURRENT_DATE + 10, '09:00', '18:00', 0) RETURNING id""",
                 [driver, cust])[0][0]

    def set_status(user, status):
        with db_role("authenticated", user), transaction.atomic():
            q("UPDATE public.driver_bookings SET status = %s WHERE id = %s RETURNING id", [status, hire])

    with pytest.raises(DatabaseError, match="Only the driver"):
        set_status(cust, "confirmed")
    set_status(driver, "confirmed")
    with pytest.raises(DatabaseError, match="Only pending requests"):
        set_status(driver, "rejected")
    with pytest.raises(DatabaseError, match="cannot go back to pending"):
        set_status(driver, "pending")
    assert q("SELECT status::text FROM public.driver_bookings WHERE id = %s", [hire]) == [("confirmed",)]


def test_wash_partners_cannot_approve_themselves():
    """A cleaner or washing center can't approve itself or set its rating; resubmitting after a rejection goes to review."""
    admin, cleaner = make_user("wa-adm@example.com"), make_user("wa-cln@example.com")
    q("INSERT INTO public.user_roles (user_id, role) VALUES (%s, 'admin') RETURNING user_id", [admin])
    with db_role("authenticated", cleaner):
        q("""INSERT INTO public.cleaners (id, full_name, city, verification_status, avg_rating)
             VALUES (%s, 'C', 'Bengaluru', 'approved', 5) RETURNING id""", [cleaner])
        q("UPDATE public.cleaners SET verification_status = 'approved', review_count = 9 WHERE id = %s RETURNING id", [cleaner])
    assert q("SELECT verification_status::text, avg_rating, review_count FROM public.cleaners WHERE id = %s",
             [cleaner]) == [("pending", 0, 0)]
    with db_role("authenticated", admin):
        q("SELECT public.verify_cleaner(%s, 'rejected', 'Blurry ID')", [cleaner])
    with db_role("authenticated", cleaner):
        q("UPDATE public.cleaners SET bio = 'New photos' WHERE id = %s RETURNING id", [cleaner])
    assert q("SELECT verification_status::text, rejection_reason FROM public.cleaners WHERE id = %s", [cleaner]) == [("pending", None)]
    with db_role("authenticated", admin):
        q("SELECT public.verify_cleaner(%s, 'approved')", [cleaner])
    assert q("SELECT verification_status::text FROM public.cleaners WHERE id = %s", [cleaner]) == [("approved",)]


def test_cancelled_wash_is_not_told_to_pay():
    """A wash cancelled after approval gets 'Wash cancelled', not another 'Wash slot approved'."""
    customer = make_user("wa-cust@example.com")
    service_id = q("SELECT id FROM public.wash_services WHERE active LIMIT 1")[0][0]
    wid = q("""INSERT INTO public.wash_bookings (customer_id, service_id, city, address, slot_date, slot_time, price)
               VALUES (%s, %s, 'Bengaluru', 'x', CURRENT_DATE + 3, '10:00', 0) RETURNING id""", [customer, service_id])[0][0]
    q("UPDATE public.wash_bookings SET status = 'confirmed', progress = 'confirmed' WHERE id = %s RETURNING id", [wid])
    q("UPDATE public.wash_bookings SET status = 'cancelled' WHERE id = %s RETURNING id", [wid])
    titles = [r[0] for r in q("SELECT title FROM public.notifications WHERE user_id = %s ORDER BY created_at, title", [customer])]
    assert titles.count("Wash slot approved") == 1 and "Wash cancelled" in titles


def test_my_referrals_lists_only_my_friends():
    me, friend, other = make_user("ref-me@example.com"), make_user("ref-f@example.com"), make_user("ref-o@example.com")
    q("UPDATE public.profiles SET referred_by = %s WHERE id = %s RETURNING id", [me, friend])
    with db_role("authenticated", me):
        assert [r[0] for r in q("SELECT id FROM public.my_referrals()")] == [friend]
    with db_role("authenticated", other):
        assert q("SELECT id FROM public.my_referrals()") == []


def test_revenue_aggregates_use_stored_commission():
    """It used to fail on settings columns that don't exist; it now sums what each booking recorded."""
    admin, customer = make_user("rev-adm@example.com"), make_user("rev-cust@example.com")
    q("INSERT INTO public.user_roles (user_id, role) VALUES (%s, 'admin') RETURNING user_id", [admin])
    service_id = q("SELECT id FROM public.wash_services WHERE name = 'Car Express Wash'")[0][0]
    wid = q("""INSERT INTO public.wash_bookings (customer_id, service_id, city, address, slot_date, slot_time, price)
               VALUES (%s, %s, 'Bengaluru', 'x', CURRENT_DATE + 3, '10:00', 0) RETURNING id""", [customer, service_id])[0][0]
    q("UPDATE public.wash_bookings SET payment_status = 'paid' WHERE id = %s RETURNING id", [wid])
    kept = q("SELECT commission_amount + service_fee FROM public.wash_bookings WHERE id = %s", [wid])[0][0]
    with db_role("authenticated", admin):
        agg = q("SELECT public.admin_revenue_aggregates()")[0][0]
    agg = json.loads(agg) if isinstance(agg, str) else agg
    assert kept > 0 and float(agg["platform_revenue"]) == float(kept)
