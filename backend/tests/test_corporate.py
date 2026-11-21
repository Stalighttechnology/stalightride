import json
import uuid
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

import pytest
from django.contrib.auth import get_user_model
from django.db import connection, transaction

User = get_user_model()
IST = ZoneInfo("Asia/Kolkata")
pytestmark = pytest.mark.django_db


def q(sql, params=None):
    with connection.cursor() as c:
        c.execute(sql, params)
        if not c.description:
            return None
        rows = c.fetchall()
        parsed = []
        for row in rows:
            parsed_row = []
            for col in row:
                if isinstance(col, str) and (col.startswith("{") or col.startswith("[")):
                    try:
                        parsed_row.append(json.loads(col))
                        continue
                    except Exception:
                        pass
                parsed_row.append(col)
            parsed.append(tuple(parsed_row))
        return parsed


@pytest.fixture
def corp_env(db):
    class E:
        pass

    e = E()
    e.admin = User.objects.create_user("admin@acme.test", "secret123", full_name="Platform Admin")
    e.comp_admin = User.objects.create_user("comp_admin@acme.test", "secret123", full_name="Acme Admin")
    e.manager = User.objects.create_user("manager@acme.test", "secret123", full_name="Acme Manager")
    e.employee = User.objects.create_user("employee@acme.test", "secret123", full_name="Acme Employee")
    e.other_user = User.objects.create_user("other@other.test", "secret123", full_name="Other User")
    e.host = User.objects.create_user("host@synchoo.test", "secret123", full_name="Host Partner")

    q("INSERT INTO public.user_roles (user_id, role) VALUES (%s, 'admin')", [e.admin.id])
    q("INSERT INTO public.vendors (id, business_name, kyc_status) VALUES (%s, 'Vendor One', 'approved')", [e.host.id])
    q("UPDATE public.profiles SET dl_status = 'approved', dl_expiry = '2035-01-01' WHERE id = %s", [e.employee.id])

    # Insert test vehicle
    e.veh_id = uuid.uuid4()
    q("""INSERT INTO public.vehicles (id, vendor_id, title, category, brand, model, year, city, price_daily, status, verification_status, instant_book)
         VALUES (%s, %s, 'Acme Test Car', 'car', 'Toyota', 'Innova', 2022, 'Bengaluru', 2000, 'active', 'approved', false)""",
      [e.veh_id, e.host.id])

    return e


def test_co_06_company_registration_pending(corp_env):
    """CO-06: Company registers with a GSTIN. Status is pending until an admin verifies it."""
    cid = uuid.uuid4()
    q("""INSERT INTO public.companies (id, name, gstin, billing_email, city, verification_status, wallet_balance, status)
         VALUES (%s, 'Acme Corp', '29ABCDE1234F1Z5', 'billing@acme.test', 'Bengaluru', 'pending', 50000, 'active')""",
      [cid])

    row = q("SELECT verification_status, status FROM public.companies WHERE id = %s", [cid])[0]
    assert row[0] == "pending"
    assert row[1] == "active"


def test_co_07_admin_approves_company(corp_env):
    """CO-07: Admin approves the company, updating verification status."""
    cid = uuid.uuid4()
    q("""INSERT INTO public.companies (id, name, gstin, billing_email, city, verification_status, wallet_balance, status)
         VALUES (%s, 'Beta Corp', '29XYZAB5678C1Z9', 'finance@beta.test', 'Bengaluru', 'pending', 50000, 'active')""",
      [cid])

    q("UPDATE public.companies SET verification_status = 'approved' WHERE id = %s", [cid])
    res = q("SELECT verification_status FROM public.companies WHERE id = %s", [cid])[0][0]
    assert res == "approved"


def test_co_08_company_admin_invites_employee(corp_env):
    """CO-08: Company admin adds employee to company_members with monthly limit."""
    cid = uuid.uuid4()
    q("""INSERT INTO public.companies (id, name, gstin, billing_email, city, verification_status, wallet_balance, status)
         VALUES (%s, 'Acme Corp', '29ABCDE1234F1Z5', 'billing@acme.test', 'Bengaluru', 'approved', 50000, 'active')""",
      [cid])

    # Admin member
    q("""INSERT INTO public.company_members (company_id, user_id, role, department, monthly_limit, status)
         VALUES (%s, %s, 'admin', 'Executive', 50000, 'active')""", [cid, corp_env.comp_admin.id])

    # Employee member
    mid = uuid.uuid4()
    q("""INSERT INTO public.company_members (id, company_id, user_id, role, department, monthly_limit, status)
         VALUES (%s, %s, %s, 'employee', 'Engineering', 10000, 'active')""", [mid, cid, corp_env.employee.id])

    row = q("SELECT role, monthly_limit, status FROM public.company_members WHERE id = %s", [mid])[0]
    assert row[0] == "employee"
    assert row[1] == 10000
    assert row[2] == "active"


