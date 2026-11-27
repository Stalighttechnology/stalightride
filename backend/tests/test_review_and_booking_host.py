"""Migration 0040: a booking's host is the vehicle owner, and only the host writes a review's reply."""

import uuid

from tests.test_booking_integrity import day, q, request, world, login  # noqa: F401  (world is a fixture)


def update_review(client, review_id, values):
    return client.post("/api/query/", {"table": "reviews", "action": "update", "select": "id",
                                       "filters": [["id", "eq", str(review_id)]], "values": values}, format="json")


def test_booking_host_is_always_the_vehicle_owner(world):
    res = request(world, world.c, world.cust, vendor_id=str(world.cust2.id))
    assert res.status_code == 200
    assert q("SELECT vendor_id FROM public.bookings WHERE customer_id = %s", [world.cust.id]) == [(world.host.id,)]


def test_only_the_host_replies_to_a_review(world):
    booking, review = uuid.uuid4(), uuid.uuid4()
    q("""INSERT INTO public.bookings (id, vehicle_id, vendor_id, customer_id, start_date, end_date,
                                      base_price, total_price, status)
         VALUES (%s, %s, %s, %s, %s, %s, 2000, 2000, 'completed')""",
      [booking, world.vehicle, world.host.id, world.cust.id, day(-3), day(-2)])
    q("""INSERT INTO public.reviews (id, booking_id, vehicle_id, customer_id, rating)
         VALUES (%s, %s, %s, %s, 4)""", [review, booking, world.vehicle, world.cust.id])

    fake = update_review(world.c, review, {"vendor_response": "Great renter!"})
    assert fake.status_code == 400 and fake.json()["message"] == "Only the host can reply to a review"
    moved = update_review(world.c, review, {"vehicle_id": str(uuid.uuid4())})
    assert moved.status_code == 400

    assert update_review(world.c, review, {"rating": 5}).json()["data"] == [{"id": str(review)}]
    assert update_review(world.h, review, {"vendor_response": "Thanks!"}).json()["data"] == [{"id": str(review)}]
    assert update_review(world.c2, review, {"vendor_response": "spam"}).json()["data"] == []
    assert q("SELECT rating, vendor_response FROM public.reviews WHERE id = %s", [review]) == [(5, "Thanks!")]


def update_driver_review(client, review_id, values):
    return client.post("/api/query/", {"table": "driver_reviews", "action": "update", "select": "id",
                                        "filters": [["id", "eq", str(review_id)]], "values": values}, format="json")


def test_only_the_driver_replies_to_a_driver_review(world):
    from django.contrib.auth import get_user_model
    from rest_framework.test import APIClient
    User = get_user_model()
    q("RESET ROLE")
    driver_user = User.objects.create_user("driver_reply_test@example.com", "secret123", full_name="Driver Joe")
    q("""INSERT INTO public.drivers (id, full_name, city, experience_years, daily_rate, hourly_rate, dl_number, dl_expiry)
         VALUES (%s, 'Driver Joe', 'Bengaluru', 5, 1500, 300, 'DL123', CURRENT_DATE + 365)""", [driver_user.id])
    q("SELECT set_config('role', 'authenticated', true), set_config('request.jwt.claim.sub', %s, true)", [str(world.admin.id)])
    q("UPDATE public.drivers SET verification_status = 'approved', status = 'active' WHERE id = %s", [driver_user.id])
    q("RESET ROLE")

    d_client = login(driver_user)
    hire, review = uuid.uuid4(), uuid.uuid4()
    q("""INSERT INTO public.driver_bookings (id, driver_id, customer_id, start_date, end_date, start_time, end_time,
                                            hours, days, total_price, status, payment_status)
         VALUES (%s, %s, %s, %s, %s, '10:00:00', '18:00:00', 8, 1, 1500, 'completed', 'paid')""",
      [hire, driver_user.id, world.cust.id, day(1), day(1)])
    q("""INSERT INTO public.driver_reviews (id, driver_booking_id, driver_id, customer_id, rating, comment)
         VALUES (%s, %s, %s, %s, 5, 'Great driver')""",
      [review, hire, driver_user.id, world.cust.id])

    fake = update_driver_review(world.c, review, {"driver_response": "Thank you customer!"})
    assert fake.status_code == 400 and fake.json()["message"] == "Only the driver can reply to a review"

    res = update_driver_review(d_client, review, {"driver_response": "My pleasure!"})
    assert res.status_code == 200
    assert q("SELECT driver_response FROM public.driver_reviews WHERE id = %s", [review]) == [("My pleasure!",)]


