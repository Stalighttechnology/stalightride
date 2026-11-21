"""Migration 0040: a booking's host is the vehicle owner, and only the host writes a review's reply."""

import uuid

from tests.test_booking_integrity import day, q, request, world  # noqa: F401  (world is a fixture)


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
