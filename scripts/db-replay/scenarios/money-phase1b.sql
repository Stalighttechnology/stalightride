-- Money phase 1b: admin refunds, paid trip extensions, booking column guards.
-- Migration: 20261107120000_money_phase1b.sql

-- @step setup users, vehicle, bookings
INSERT INTO auth.users (id, email) VALUES
 ('00000000-0000-0000-0000-0000000000a1','admin@x.test'),
 ('00000000-0000-0000-0000-0000000000b1','host@x.test'),
 ('00000000-0000-0000-0000-0000000000c1','cust@x.test'),
 ('00000000-0000-0000-0000-0000000000c2','cust2@x.test');
INSERT INTO public.user_roles (user_id, role) VALUES ('00000000-0000-0000-0000-0000000000a1','admin') ON CONFLICT DO NOTHING;
UPDATE public.profiles SET dl_status='approved', dl_expiry='2030-01-01' WHERE id IN ('00000000-0000-0000-0000-0000000000c1','00000000-0000-0000-0000-0000000000c2');
INSERT INTO public.vendors (id, business_name, kyc_status) VALUES ('00000000-0000-0000-0000-0000000000b1','Host Co','approved');
INSERT INTO public.vehicles (id, vendor_id, title, category, brand, model, year, city, price_daily, price_hourly, security_deposit, status, verification_status)
 VALUES ('00000000-0000-0000-0000-00000000f001','00000000-0000-0000-0000-0000000000b1','Creta','car','Hyundai','Creta',2024,'Bengaluru',1200,100,2000,'active','approved');
INSERT INTO public.bookings (id, vehicle_id, vendor_id, customer_id, start_date, end_date, pickup_time, dropoff_time, base_price, total_price)
 VALUES ('00000000-0000-0000-0000-0000000b0001','00000000-0000-0000-0000-00000000f001','00000000-0000-0000-0000-0000000000b1','00000000-0000-0000-0000-0000000000c1','2026-12-01','2026-12-02','10:00','10:00',1,1);
INSERT INTO public.bookings (id, vehicle_id, vendor_id, customer_id, start_date, end_date, pickup_time, dropoff_time, base_price, total_price)
 VALUES ('00000000-0000-0000-0000-0000000b0002','00000000-0000-0000-0000-00000000f001','00000000-0000-0000-0000-0000000000b1','00000000-0000-0000-0000-0000000000c2','2026-12-05','2026-12-06','10:00','10:00',1,1);
UPDATE public.bookings SET status='confirmed', payment_status='paid', paid_at=now(), pickup_checked_at=now() WHERE id='00000000-0000-0000-0000-0000000b0001';
SELECT public.wallet_apply('00000000-0000-0000-0000-0000000000c1', 5000, 'topup');
SELECT base_price, service_fee, gst_amount, provider_earning, total_price FROM public.bookings WHERE id='00000000-0000-0000-0000-0000000b0001';

-- @step scope guard: customer PATCH of dates/check-out/QR is reverted
SET LOCAL ROLE authenticated; SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000c1',true);
UPDATE public.bookings SET end_date='2026-12-03', total_price=1, return_checked_at=now(), qr_code='spoof' WHERE id='00000000-0000-0000-0000-0000000b0001';
SELECT end_date, total_price, return_checked_at, qr_code FROM public.bookings WHERE id='00000000-0000-0000-0000-0000000b0001';

-- @step undo any direct edit (superuser)
UPDATE public.bookings SET end_date='2026-12-02' WHERE id='00000000-0000-0000-0000-0000000b0001';
SELECT end_date FROM public.bookings WHERE id='00000000-0000-0000-0000-0000000b0001';

-- @expect-error Not your booking
SET LOCAL ROLE authenticated; SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000c2',true);
SELECT public.request_booking_extension('00000000-0000-0000-0000-0000000b0001', 6);

-- @step customer requests +6h
SET LOCAL ROLE authenticated; SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000c1',true);
SELECT public.request_booking_extension('00000000-0000-0000-0000-0000000b0001', 6, 'running late');
SELECT hours, new_end_date, new_dropoff_time, extra_base, service_fee, gst_amount, provider_earning, extra_total, status FROM public.booking_extensions;

-- @expect-error already open
SET LOCAL ROLE authenticated; SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000c1',true);
SELECT public.request_booking_extension('00000000-0000-0000-0000-0000000b0001', 3);

-- @expect-error has not accepted
SET LOCAL ROLE authenticated; SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000c1',true);
SELECT public.wallet_pay_extension((SELECT id FROM public.booking_extensions LIMIT 1));

-- @expect-error Only the host
SET LOCAL ROLE authenticated; SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000c1',true);
SELECT public.decide_booking_extension((SELECT id FROM public.booking_extensions LIMIT 1), true);

