-- Wash pipeline: cleaners, washing centers, job claiming and steps, wash earnings, review moderation.
-- Migration: 20261107130000_wash_pipeline.sql

-- @step setup users, service, platform partner, paid confirmed wash
INSERT INTO auth.users (id, email) VALUES
 ('00000000-0000-0000-0000-0000000000a1','admin@x.test'),
 ('00000000-0000-0000-0000-0000000000c1','cust@x.test'),
 ('00000000-0000-0000-0000-0000000000d1','cleaner@x.test'),
 ('00000000-0000-0000-0000-0000000000d2','cleaner2@x.test'),
 ('00000000-0000-0000-0000-0000000000e1','center@x.test');
INSERT INTO public.user_roles (user_id, role) VALUES ('00000000-0000-0000-0000-0000000000a1','admin') ON CONFLICT DO NOTHING;
INSERT INTO public.wash_services (id, name, vehicle_category, price, duration_minutes) VALUES ('00000000-0000-0000-0000-00000000aa01','Foam wash','car',500,45);
INSERT INTO public.wash_vendors (id, name, city) VALUES ('00000000-0000-0000-0000-00000000bb01','Platform crew','Bengaluru');
INSERT INTO public.wash_bookings (id, customer_id, service_id, address, city, slot_date, slot_time)
 VALUES ('00000000-0000-0000-0000-00000000cc01','00000000-0000-0000-0000-0000000000c1','00000000-0000-0000-0000-00000000aa01','12 MG Road','Bengaluru', current_date + 3, '10:00');
UPDATE public.wash_bookings SET status='confirmed', assigned_vendor_id='00000000-0000-0000-0000-00000000bb01', payment_status='paid', paid_at=now() WHERE id='00000000-0000-0000-0000-00000000cc01';
SELECT price, base_price, provider_earning, status, payment_status FROM public.wash_bookings;

-- @step cleaner registers and tries to self-approve
SET LOCAL ROLE authenticated; SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000d1',true);
INSERT INTO public.cleaners (id, full_name, city, verification_status) VALUES ('00000000-0000-0000-0000-0000000000d1','Ravi','bengaluru ','approved');
UPDATE public.cleaners SET verification_status='approved', bio='10 yrs' WHERE id='00000000-0000-0000-0000-0000000000d1';
SELECT verification_status, bio FROM public.cleaners;

-- @step unverified cleaner sees an empty board
SET LOCAL ROLE authenticated; SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000d1',true);
SELECT count(*) AS board FROM public.wash_job_board();

-- @expect-error Only verified cleaners
SET LOCAL ROLE authenticated; SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000d1',true);
SELECT public.claim_wash_job('00000000-0000-0000-0000-00000000cc01');

-- @expect-error Admins only
SET LOCAL ROLE authenticated; SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000d1',true);
SELECT public.admin_verify_cleaner('00000000-0000-0000-0000-0000000000d1','approved');

-- @step admin approves both cleaners (second one in another city)
RESET ROLE;
INSERT INTO public.cleaners (id, full_name, city) VALUES ('00000000-0000-0000-0000-0000000000d2','Anil','Mumbai');
SET LOCAL ROLE authenticated; SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a1',true);
SELECT public.admin_verify_cleaner('00000000-0000-0000-0000-0000000000d1','approved');
SELECT public.admin_verify_cleaner('00000000-0000-0000-0000-0000000000d2','approved');
SELECT id, verification_status FROM public.cleaners ORDER BY 1;

-- @step verified cleaner sees the job, without an address
SET LOCAL ROLE authenticated; SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000d1',true);
SELECT * FROM public.wash_job_board();
SELECT count(*) AS visible_before_claim FROM public.wash_bookings;

-- @expect-error outside your city
SET LOCAL ROLE authenticated; SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000d2',true);
SELECT public.claim_wash_job('00000000-0000-0000-0000-00000000cc01');