def test_co_18_in_policy_trip_auto_approval(corp_env):
    """CO-18: In-policy booking: allowed service, below price cap, below monthly limit -> approval_status = 'auto'."""
    cid = uuid.uuid4()
    q("""INSERT INTO public.companies (id, name, gstin, billing_email, city, verification_status, wallet_balance, status)
         VALUES (%s, 'Acme Corp', '29ABCDE1234F1Z5', 'billing@acme.test', 'Bengaluru', 'approved', 50000, 'active')""",
      [cid])

    q("""INSERT INTO public.company_policies (company_id, allowed_services, max_price_per_day, approval_threshold)
         VALUES (%s, ARRAY['rental', 'driver', 'wash'], 4000, 3000)""", [cid])

    q("""INSERT INTO public.company_members (company_id, user_id, role, department, monthly_limit, status)
         VALUES (%s, %s, 'employee', 'Sales', 15000, 'active')""", [cid, corp_env.employee.id])

    # Policy check
    res = q("SELECT public.check_corporate_policy(%s, %s, 'rental', 2500)", [cid, corp_env.employee.id])[0][0]
    assert res["allowed"] is True
    assert res["in_policy"] is True

    # Booking creation
    b_id = uuid.uuid4()
    q("""INSERT INTO public.bookings (id, customer_id, vendor_id, vehicle_id, start_date, end_date, base_price, total_price, status, payment_status)
         VALUES (%s, %s, %s, %s, CURRENT_DATE + 3, CURRENT_DATE + 4, 2500, 2500, 'pending', 'pending')""",
      [b_id, corp_env.employee.id, corp_env.host.id, corp_env.veh_id])

    trip_res = q("""SELECT public.create_corporate_trip(%s, %s, NULL, NULL, 'rental', 2500, false)""",
                 [cid, b_id])[0][0]
    assert trip_res["success"] is True
    assert trip_res["approval_status"] == "auto"
    assert trip_res["in_policy"] is True


def test_co_10_and_11_out_of_policy_exceeds_cap_or_limit(corp_env):
    """CO-10 & CO-11: Booking exceeding max price cap or monthly limit requires manager approval."""
    cid = uuid.uuid4()
    q("""INSERT INTO public.companies (id, name, gstin, billing_email, city, verification_status, wallet_balance, status)
         VALUES (%s, 'Acme Corp', '29ABCDE1234F1Z5', 'billing@acme.test', 'Bengaluru', 'approved', 50000, 'active')""",
      [cid])

    q("""INSERT INTO public.company_policies (company_id, allowed_services, max_price_per_day, approval_threshold)
         VALUES (%s, ARRAY['rental', 'driver'], 3000, 2000)""", [cid])

    q("""INSERT INTO public.company_members (company_id, user_id, role, department, monthly_limit, status)
         VALUES (%s, %s, 'manager', 'Operations', 30000, 'active')""", [cid, corp_env.manager.id])
    q("""INSERT INTO public.company_members (company_id, user_id, role, department, monthly_limit, status)
         VALUES (%s, %s, 'employee', 'Sales', 5000, 'active')""", [cid, corp_env.employee.id])

    # 1. Price cap exceeded (4000 > 3000)
    res_cap = q("SELECT public.check_corporate_policy(%s, %s, 'rental', 4000)", [cid, corp_env.employee.id])[0][0]
    assert res_cap["allowed"] is True
    assert res_cap["in_policy"] is False
    assert "Amount exceeds policy limit" in res_cap["reason"]

    # 2. Service not allowed ('wash')
    res_srv = q("SELECT public.check_corporate_policy(%s, %s, 'wash', 1000)", [cid, corp_env.employee.id])[0][0]
    assert res_srv["allowed"] is True
    assert res_srv["in_policy"] is False
    assert "not permitted" in res_srv["reason"]

    # 3. Monthly limit exceeded (existing spend 3500 + new booking 2000 > 5000, while 2000 <= 3000 cap)
    q("""INSERT INTO public.company_trips (company_id, member_id, service_type, amount, approval_status, created_at)
         SELECT %s, id, 'rental', 3500, 'approved', now() FROM public.company_members WHERE user_id = %s""",
      [cid, corp_env.employee.id])

    res_lim = q("SELECT public.check_corporate_policy(%s, %s, 'rental', 2000)", [cid, corp_env.employee.id])[0][0]
    assert res_lim["allowed"] is True
    assert res_lim["in_policy"] is False
    assert "Monthly spend limit" in res_lim["reason"]


