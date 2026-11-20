"""
Simultaneous Booking Test (Step 3.3 in docs/06-demo-walkthrough.md):
Asha and Ben both fill D+20 -> D+21 on Test Swift.
Count "3-2-1" and click Request to book at the same moment.
Expected:
  - Exactly one person sees: 200 OK -> "Booking requested!"
  - The other sees: 400 Bad Request -> "Vehicle not available for selected dates"
  - In the database: Exactly 1 booking is created.
"""

import json
import os
import sys
import threading
import time
import urllib.error
import urllib.request
import uuid
from datetime import date, timedelta
from pathlib import Path

# Setup Django environment
backend_dir = Path(__file__).resolve().parent.parent / "backend"
sys.path.insert(0, str(backend_dir))
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")

import django
django.setup()

from django.db import connection
from accounts.models import User

BASE_URL = "http://localhost:8000"

def get_or_setup_user(email, full_name, password="Test@1234"):
    user = User.objects.filter(email=email).first()
    if not user:
        user = User.objects.create_user(email=email, password=password, full_name=full_name)
    else:
        user.set_password(password)
        user.save()

    with connection.cursor() as cur:
        cur.execute(
            "UPDATE public.profiles SET dl_status = 'approved', dl_expiry = '2035-01-01' WHERE id = %s;",
            [user.id],
        )
        cur.execute(
            "INSERT INTO public.user_roles (user_id, role) VALUES (%s, 'customer') ON CONFLICT DO NOTHING;",
            [user.id],
        )
    return user

def login(email, password="Test@1234"):
    url = f"{BASE_URL}/api/auth/signin/"
    data = json.dumps({"email": email, "password": password}).encode("utf-8")
    req = urllib.request.Request(url, data=data, headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req) as resp:
        body = json.loads(resp.read().decode("utf-8"))
        token = body.get("session", {}).get("access_token")
        user_info = body.get("user", {})
        return token, user_info

def http_post_query(payload, token):
    url = f"{BASE_URL}/api/query/"
    data = json.dumps(payload).encode("utf-8")
    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {token}",
    }
    req = urllib.request.Request(url, data=data, headers=headers)
    t_start = time.perf_counter()
    try:
        with urllib.request.urlopen(req) as resp:
            t_end = time.perf_counter()
            content = resp.read().decode("utf-8")
            return resp.status, json.loads(content) if content else {}, (t_end - t_start)
    except urllib.error.HTTPError as e:
        t_end = time.perf_counter()
        body = e.read().decode("utf-8")
        try:
            parsed = json.loads(body)
        except Exception:
            parsed = {"raw": body}
        return e.code, parsed, (t_end - t_start)