-- @expect-error This is not your job
SET LOCAL ROLE authenticated; SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000d1',true);
SELECT public.advance_wash_job('00000000-0000-0000-0000-00000000cc01','on_the_way');

-- @step cleaner claims; now sees the address
SET LOCAL ROLE authenticated; SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000d1',true);
SELECT public.claim_wash_job('00000000-0000-0000-0000-00000000cc01');
SELECT address, progress, cleaner_id IS NOT NULL AS claimed FROM public.wash_bookings;

-- @expect-error already taken
SET LOCAL ROLE authenticated; SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000d1',true);
SELECT public.claim_wash_job('00000000-0000-0000-0000-00000000cc01');

-- @expect-error Next step must be on_the_way
SET LOCAL ROLE authenticated; SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000d1',true);
SELECT public.advance_wash_job('00000000-0000-0000-0000-00000000cc01','completed');

-- @step direct status update by cleaner is not possible (no update policy)
SET LOCAL ROLE authenticated; SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000d1',true);
UPDATE public.wash_bookings SET status='completed' WHERE id='00000000-0000-0000-0000-00000000cc01';
SELECT status FROM public.wash_bookings;

-- @step cleaner walks the steps; earning credited on completion
SET LOCAL ROLE authenticated; SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000d1',true);
SELECT public.advance_wash_job('00000000-0000-0000-0000-00000000cc01','on_the_way');
SELECT public.advance_wash_job('00000000-0000-0000-0000-00000000cc01','started');
SELECT public.advance_wash_job('00000000-0000-0000-0000-00000000cc01','completed');
SELECT status, progress, earning_credited_at IS NOT NULL AS settled FROM public.wash_bookings;
SELECT kind, amount FROM public.wallet_transactions WHERE user_id='00000000-0000-0000-0000-0000000000d1';
SELECT public.withdrawable_balance() AS withdrawable;

-- @step cleaner withdraws wash earnings (admin lowers min withdrawal to 100)
SET LOCAL ROLE authenticated; SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a1',true);
UPDATE public.platform_settings SET min_withdrawal = 100 WHERE id = 1;
SET LOCAL ROLE authenticated; SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000d1',true);
SELECT public.request_withdrawal(100, 'upi', 'ravi@okaxis') IS NOT NULL AS requested;
SELECT public.withdrawable_balance() AS withdrawable_after;

-- @step customer reviews; cleaner can read it
SET LOCAL ROLE authenticated; SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000c1',true);
INSERT INTO public.wash_reviews (wash_booking_id, customer_id, rating, comment) VALUES ('00000000-0000-0000-0000-00000000cc01','00000000-0000-0000-0000-0000000000c1',5,'Spotless');
SET LOCAL ROLE authenticated; SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000d1',true);
SELECT rating, comment FROM public.wash_reviews;

-- @step center registers (forced inactive), tries to activate itself
SET LOCAL ROLE authenticated; SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000e1',true);
INSERT INTO public.wash_vendors (id, owner_id, name, city, active) VALUES ('00000000-0000-0000-0000-00000000bb02','00000000-0000-0000-0000-0000000000e1','Shine Spa','Bengaluru', true);
UPDATE public.wash_vendors SET active = true, address='HSR' WHERE id='00000000-0000-0000-0000-00000000bb02';
SELECT name, active, address FROM public.wash_vendors;

-- @expect-error duplicate key
SET LOCAL ROLE authenticated; SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000e1',true);
INSERT INTO public.wash_vendors (owner_id, name, city) VALUES ('00000000-0000-0000-0000-0000000000c1','Fake','Bengaluru');

-- @step center adds staff; stranger can't see it
SET LOCAL ROLE authenticated; SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000e1',true);
INSERT INTO public.wash_center_staff (vendor_id, name, role) VALUES ('00000000-0000-0000-0000-00000000bb02','Sunil','Detailer');
SET LOCAL ROLE authenticated; SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000d1',true);
SELECT count(*) AS stranger_staff FROM public.wash_center_staff;