def test_co_12_and_19_manager_parallel_approval_confirms_trip(corp_env):
    """CO-12 & CO-19: Manager and provider approve in parallel; trip confirmed and company wallet charged on confirmation."""
    cid = uuid.uuid4()
    q("""INSERT INTO public.companies (id, name, gstin, billing_email, city, verification_status, wallet_balance, status)
         VALUES (%s, 'Acme Corp', '29ABCDE1234F1Z5', 'billing@acme.test', 'Bengaluru', 'approved', 50000, 'active')""",
      [cid])

    q("""INSERT INTO public.company_policies (company_id, allowed_services, max_price_per_day, approval_threshold)
         VALUES (%s, ARRAY['rental'], 2000, 1500)""", [cid])

    q("""INSERT INTO public.company_members (company_id, user_id, role, department, monthly_limit, status)
         VALUES (%s, %s, 'manager', 'Ops', 30000, 'active')""", [cid, corp_env.manager.id])
    q("""INSERT INTO public.company_members (company_id, user_id, role, department, monthly_limit, status)
         VALUES (%s, %s, 'employee', 'Sales', 10000, 'active')""", [cid, corp_env.employee.id])

    b_id = uuid.uuid4()
    q("""INSERT INTO public.bookings (id, customer_id, vendor_id, vehicle_id, start_date, end_date, base_price, total_price, status, payment_status)
         VALUES (%s, %s, %s, %s, CURRENT_DATE + 3, CURRENT_DATE + 4, 3500, 3500, 'pending', 'pending')""",
      [b_id, corp_env.employee.id, corp_env.host.id, corp_env.veh_id])

    # Out of policy trip created
    trip_res = q("""SELECT public.create_corporate_trip(%s, %s, NULL, NULL, 'rental', 3500, false)""",
                 [cid, b_id])[0][0]
    assert trip_res["approval_status"] == "pending"
    assert trip_res["respond_by"] is not None
    trip_id = trip_res["trip_id"]

    # Provider confirms booking
    q("UPDATE public.bookings SET status = 'confirmed', confirmed_at = now() WHERE id = %s", [b_id])

    # Manager approves trip (using authenticated context of manager)
    with connection.cursor() as c:
        c.execute("SET LOCAL \"request.jwt.claim.sub\" = %s", [str(corp_env.manager.id)])
        c.execute("SELECT public.corporate_decide_trip(%s, 'approve')", [trip_id])
        dec_res = c.fetchone()[0]
        if isinstance(dec_res, str):
            dec_res = json.loads(dec_res)

    assert dec_res["status"] == "approved"

    # Verify company wallet balance was charged (50000 - 3500 = 46500)
    bal = q("SELECT wallet_balance FROM public.companies WHERE id = %s", [cid])[0][0]
    assert bal == 46500

    # Verify booking payment status is paid
    pay_status = q("SELECT payment_status FROM public.bookings WHERE id = %s", [b_id])[0][0]
    assert pay_status == "paid"