def run_test():
    print("======================================================================")
    print("TEST 3.3: Asha and Ben Simultaneous Booking Test on Test Swift")
    print("D+20 -> D+21 concurrent request verification")
    print("======================================================================\n")

    # 1. Setup Asha and Ben
    asha = get_or_setup_user("customer1@test.synchoo.local", "Asha Customer")
    ben = get_or_setup_user("customer2@test.synchoo.local", "Ben Customer")

    token_asha, user_asha = login("customer1@test.synchoo.local")
    token_ben, user_ben = login("customer2@test.synchoo.local")

    print(f"[Asha] Signed in: id={user_asha.get('id')}, email=customer1@test.synchoo.local")
    print(f"[Ben]  Signed in: id={user_ben.get('id')}, email=customer2@test.synchoo.local")

    # 2. Find Test Swift
    with connection.cursor() as cur:
        cur.execute(
            "SELECT id, vendor_id, title, price_daily, security_deposit FROM public.vehicles WHERE title = 'Test Swift' AND status = 'active';"
        )
        row = cur.fetchone()
        if not row:
            # Fallback to any active approved vehicle
            cur.execute(
                "SELECT id, vendor_id, title, price_daily, security_deposit FROM public.vehicles WHERE status = 'active' AND verification_status = 'approved' LIMIT 1;"
            )
            row = cur.fetchone()

    assert row is not None, "No active approved vehicle found!"
    v_id, vendor_id, v_title, price_daily, deposit = row
    print(f"\n[Vehicle] Found: '{v_title}' (id={v_id}, vendor_id={vendor_id})")

    # 3. Dates D+20 and D+21
    d_start = str(date.today() + timedelta(days=20))
    d_end = str(date.today() + timedelta(days=21))
    print(f"[Dates]   D+20 = {d_start}, D+21 = {d_end}")

    # Clean any leftover bookings on these dates for this vehicle
    with connection.cursor() as cur:
        cur.execute(
            "DELETE FROM public.bookings WHERE vehicle_id = %s AND start_date <= %s AND end_date >= %s;",
            [v_id, d_end, d_start],
        )
    print("[Cleanup] Cleared any existing reservations overlapping this window.")

    # 4. Prepare concurrent requests
    barrier = threading.Barrier(2)
    results = {}

    def book_worker(name, customer_id, token):
        payload = {
            "table": "bookings",
            "action": "insert",
            "values": {
                "vehicle_id": str(v_id),
                "vendor_id": str(vendor_id),
                "customer_id": str(customer_id),
                "start_date": d_start,
                "end_date": d_end,
                "pickup_time": "10:00",
                "dropoff_time": "10:00",
                "base_price": float(price_daily),
                "security_deposit": float(deposit or 2000),
                "total_price": float(price_daily) + float(deposit or 2000),
                "status": "pending",
                "qr_code": str(uuid.uuid4()),
                "notes": f"Simultaneous booking test for {name}",
            },
            "select": "id, status, total_price",
        }
        # Synchronize execution: both threads wait until both reach this line
        barrier.wait()
        status_code, body, elapsed = http_post_query(payload, token)
        results[name] = {
            "status_code": status_code,
            "body": body,
            "elapsed_ms": round(elapsed * 1000, 2),
        }

    t1 = threading.Thread(target=book_worker, args=("Asha", asha.id, token_asha))
    t2 = threading.Thread(target=book_worker, args=("Ben", ben.id, token_ben))

    print("\nCounting 3... 2... 1... CLICK! Sending both requests simultaneously...")
    t1.start()
    t2.start()
    t1.join(30)
    t2.join(30)

    # 5. Evaluate Results
    print("\n================== RESULTS ==================")
    for name, r in sorted(results.items()):
        msg = r["body"].get("message") or (r["body"].get("data") and "Booking requested! (HTTP 200 OK)")
        print(f"[{name}] HTTP {r['status_code']} in {r['elapsed_ms']}ms -> Message: {msg}")

    # Check database
    with connection.cursor() as cur:
        cur.execute(
            """SELECT b.id, b.customer_id, u.email, b.status, b.start_date, b.end_date 
               FROM public.bookings b 
               JOIN auth.users u ON u.id = b.customer_id 
               WHERE b.vehicle_id = %s AND b.start_date = %s AND b.end_date = %s;""",
            [v_id, d_start, d_end],
        )
        db_bookings = cur.fetchall()

    print(f"\n[Database Verification] Total bookings created in database: {len(db_bookings)}")
    for b in db_bookings:
        print(f"  Booking id: {b[0]}, Customer: {b[2]} ({b[1]}), Status: {b[3]}")

    # Assertions
    statuses = sorted([results["Asha"]["status_code"], results["Ben"]["status_code"]])
    assert statuses == [200, 400], f"Expected exactly one 200 and one 400, got: {statuses}"

    winner = "Asha" if results["Asha"]["status_code"] == 200 else "Ben"
    loser = "Ben" if winner == "Asha" else "Asha"

    assert len(db_bookings) == 1, f"Expected exactly 1 booking in database, found {len(db_bookings)}"
    assert results[loser]["body"].get("message") == "Vehicle not available for selected dates", \
        f"Expected loser error 'Vehicle not available for selected dates', got {results[loser]['body']}"

    print("\n" + "=" * 60)
    print(f"TEST 3.3: PASS!")
    print(f"Winner: {winner} -> Sees 'Booking requested!' (HTTP 200)")
    print(f"Refused: {loser} -> Sees 'Vehicle not available for selected dates' (HTTP 400)")
    print(f"Database Integrity: Exactly 1 reservation created on {v_title} for {d_start} -> {d_end}")
    print("=" * 60 + "\n")

if __name__ == "__main__":
    run_test()