-- @step host accepts
SET LOCAL ROLE authenticated; SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000b1',true);
SELECT public.decide_booking_extension((SELECT id FROM public.booking_extensions LIMIT 1), true);

-- @step customer pays from wallet; booking extended
SET LOCAL ROLE authenticated; SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000c1',true);
SELECT public.wallet_pay_extension((SELECT id FROM public.booking_extensions LIMIT 1)) AS balance_after;
SELECT end_date, dropoff_time, base_price, service_fee, gst_amount, provider_earning, total_price FROM public.bookings WHERE id='00000000-0000-0000-0000-0000000b0001';

-- @expect-error Already paid
SET LOCAL ROLE authenticated; SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000c1',true);
SELECT public.wallet_pay_extension((SELECT id FROM public.booking_extensions LIMIT 1));

-- @expect-error not available
SET LOCAL ROLE authenticated; SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000c1',true);
SELECT public.request_booking_extension('00000000-0000-0000-0000-0000000b0001', 72);

-- @step request +24h, then another booking takes 12-03 before the host decides
SET LOCAL ROLE authenticated; SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000c1',true);
SELECT public.request_booking_extension('00000000-0000-0000-0000-0000000b0001', 24);
RESET ROLE;
INSERT INTO public.bookings (id, vehicle_id, vendor_id, customer_id, start_date, end_date, pickup_time, dropoff_time, base_price, total_price)
 VALUES ('00000000-0000-0000-0000-0000000b0003','00000000-0000-0000-0000-00000000f001','00000000-0000-0000-0000-0000000000b1','00000000-0000-0000-0000-0000000000c2','2026-12-03','2026-12-04','10:00','10:00',1,1);

-- @expect-error booked or blocked
SET LOCAL ROLE authenticated; SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000b1',true);
SELECT public.decide_booking_extension((SELECT id FROM public.booking_extensions WHERE status='pending'), true);

-- @step customer cancels the stuck request
SET LOCAL ROLE authenticated; SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000c1',true);
SELECT public.cancel_booking_extension((SELECT id FROM public.booking_extensions WHERE status='pending'));
SELECT status, count(*) FROM public.booking_extensions GROUP BY 1 ORDER BY 1;

-- @expect-error permission denied
SET LOCAL ROLE authenticated; SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000c1',true);
INSERT INTO public.booking_extensions (booking_id, customer_id, vendor_id, hours, new_end_date, new_dropoff_time, extra_base, service_fee, gst_amount, commission_amount, commission_gst, provider_earning, extra_total)
 VALUES ('00000000-0000-0000-0000-0000000b0001','00000000-0000-0000-0000-0000000000c1','00000000-0000-0000-0000-0000000000b1',1,'2026-12-09','10:00',0,0,0,0,0,0,0);

-- @step a stranger sees no extension rows
SET LOCAL ROLE authenticated; SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000c2',true);
SELECT count(*) AS stranger_rows FROM public.booking_extensions;

-- @step customer can still edit booking notes (allowed column)
SET LOCAL ROLE authenticated; SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000c1',true);
UPDATE public.bookings SET notes='bring a charger' WHERE id='00000000-0000-0000-0000-0000000b0001';
SELECT notes FROM public.bookings WHERE id='00000000-0000-0000-0000-0000000b0001';

-- @expect-error Admins only
SET LOCAL ROLE authenticated; SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000c1',true);
SELECT public.admin_refund('cust@x.test', 100, 'test');

-- @expect-error reason is required
SET LOCAL ROLE authenticated; SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a1',true);
SELECT public.admin_refund('cust@x.test', 100, '  ');

-- @step admin refunds 250 to customer; ledger + not withdrawable
SET LOCAL ROLE authenticated; SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a1',true);
SELECT public.admin_refund('CUST@x.test', 250, 'Late pickup compensation') AS balance_after;
SELECT kind, amount, description FROM public.wallet_transactions WHERE user_id='00000000-0000-0000-0000-0000000000c1' ORDER BY created_at DESC LIMIT 1;
SELECT public.withdrawable_balance('00000000-0000-0000-0000-0000000000c1') AS withdrawable;

-- @step trip returns and completes: host credited base + extension earning
UPDATE public.bookings SET return_checked_at = now() WHERE id='00000000-0000-0000-0000-0000000b0001';
SET LOCAL ROLE authenticated; SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000b1',true);
UPDATE public.bookings SET status='completed' WHERE id='00000000-0000-0000-0000-0000000b0001';
RESET ROLE;
SELECT kind, amount FROM public.wallet_transactions WHERE user_id='00000000-0000-0000-0000-0000000000b1';