-- @step admin activates the center and assigns it a paid wash; it is NOT on the cleaner board
SET LOCAL ROLE authenticated; SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a1',true);
UPDATE public.wash_vendors SET active = true WHERE id='00000000-0000-0000-0000-00000000bb02';
RESET ROLE;
INSERT INTO public.wash_bookings (id, customer_id, service_id, address, city, slot_date, slot_time)
 VALUES ('00000000-0000-0000-0000-00000000cc02','00000000-0000-0000-0000-0000000000c1','00000000-0000-0000-0000-00000000aa01','5 Brigade Rd','Bengaluru', current_date + 4, '11:00');
UPDATE public.wash_bookings SET status='confirmed', assigned_vendor_id='00000000-0000-0000-0000-00000000bb02', payment_status='paid', paid_at=now() WHERE id='00000000-0000-0000-0000-00000000cc02';
SET LOCAL ROLE authenticated; SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000d1',true);
SELECT count(*) AS board_after FROM public.wash_job_board();

-- @step center runs the job end to end and is paid
SET LOCAL ROLE authenticated; SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000e1',true);
SELECT count(*) AS center_sees FROM public.wash_bookings;
SELECT public.advance_wash_job('00000000-0000-0000-0000-00000000cc02','assigned');
SELECT public.advance_wash_job('00000000-0000-0000-0000-00000000cc02','on_the_way');
SELECT public.advance_wash_job('00000000-0000-0000-0000-00000000cc02','started');
SELECT public.advance_wash_job('00000000-0000-0000-0000-00000000cc02','completed');
SELECT kind, amount FROM public.wallet_transactions WHERE user_id='00000000-0000-0000-0000-0000000000e1';

-- @step admin deletes and un-reports reviews
RESET ROLE;
INSERT INTO public.vendors (id, business_name, kyc_status) VALUES ('00000000-0000-0000-0000-0000000000e1','Shine','approved');
INSERT INTO public.vehicles (id, vendor_id, title, category, brand, model, year, city, price_daily, status, verification_status)
 VALUES ('00000000-0000-0000-0000-00000000f001','00000000-0000-0000-0000-0000000000e1','Creta','car','Hyundai','Creta',2024,'Bengaluru',1200,'active','approved');
UPDATE public.profiles SET dl_status='approved', dl_expiry='2030-01-01' WHERE id='00000000-0000-0000-0000-0000000000c1';
INSERT INTO public.bookings (id, vehicle_id, vendor_id, customer_id, start_date, end_date, pickup_time, dropoff_time, base_price, total_price)
 VALUES ('00000000-0000-0000-0000-0000000b0001','00000000-0000-0000-0000-00000000f001','00000000-0000-0000-0000-0000000000e1','00000000-0000-0000-0000-0000000000c1','2026-12-01','2026-12-02','10:00','10:00',1,1);
UPDATE public.bookings SET status='completed' WHERE id='00000000-0000-0000-0000-0000000b0001';
INSERT INTO public.reviews (id, booking_id, vehicle_id, customer_id, rating, comment, reported, report_reason)
 VALUES ('00000000-0000-0000-0000-00000000dd01','00000000-0000-0000-0000-0000000b0001','00000000-0000-0000-0000-00000000f001','00000000-0000-0000-0000-0000000000c1',1,'bad',true,'abusive');
SET LOCAL ROLE authenticated; SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a1',true);
UPDATE public.reviews SET reported=false, report_reason=NULL WHERE id='00000000-0000-0000-0000-00000000dd01' RETURNING reported;
DELETE FROM public.reviews WHERE id='00000000-0000-0000-0000-00000000dd01' RETURNING id;
SELECT review_count, avg_rating FROM public.vehicles WHERE id='00000000-0000-0000-0000-00000000f001';