def test_co_13_cancellation_refunds_company_wallet(corp_env):
    """CO-13: When a corporate booking is cancelled, the refund goes to the company wallet, not the employee."""
    cid = uuid.uuid4()
    q("""INSERT INTO public.companies (id, name, gstin, billing_email, city, verification_status, wallet_balance, status)
         VALUES (%s, 'Acme Corp', '29ABCDE1234F1Z5', 'billing@acme.test', 'Bengaluru', 'approved', 46500, 'active')""",
      [cid])

    q("""INSERT INTO public.company_members (company_id, user_id, role, department, monthly_limit, status)
         VALUES (%s, %s, 'employee', 'Sales', 10000, 'active')""", [cid, corp_env.employee.id])

    b_id = uuid.uuid4()
    q("""INSERT INTO public.bookings (id, customer_id, vendor_id, vehicle_id, start_date, pickup_time, end_date, dropoff_time,
                                      base_price, total_price, security_deposit, provider_earning, status)
         VALUES (%s, %s, %s, %s, CURRENT_DATE + 5, '10:00:00'::time, CURRENT_DATE + 6, '10:00:00'::time,
                 3000, 3500, 500, 2700, 'confirmed')""",
      [b_id, corp_env.employee.id, corp_env.host.id, corp_env.veh_id])
    q("UPDATE public.bookings SET payment_status = 'paid', paid_at = now() WHERE id = %s", [b_id])

    # Link corporate trip as approved
    q("""INSERT INTO public.company_trips (company_id, member_id, booking_id, service_type, amount, approval_status)
         SELECT %s, id, %s, 'rental', 3500, 'approved' FROM public.company_members WHERE user_id = %s""",
      [cid, b_id, corp_env.employee.id])

    # Cancel booking as admin (>24h ahead: 100% refund)
    with connection.cursor() as c:
        c.execute("SET LOCAL \"request.jwt.claim.sub\" = %s", [str(corp_env.admin.id)])
        c.execute("SELECT public.cancel_booking(%s, 'Business plan changed')", [b_id])
        res = c.fetchone()[0]
        if isinstance(res, str):
            res = json.loads(res)

    assert res["payment_status"] == "refunded"

    # Check company wallet was refunded
    comp_bal = q("SELECT wallet_balance FROM public.companies WHERE id = %s", [cid])[0][0]
    assert comp_bal == 46500 + res["refund"]


def test_co_14_monthly_consolidated_invoice(corp_env):
    """CO-14: At month end, one invoice is generated with base amount and 18% GST (9% CGST + 9% SGST)."""
    cid = uuid.uuid4()
    q("""INSERT INTO public.companies (id, name, gstin, billing_email, city, verification_status, wallet_balance, status)
         VALUES (%s, 'Acme Corp', '29ABCDE1234F1Z5', 'billing@acme.test', 'Bengaluru', 'approved', 50000, 'active')""",
      [cid])

    q("""INSERT INTO public.company_members (company_id, user_id, role, department, monthly_limit, status)
         VALUES (%s, %s, 'employee', 'Sales', 20000, 'active')""", [cid, corp_env.employee.id])

    # Insert two approved trips in the current month totaling 11800
    q("""INSERT INTO public.company_trips (company_id, member_id, service_type, amount, approval_status, created_at)
         SELECT %s, id, 'rental', 5900, 'approved', now() FROM public.company_members WHERE user_id = %s""",
      [cid, corp_env.employee.id])
    q("""INSERT INTO public.company_trips (company_id, member_id, service_type, amount, approval_status, created_at)
         SELECT %s, id, 'driver', 5900, 'approved', now() FROM public.company_members WHERE user_id = %s""",
      [cid, corp_env.employee.id])

    month_str = datetime.now(IST).strftime("%Y-%m")
    inv_id = q("SELECT public.generate_corporate_invoice(%s, %s)", [cid, month_str])[0][0]

    inv = q("SELECT month, base_amount, cgst, sgst, total, status FROM public.company_invoices WHERE id = %s", [inv_id])[0]
    assert inv[0] == month_str
    assert inv[1] == 10000.0  # Base (11800 / 1.18)
    assert inv[2] == 900.0    # CGST (9%)
    assert inv[3] == 900.0    # SGST (9%)
    assert inv[4] == 11800.0  # Total
    assert inv[5] == "paid"


