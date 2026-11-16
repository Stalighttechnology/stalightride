import os
import sys
from pathlib import Path

backend_dir = Path("c:/Users/gchir/stalight_ride/backend").resolve()
sys.path.insert(0, str(backend_dir))

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
import django
django.setup()

from django.db import connection

FAST_FORWARDS = {
    "FF-0": "SELECT set_config('request.jwt.claim.sub', id::text, false) FROM auth.users WHERE email = 'c3-admin@test.local';",
    "FF-1": "INSERT INTO public.user_roles (user_id, role) SELECT id, 'admin' FROM auth.users WHERE email = 'c3-admin@test.local' ON CONFLICT DO NOTHING;",
    "FF-2": """
        INSERT INTO public.vendors (id, business_name, id_document_url, kyc_status)
        SELECT id, 'c3 Fleet', id || '/id.jpg', 'approved' FROM auth.users WHERE email = 'c3-host@test.local'
        ON CONFLICT (id) DO UPDATE SET kyc_status = 'approved';
        INSERT INTO public.user_roles (user_id, role) SELECT id, 'vendor' FROM auth.users WHERE email = 'c3-host@test.local'
        ON CONFLICT DO NOTHING;
        INSERT INTO public.vehicles (vendor_id, title, category, brand, model, year, city, address, lat, lng, fuel, transmission,
                                     seats, price_daily, security_deposit, verification_status, status)
        SELECT id, 'c3 Swift', 'car', 'Maruti', 'Swift', 2023, 'Bengaluru', 'MG Road, Bengaluru', 12.9756, 77.6050, 'petrol', 'manual',
               5, 1000, 2000, 'approved', 'active'
          FROM auth.users u WHERE email = 'c3-host@test.local'
           AND NOT EXISTS (SELECT 1 FROM public.vehicles WHERE title = 'c3 Swift');
    """,
    "FF-3": """
        UPDATE public.profiles SET dl_number = 'DL-03-2020-0000001', dl_expiry = current_date + 365, dl_status = 'approved'
         WHERE id = (SELECT id FROM auth.users WHERE email = 'c3-cust@test.local');
    """,
    "FF-4": """
        SELECT public.wallet_apply(id, 10000, 'topup', NULL, 'FF-4', 'Test credit (fast-forward)')
          FROM auth.users WHERE email = 'c3-cust@test.local';
    """,
    "FF-5": """
        INSERT INTO public.bookings (vehicle_id, vendor_id, customer_id, start_date, end_date, pickup_time, dropoff_time, base_price, total_price)
        SELECT v.id, v.vendor_id, c.id, d.day, d.day + 1, '10:00', '10:00', 0, 0
          FROM public.vehicles v, auth.users c,
               LATERAL (SELECT current_date + 30 + 3 * count(*)::int AS day FROM public.bookings WHERE vehicle_id = v.id) d
         WHERE v.title = 'c3 Swift' AND c.email = 'c3-cust@test.local';
    """,
    "FF-6": """
        UPDATE public.bookings SET status = 'confirmed'
         WHERE id = (SELECT b.id FROM public.bookings b JOIN auth.users u ON u.id = b.customer_id
                      WHERE u.email = 'c3-cust@test.local' ORDER BY b.created_at DESC LIMIT 1);
    """,
    "FF-7": """
        SELECT set_config('request.jwt.claim.sub', id::text, false) FROM auth.users WHERE email = 'c3-cust@test.local';
        SELECT public.wallet_pay_booking(b.id) FROM public.bookings b JOIN auth.users u ON u.id = b.customer_id
         WHERE u.email = 'c3-cust@test.local' ORDER BY b.created_at DESC LIMIT 1;
        SELECT set_config('request.jwt.claim.sub', id::text, false) FROM auth.users WHERE email = 'c3-admin@test.local';
    """,
    "FF-8": """
        UPDATE public.bookings
           SET start_date  = ((now() + make_interval(hours => 5)) AT TIME ZONE 'Asia/Kolkata')::date,
               pickup_time = ((now() + make_interval(hours => 5)) AT TIME ZONE 'Asia/Kolkata')::time(0),
               end_date    = ((now() + make_interval(hours => 5)) AT TIME ZONE 'Asia/Kolkata')::date + 1,
               dropoff_time = ((now() + make_interval(hours => 5)) AT TIME ZONE 'Asia/Kolkata')::time(0)
         WHERE id = (SELECT b.id FROM public.bookings b JOIN auth.users u ON u.id = b.customer_id
                      WHERE u.email = 'c3-cust@test.local' ORDER BY b.created_at DESC LIMIT 1);
    """,
    "FF-9": """
        UPDATE public.bookings
           SET start_date   = (now() AT TIME ZONE 'Asia/Kolkata')::date,
               pickup_time  = ((now() AT TIME ZONE 'Asia/Kolkata') - interval '5 minutes')::time(0),
               end_date     = (now() AT TIME ZONE 'Asia/Kolkata')::date + 1,
               dropoff_time = ((now() AT TIME ZONE 'Asia/Kolkata') - interval '5 minutes')::time(0)
         WHERE id = (SELECT b.id FROM public.bookings b JOIN auth.users u ON u.id = b.customer_id
                      WHERE u.email = 'c3-cust@test.local' ORDER BY b.created_at DESC LIMIT 1);
    """,
    "FF-10": """
        UPDATE public.bookings
           SET pickup_checked_at = now(), pickup_fuel_pct = 80, pickup_odometer = 10000, pickup_photos = '{}', pickup_damage = '[]'
         WHERE id = (SELECT b.id FROM public.bookings b JOIN auth.users u ON u.id = b.customer_id
                      WHERE u.email = 'c3-cust@test.local' ORDER BY b.created_at DESC LIMIT 1);
    """,
    "FF-11": """
        UPDATE public.bookings
           SET pickup_checked_at = coalesce(pickup_checked_at, now()), pickup_fuel_pct = coalesce(pickup_fuel_pct, 80),
               pickup_odometer = coalesce(pickup_odometer, 10000),
               return_checked_at = now(), return_fuel_pct = 60, return_odometer = 10120, return_photos = '{}', return_damage = '[]',
               status = 'completed'
         WHERE id = (SELECT b.id FROM public.bookings b JOIN auth.users u ON u.id = b.customer_id
                      WHERE u.email = 'c3-cust@test.local' ORDER BY b.created_at DESC LIMIT 1);
    """,
    "FF-12": """
        INSERT INTO public.reviews (booking_id, vehicle_id, customer_id, rating, comment)
        SELECT b.id, b.vehicle_id, b.customer_id, 4, 'Clean car, smooth pickup'
          FROM public.bookings b JOIN auth.users u ON u.id = b.customer_id
         WHERE u.email = 'c3-cust@test.local' AND b.status = 'completed'
           AND NOT EXISTS (SELECT 1 FROM public.reviews r WHERE r.booking_id = b.id)
         ORDER BY b.created_at DESC LIMIT 1;
    """,
    "FF-13": """
        INSERT INTO public.drivers (id, full_name, phone, city, experience_years, hourly_rate, daily_rate, languages, vehicle_types,
                                    service_area, dl_number, dl_expiry)
        SELECT id, 'c3 Driver', '9876500002', 'Bengaluru', 6, 300, 1500, '{English,Hindi}', '{Sedan,SUV}', 'Bangalore + 100 km',
               'DL-03-2019-0000002', current_date + 365
          FROM auth.users WHERE email = 'c3-driver@test.local'
        ON CONFLICT (id) DO NOTHING;
        UPDATE public.drivers SET verification_status = 'approved', status = 'active'
         WHERE id = (SELECT id FROM auth.users WHERE email = 'c3-driver@test.local');
    """,
    "FF-14": """
        INSERT INTO public.driver_bookings (driver_id, customer_id, rate_type, start_date, end_date, start_time, end_time, total_price, pickup_address)
        SELECT d.id, c.id, 'daily', x.day, x.day, '09:00', '18:00', 0, 'MG Road, Bengaluru'
          FROM auth.users d, auth.users c,
               LATERAL (SELECT current_date + 30 + 2 * count(*)::int AS day FROM public.driver_bookings WHERE driver_id = d.id) x
         WHERE d.email = 'c3-driver@test.local' AND c.email = 'c3-cust@test.local';
    """,
    "FF-15": """
        UPDATE public.driver_bookings SET status = 'confirmed'
         WHERE id = (SELECT b.id FROM public.driver_bookings b JOIN auth.users u ON u.id = b.customer_id
                      WHERE u.email = 'c3-cust@test.local' ORDER BY b.created_at DESC LIMIT 1);
    """,
    "FF-16": """
        SELECT set_config('request.jwt.claim.sub', id::text, false) FROM auth.users WHERE email = 'c3-cust@test.local';
        SELECT public.wallet_pay_driver_booking(b.id) FROM public.driver_bookings b JOIN auth.users u ON u.id = b.customer_id
         WHERE u.email = 'c3-cust@test.local' ORDER BY b.created_at DESC LIMIT 1;
        SELECT set_config('request.jwt.claim.sub', id::text, false) FROM auth.users WHERE email = 'c3-admin@test.local';
    """,
    "FF-17": """
        UPDATE public.driver_bookings
           SET start_date = ((now() + make_interval(hours => 5)) AT TIME ZONE 'Asia/Kolkata')::date,
               start_time = ((now() + make_interval(hours => 5)) AT TIME ZONE 'Asia/Kolkata')::time(0),
               end_date   = ((now() + make_interval(hours => 5)) AT TIME ZONE 'Asia/Kolkata')::date + 1
         WHERE id = (SELECT b.id FROM public.driver_bookings b JOIN auth.users u ON u.id = b.customer_id
                      WHERE u.email = 'c3-cust@test.local' ORDER BY b.created_at DESC LIMIT 1);
    """,
    "FF-18": """
        UPDATE public.driver_bookings SET status = 'completed'
         WHERE id = (SELECT b.id FROM public.driver_bookings b JOIN auth.users u ON u.id = b.customer_id
                      WHERE u.email = 'c3-cust@test.local' ORDER BY b.created_at DESC LIMIT 1);
    """,
    "FF-19": """
        INSERT INTO public.pool_trips (driver_id, vehicle_label, origin_label, origin_lat, origin_lng, dest_label, dest_lat, dest_lng,
                                       depart_at, seats_total, seats_available, fare_per_seat, notes)
        SELECT id, 'Hyundai Creta · White', 'Majestic, Bengaluru', 12.9767, 77.5713, 'Mysuru Palace, Mysuru', 12.3052, 76.6552,
               ((current_date + 2) + time '08:00') AT TIME ZONE 'Asia/Kolkata', 4, 4, 300, 'One cabin bag each'
          FROM auth.users WHERE email = 'c3-driver@test.local';
    """,
    "FF-20": """
        INSERT INTO public.pool_requests (trip_id, passenger_id, seats, pickup_label, pickup_lat, pickup_lng, drop_label, drop_lat, drop_lng,
                                          emergency_contact)
        SELECT t.id, c.id, 2, 'Majestic, Bengaluru', 12.9767, 77.5713, 'Mysuru Palace, Mysuru', 12.3052, 76.6552, '+91 9000000001'
          FROM public.pool_trips t JOIN auth.users d ON d.id = t.driver_id, auth.users c
         WHERE d.email = 'c3-driver@test.local' AND c.email = 'c3-cust@test.local'
         ORDER BY t.created_at DESC LIMIT 1;
    """,
    "FF-21": """
        UPDATE public.pool_requests SET status = 'confirmed'
         WHERE id = (SELECT r.id FROM public.pool_requests r JOIN auth.users u ON u.id = r.passenger_id
                      WHERE u.email = 'c3-cust@test.local' ORDER BY r.created_at DESC LIMIT 1);
    """,
    "FF-22": """
        UPDATE public.pool_trips SET status = 'completed'
         WHERE id = (SELECT t.id FROM public.pool_trips t JOIN auth.users d ON d.id = t.driver_id
                      WHERE d.email = 'c3-driver@test.local' ORDER BY t.created_at DESC LIMIT 1);
        UPDATE public.pool_requests SET status = 'completed'
         WHERE status = 'confirmed' AND trip_id = (SELECT t.id FROM public.pool_trips t JOIN auth.users d ON d.id = t.driver_id
                                                    WHERE d.email = 'c3-driver@test.local' ORDER BY t.created_at DESC LIMIT 1);
    """,
    "FF-23": """
        INSERT INTO public.cleaners (id, full_name, phone, city, service_area, experience_years)
        SELECT id, 'c3 Cleaner', '9876500003', 'Bengaluru', 'Koramangala, Indiranagar', 3 FROM auth.users WHERE email = 'c3-cleaner@test.local'
        ON CONFLICT (id) DO NOTHING;
        SELECT public.verify_cleaner(id, 'approved') FROM auth.users WHERE email = 'c3-cleaner@test.local';
    """,
    "FF-24": """
        INSERT INTO public.wash_centers (id, name, city, address, contact_phone, contact_email, daily_capacity)
        SELECT id, 'c3 Spa', 'Bengaluru', 'Plot 42, 100ft Road, Indiranagar', '9876500004', email, 15 FROM auth.users WHERE email = 'c3-center@test.local'
        ON CONFLICT (id) DO NOTHING;
        SELECT public.verify_wash_center(id, 'approved') FROM auth.users WHERE email = 'c3-center@test.local';
    """,
    "FF-25": """
        INSERT INTO public.wash_bookings (customer_id, service_id, city, address, vehicle_label, slot_date, slot_time, price)
        SELECT u.id, s.id, 'Bengaluru', '12 MG Road, Bengaluru', 'Hyundai i20 · KA01AB1234', current_date + 3, '10:00', 0
          FROM auth.users u, public.wash_services s WHERE u.email = 'c3-cust@test.local' AND s.name = 'Car Express Wash';
    """,
    "FF-26": """
        SELECT public.admin_decide_wash_booking(w.id, 'confirmed', (SELECT id FROM auth.users WHERE email = 'c3-center@test.local'))
          FROM public.wash_bookings w JOIN auth.users u ON u.id = w.customer_id
         WHERE u.email = 'c3-cust@test.local' ORDER BY w.created_at DESC LIMIT 1;
    """,
    "FF-27": """
        SELECT set_config('request.jwt.claim.sub', id::text, false) FROM auth.users WHERE email = 'c3-cust@test.local';
        SELECT public.wallet_pay_wash_booking(w.id) FROM public.wash_bookings w JOIN auth.users u ON u.id = w.customer_id
         WHERE u.email = 'c3-cust@test.local' ORDER BY w.created_at DESC LIMIT 1;
        SELECT set_config('request.jwt.claim.sub', id::text, false) FROM auth.users WHERE email = 'c3-admin@test.local';
    """,
    "FF-28": """
        UPDATE public.wash_bookings
           SET status = 'completed', progress = 'completed', after_photos = '{https://example.com/after.jpg}', completed_at = now()
         WHERE id = (SELECT w.id FROM public.wash_bookings w JOIN auth.users u ON u.id = w.customer_id
                      WHERE u.email = 'c3-cust@test.local' ORDER BY w.created_at DESC LIMIT 1);
    """,
    "FF-29": """
        UPDATE public.wash_bookings
           SET slot_date = ((now() + make_interval(hours => 5)) AT TIME ZONE 'Asia/Kolkata')::date,
               slot_time = ((now() + make_interval(hours => 5)) AT TIME ZONE 'Asia/Kolkata')::time(0)
         WHERE id = (SELECT w.id FROM public.wash_bookings w JOIN auth.users u ON u.id = w.customer_id
                      WHERE u.email = 'c3-cust@test.local' ORDER BY w.created_at DESC LIMIT 1);
    """,
    "FF-30": """
        SELECT public.wallet_apply(id, 1000, 'wash_earning', NULL, 'FF-30', 'Test earning (fast-forward)')
          FROM auth.users WHERE email = 'c3-cleaner@test.local';
    """,
    "FF-31": """
        INSERT INTO public.support_tickets (ticket_no, user_id, subject, category, priority, status, description)
        SELECT 'TKT-' || upper(substr(md5(random()::text), 1, 6)), id, 'Deposit refund inquiry', 'Billing', 'High', 'Open',
               'My deposit from last week has not come back.'
          FROM auth.users WHERE email = 'c3-cust@test.local';
    """,
    "FF-32": """
        INSERT INTO public.disputes (booking_id, raised_by, category, subject, detail)
        SELECT b.id, b.customer_id, 'damage', 'Scratch on rear bumper', 'Noticed a new scratch at pickup.'
          FROM public.bookings b JOIN auth.users u ON u.id = b.customer_id
         WHERE u.email = 'c3-cust@test.local' ORDER BY b.created_at DESC LIMIT 1;
    """,
    "FF-33": """
        UPDATE public.reviews SET reported = true, report_reason = 'Abusive language'
         WHERE id = (SELECT r.id FROM public.reviews r JOIN public.vehicles v ON v.id = r.vehicle_id
                      WHERE v.title = 'c3 Swift' ORDER BY r.created_at DESC LIMIT 1);
    """,
    "FF-34": """
        UPDATE public.profiles SET referred_by = (SELECT id FROM auth.users WHERE email = 'c3-cust@test.local'),
               dl_number = 'DL-03-2021-0000003', dl_expiry = current_date + 365, dl_status = 'approved'
         WHERE id = (SELECT id FROM auth.users WHERE email = 'c3-friend@test.local');
        INSERT INTO public.bookings (vehicle_id, vendor_id, customer_id, start_date, end_date, pickup_time, dropoff_time, base_price, total_price, status)
        SELECT v.id, v.vendor_id, f.id, d.day, d.day + 1, '10:00', '10:00', 0, 0, 'confirmed'
          FROM public.vehicles v, auth.users f,
               LATERAL (SELECT current_date + 30 + 3 * count(*)::int AS day FROM public.bookings WHERE vehicle_id = v.id) d
         WHERE v.title = 'c3 Swift' AND f.email = 'c3-friend@test.local';
        SELECT public.wallet_apply(id, 5000, 'topup', NULL, 'FF-34', 'Test credit (fast-forward)')
          FROM auth.users WHERE email = 'c3-friend@test.local';
    """,
    "FF-35": """
        INSERT INTO public.messages (booking_id, sender_id, body)
        SELECT b.id, b.vendor_id, 'Hi! Pickup is at the MG Road gate.'
          FROM public.bookings b JOIN auth.users u ON u.id = b.customer_id
         WHERE u.email = 'c3-cust@test.local' ORDER BY b.created_at DESC LIMIT 1;
    """,
    "FF-36": """
        SELECT public.notify_user(id, 'Test notice ' || n, 'Fast-forward notification ' || n, '/bookings')
          FROM auth.users, generate_series(1, 3) n WHERE email = 'c3-cust@test.local';
    """,
    "FF-37": """
        UPDATE public.bookings SET pickup_checked_at = now(), pickup_fuel_pct = NULL, pickup_odometer = NULL
         WHERE id = (SELECT b.id FROM public.bookings b JOIN auth.users u ON u.id = b.customer_id
                      WHERE u.email = 'c3-cust@test.local' ORDER BY b.created_at DESC LIMIT 1);
    """,
    "FF-38": """
        SELECT set_config('request.jwt.claim.sub', id::text, false) FROM auth.users WHERE email = 'c3-cust@test.local';
        SELECT public.request_booking_extension(b.id, 3, 'Traffic') FROM public.bookings b JOIN auth.users u ON u.id = b.customer_id
         WHERE u.email = 'c3-cust@test.local' ORDER BY b.created_at DESC LIMIT 1;
        SELECT set_config('request.jwt.claim.sub', id::text, false) FROM auth.users WHERE email = 'c3-admin@test.local';
    """,
    "FF-39": """
        SELECT set_config('request.jwt.claim.sub', id::text, false) FROM auth.users WHERE email = 'c3-host@test.local';
        SELECT public.decide_booking_extension(e.id, true) FROM public.booking_extensions e JOIN auth.users u ON u.id = e.customer_id
         WHERE u.email = 'c3-cust@test.local' ORDER BY e.created_at DESC LIMIT 1;
        SELECT set_config('request.jwt.claim.sub', id::text, false) FROM auth.users WHERE email = 'c3-admin@test.local';
    """,
    "FF-40": """
        UPDATE public.profiles SET dl_status = 'none', dl_number = NULL, dl_expiry = NULL, dl_front_url = NULL, dl_back_url = NULL,
               dl_verified_at = NULL, dl_rejection_reason = NULL
         WHERE id = (SELECT id FROM auth.users WHERE email = 'c3-cust@test.local');
    """,
    "FF-41": """
        UPDATE public.profiles SET dl_status = 'approved', dl_number = 'DL-03-2020-0000001', dl_expiry = current_date + 10
         WHERE id = (SELECT id FROM auth.users WHERE email = 'c3-cust@test.local');
    """,
    "FF-42": """
        UPDATE public.profiles SET dl_status = 'pending', dl_number = 'DL-03-2020-0000001', dl_expiry = current_date + 365,
               dl_front_url = id || '/dl-front.jpg', dl_back_url = id || '/dl-back.jpg', dl_rejection_reason = NULL
         WHERE id = (SELECT id FROM auth.users WHERE email = 'c3-cust@test.local');
    """,
    "FF-43": """
        UPDATE public.bookings SET status = 'rejected'
         WHERE id = (SELECT b.id FROM public.bookings b JOIN auth.users u ON u.id = b.customer_id
                      WHERE u.email = 'c3-cust@test.local' ORDER BY b.created_at DESC LIMIT 1) AND status = 'pending';
    """,
    "FF-44": """
        UPDATE public.disputes SET status = 'resolved', resolution = 'Host compensated, deposit kept', resolved_at = now(),
               resolved_by = (SELECT id FROM auth.users WHERE email = 'c3-admin@test.local')
         WHERE id = (SELECT d.id FROM public.disputes d JOIN auth.users u ON u.id = d.raised_by
                      WHERE u.email = 'c3-cust@test.local' ORDER BY d.created_at DESC LIMIT 1);
    """,
    "FF-45": """
        UPDATE public.drivers SET status = 'paused' WHERE id = (SELECT id FROM auth.users WHERE email = 'c3-driver@test.local');
    """,
    "FF-46": """
        UPDATE public.driver_bookings SET status = 'rejected'
         WHERE id = (SELECT b.id FROM public.driver_bookings b JOIN auth.users u ON u.id = b.customer_id
                      WHERE u.email = 'c3-cust@test.local' ORDER BY b.created_at DESC LIMIT 1) AND status = 'pending';
    """,
    "FF-47": """
        SELECT public.admin_decide_wash_booking(w.id, 'rejected', NULL, 'No washer available')
          FROM public.wash_bookings w JOIN auth.users u ON u.id = w.customer_id
         WHERE u.email = 'c3-cust@test.local' ORDER BY w.created_at DESC LIMIT 1;
    """,
    "FF-48": """
        INSERT INTO public.coupons (code, percent_off, active)
        SELECT 'c3SAVE20', 20, true WHERE NOT EXISTS (SELECT 1 FROM public.coupons WHERE code = 'c3SAVE20');
    """,
    "FF-49": """
        SELECT public.admin_grant_credit('c3-cust@test.local', 200, 'Sorry for the delay');
    """,
    "FF-50": """
        UPDATE public.support_tickets SET status = 'Resolved', resolution = 'Refund processed today.', updated_at = now()
         WHERE id = (SELECT t.id FROM public.support_tickets t JOIN auth.users u ON u.id = t.user_id
                      WHERE u.email = 'c3-cust@test.local' ORDER BY t.created_at DESC LIMIT 1);
    """,
    "FF-51": """
        SELECT set_config('request.jwt.claim.sub', id::text, false) FROM auth.users WHERE email = 'c3-cleaner@test.local';
        SELECT public.request_withdrawal(500, 'upi', 'pfxcleaner@okaxis');
        SELECT set_config('request.jwt.claim.sub', id::text, false) FROM auth.users WHERE email = 'c3-admin@test.local';
    """,
    "FF-52": """
        INSERT INTO public.vehicles (vendor_id, title, category, brand, model, year, city, address, lat, lng, price_daily, security_deposit,
                                     rc_url, insurance_url, pollution_url, verification_status, status)
        SELECT id, 'c3 Activa', 'scooter', 'Honda', 'Activa', 2024, 'Bengaluru', 'Indiranagar, Bengaluru', 12.97, 77.64, 400, 500,
               id || '/rc.jpg', id || '/ins.jpg', id || '/puc.jpg', 'pending', 'draft'
          FROM auth.users WHERE email = 'c3-host@test.local'
           AND NOT EXISTS (SELECT 1 FROM public.vehicles WHERE title = 'c3 Activa');
        UPDATE public.vehicles SET verification_status = 'pending', status = 'draft', rejection_reason = NULL WHERE title = 'c3 Activa';
    """,
    "FF-53": """
        INSERT INTO public.vendors (id, business_name, id_document_url, kyc_status)
        SELECT id, 'c3 Rider Rentals', id || '/id.jpg', 'pending' FROM auth.users WHERE email = 'c3-rider2@test.local'
        ON CONFLICT (id) DO UPDATE SET kyc_status = 'pending';
        INSERT INTO public.drivers (id, full_name, phone, city, experience_years, hourly_rate, daily_rate, dl_number, dl_expiry,
                                    dl_front_url, dl_back_url, id_document_url)
        SELECT id, 'c3 Rider Driver', '9876500005', 'Bengaluru', 2, 250, 1200, 'DL-03-2022-0000005', current_date + 365,
               id || '/f.jpg', id || '/b.jpg', id || '/id.jpg'
          FROM auth.users WHERE email = 'c3-rider2@test.local'
        ON CONFLICT (id) DO NOTHING;
        UPDATE public.drivers SET verification_status = 'pending', status = 'draft', rejection_reason = NULL
         WHERE id = (SELECT id FROM auth.users WHERE email = 'c3-rider2@test.local');
    """,
    "FF-54": """
        INSERT INTO public.cleaners (id, full_name, phone, city, service_area, experience_years)
        SELECT id, 'c3 Friend Cleaner', '9876500006', 'Bengaluru', 'HSR Layout', 2 FROM auth.users WHERE email = 'c3-friend@test.local'
        ON CONFLICT (id) DO NOTHING;
        INSERT INTO public.wash_centers (id, name, city, address, contact_phone, daily_capacity)
        SELECT id, 'c3 Wash Hub', 'Bengaluru', 'BTM Layout, Bengaluru', '9876500007', 10 FROM auth.users WHERE email = 'c3-friend@test.local'
        ON CONFLICT (id) DO NOTHING;
        UPDATE public.cleaners SET verification_status = 'pending' WHERE id = (SELECT id FROM auth.users WHERE email = 'c3-friend@test.local');
        UPDATE public.wash_centers SET verification_status = 'pending' WHERE id = (SELECT id FROM auth.users WHERE email = 'c3-friend@test.local');
    """,
    "FF-55": """
        UPDATE public.drivers SET verification_status = 'rejected', status = 'draft', rejection_reason = 'Licence photo unreadable'
         WHERE id = (SELECT id FROM auth.users WHERE email = 'c3-rider2@test.local');
    """,
    "FF-56": """
        SELECT public.verify_cleaner(id, 'rejected', 'Need equipment photos') FROM auth.users WHERE email = 'c3-friend@test.local';
        SELECT public.verify_wash_center(id, 'rejected', 'Address proof missing') FROM auth.users WHERE email = 'c3-friend@test.local';
    """,
    "FF-57": """
        SELECT set_config('request.jwt.claim.sub', id::text, false) FROM auth.users WHERE email = 'c3-cleaner@test.local';
        SELECT public.claim_wash_job(w.id) FROM public.wash_bookings w JOIN auth.users u ON u.id = w.customer_id
         WHERE u.email = 'c3-cust@test.local' ORDER BY w.created_at DESC LIMIT 1;
        SELECT set_config('request.jwt.claim.sub', id::text, false) FROM auth.users WHERE email = 'c3-admin@test.local';
    """,
    "FF-58": """
        SELECT set_config('request.jwt.claim.sub', id::text, false) FROM auth.users WHERE email = 'c3-cleaner@test.local';
        SELECT public.advance_wash_status(w.id, 'on_the_way') FROM public.wash_bookings w JOIN auth.users u ON u.id = w.customer_id
         WHERE u.email = 'c3-cust@test.local' ORDER BY w.created_at DESC LIMIT 1;
        SELECT public.advance_wash_status(w.id, 'started', ARRAY['https://example.com/before.jpg']) FROM public.wash_bookings w JOIN auth.users u ON u.id = w.customer_id
         WHERE u.email = 'c3-cust@test.local' ORDER BY w.created_at DESC LIMIT 1;
        SELECT set_config('request.jwt.claim.sub', id::text, false) FROM auth.users WHERE email = 'c3-admin@test.local';
    """,
    "FF-59": """
        INSERT INTO public.wash_reviews (wash_booking_id, customer_id, rating, comment)
        SELECT w.id, w.customer_id, 5, 'Spotless, on time' FROM public.wash_bookings w JOIN auth.users u ON u.id = w.customer_id
         WHERE u.email = 'c3-cust@test.local' AND w.status = 'completed'
           AND NOT EXISTS (SELECT 1 FROM public.wash_reviews r WHERE r.wash_booking_id = w.id)
         ORDER BY w.created_at DESC LIMIT 1;
    """,
    "FF-60": """
        INSERT INTO public.driver_reviews (driver_booking_id, driver_id, customer_id, rating, comment)
        SELECT b.id, b.driver_id, b.customer_id, 5, 'Smooth drive' FROM public.driver_bookings b JOIN auth.users u ON u.id = b.customer_id
         WHERE u.email = 'c3-cust@test.local' AND b.status = 'completed'
           AND NOT EXISTS (SELECT 1 FROM public.driver_reviews r WHERE r.driver_booking_id = b.id)
         ORDER BY b.created_at DESC LIMIT 1;
    """,
}

def execute_ff(ff_name):
    if ff_name not in FAST_FORWARDS:
        print(f"Unknown fast-forward: {ff_name}")
        return False
    sql = FAST_FORWARDS[ff_name]
    with connection.cursor() as c:
        try:
            c.execute("SELECT set_config('request.jwt.claim.sub', id::text, false) FROM auth.users WHERE email = 'c3-admin@test.local';")
            c.execute(sql)
            print(f"[{ff_name}] OK")
            return True
        except Exception as e:
            print(f"[{ff_name}] Error: {e}")
            return False

if __name__ == "__main__":
    if len(sys.argv) > 1:
        for arg in sys.argv[1:]:
            execute_ff(arg)
    else:
        print("Usage: python run_ff.py <FF-name> [FF-name...]")