def test_co_20_manager_expiry_cancels_trip(corp_env):
    """CO-20: When manager misses respond_by deadline, expire_booking_windows marks trip expired and cancels booking."""
    cid = uuid.uuid4()
    q("""INSERT INTO public.companies (id, name, gstin, billing_email, city, verification_status, wallet_balance, status)
         VALUES (%s, 'Acme Corp', '29ABCDE1234F1Z5', 'billing@acme.test', 'Bengaluru', 'approved', 50000, 'active')""",
      [cid])

    q("""INSERT INTO public.company_members (company_id, user_id, role, department, monthly_limit, status)
         VALUES (%s, %s, 'manager', 'Ops', 30000, 'active')""", [cid, corp_env.manager.id])
    q("""INSERT INTO public.company_members (company_id, user_id, role, department, monthly_limit, status)
         VALUES (%s, %s, 'employee', 'Sales', 10000, 'active')""", [cid, corp_env.employee.id])

    b_id = uuid.uuid4()
    q("""INSERT INTO public.bookings (id, customer_id, vendor_id, vehicle_id, start_date, end_date, base_price, total_price, status, payment_status)
         VALUES (%s, %s, %s, %s, CURRENT_DATE + 3, CURRENT_DATE + 4, 3500, 3500, 'pending', 'pending')""",
      [b_id, corp_env.employee.id, corp_env.host.id, corp_env.veh_id])

    trip_id = uuid.uuid4()
    # Past respond_by
    q("""INSERT INTO public.company_trips (id, company_id, member_id, booking_id, service_type, amount, approval_status, manager_id, respond_by)
         SELECT %s, %s, id, %s, 'rental', 3500, 'pending', %s, now() - interval '5 minutes'
         FROM public.company_members WHERE user_id = %s""",
      [trip_id, cid, b_id, corp_env.manager.id, corp_env.employee.id])

    res = q("SELECT public.expire_booking_windows()")[0][0]
    assert res["corporate_expired_pending"] >= 1

    trip_status = q("SELECT approval_status FROM public.company_trips WHERE id = %s", [trip_id])[0][0]
    assert trip_status == "expired"

    booking_status = q("SELECT status, cancellation_reason FROM public.bookings WHERE id = %s", [b_id])[0]
    assert booking_status[0] == "cancelled"
    assert booking_status[1] == "manager_no_response"


def test_co_21_personal_payment_fallback(corp_env):
    """CO-21: When employee chooses personal payment fallback, booking proceeds without company charge."""
    cid = uuid.uuid4()
    q("""INSERT INTO public.companies (id, name, gstin, billing_email, city, verification_status, wallet_balance, status)
         VALUES (%s, 'Acme Corp', '29ABCDE1234F1Z5', 'billing@acme.test', 'Bengaluru', 'approved', 50000, 'active')""",
      [cid])

    trip_res = q("""SELECT public.create_corporate_trip(%s, NULL, NULL, NULL, 'rental', 5000, true)""", [cid])[0][0]
    assert trip_res["success"] is True
    assert trip_res["mode"] == "personal"
    # No company trips created
    count = q("SELECT count(*) FROM public.company_trips WHERE company_id = %s", [cid])[0][0]
    assert count == 0


def test_flag_in_policy_trip(corp_env):
    """Weekly review: Manager flags an auto-approved trip for audit."""
    cid = uuid.uuid4()
    q("""INSERT INTO public.companies (id, name, gstin, billing_email, city, verification_status, wallet_balance, status)
         VALUES (%s, 'Acme Corp', '29ABCDE1234F1Z5', 'billing@acme.test', 'Bengaluru', 'approved', 50000, 'active')""",
      [cid])

    q("""INSERT INTO public.company_members (company_id, user_id, role, department, monthly_limit, status)
         VALUES (%s, %s, 'manager', 'Ops', 30000, 'active')""", [cid, corp_env.manager.id])
    q("""INSERT INTO public.company_members (company_id, user_id, role, department, monthly_limit, status)
         VALUES (%s, %s, 'employee', 'Sales', 10000, 'active')""", [cid, corp_env.employee.id])

    trip_id = uuid.uuid4()
    q("""INSERT INTO public.company_trips (id, company_id, member_id, service_type, amount, approval_status)
         SELECT %s, %s, id, 'rental', 2500, 'auto' FROM public.company_members WHERE user_id = %s""",
      [trip_id, cid, corp_env.employee.id])

    with connection.cursor() as c:
        c.execute("SET LOCAL \"request.jwt.claim.sub\" = %s", [str(corp_env.manager.id)])
        c.execute("SELECT public.flag_corporate_trip(%s, 'Excessive weekend travel')", [trip_id])
        res = c.fetchone()[0]
        if isinstance(res, str):
            res = json.loads(res)

    assert res["flagged"] is True

    flag_row = q("SELECT is_flagged, flagged_reason FROM public.company_trips WHERE id = %s", [trip_id])[0]
    assert flag_row[0] is True
    assert flag_row[1] == "Excessive weekend travel"
