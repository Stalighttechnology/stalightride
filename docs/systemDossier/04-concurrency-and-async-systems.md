# Synchoo System Dossier — 04: Concurrency & Asynchronous Systems

## 1. The 5-Year-Old Explanation: "Two Kids, One Toy & The Magic Walkie-Talkie"

Imagine this:
- **The Concurrency Problem ("Two Kids Grabbing the Red Firetruck"):**
  - Timmy and Sarah both spot the same red firetruck on the shelf at the exact same second!
  - They both reach out their hands at the very same millisecond.
  - In a poorly run clubhouse, both kids think they have the firetruck. They pull, fight, and the toy breaks in half!
  - In Synchoo, the clubhouse has an invisible referee (**PostgreSQL Row Locks & Exclusion Constraints**). The referee freezes time for half a microsecond: *"Timmy's fingertip touched it first! Timmy gets the firetruck; Sarah gets a polite beep on her screen: 'Sorry, vehicle just taken!'"*
- **Sync vs. Async ("Standing in Line vs. The Magic Walkie-Talkie"):**
  - **Synchronous (Standing in Line):** You walk up to the ice cream counter, ask for chocolate, wait 10 seconds while the server scoops it, take your cone, and walk away. You stood there waiting the whole time.
  - **Asynchronous (The Magic Walkie-Talkie):** You ask for a big birthday cake that takes 3 hours to bake. You don't stand at the counter for 3 hours! You run outside and play soccer. The baker keeps a walkie-talkie in your pocket (**Django Channels WebSocket**). When the cake is ready, the walkie-talkie rings: *"Beep! Your cake is ready!"* You run in and pick it up!

---

## 2. Concurrency in Synchoo: Zero Double-Bookings Guarantee

In a peer-to-peer rental marketplace, preventing two people from booking the same car or driver for overlapping dates is life-or-death.

Synchoo uses a **two-layer defense**:
1. Application-level Pessimistic Locking (`SELECT ... FOR UPDATE`).
2. Database Engine-level Exclusion Constraints (`EXCLUDE USING gist`).

### 2.1 The Double-Booking Exclusion Constraint

Most applications rely on application code:
```python
# BROKEN APPROACH: Vulnerable to race conditions!
if not Booking.objects.filter(vehicle_id=vid, dates__overlap=selected).exists():
    Booking.objects.create(...) # RACE CONDITION: Another thread could insert here!
```
If two requests arrive at the same microsecond, both check `exists()`, both see `False`, and both insert!

In Synchoo (see `backend/core/migrations/0020_remediate_components_01_to_04_gaps.py`), this is enforced at the **PostgreSQL C-engine storage level**:

```sql
-- Exclusion constraint on vehicle bookings:
ALTER TABLE public.bookings
  ADD CONSTRAINT bookings_no_overlap
  EXCLUDE USING gist (
    vehicle_id WITH =,
    tsrange(start_date, end_date, '[]') WITH &&
  )
  WHERE (status IN ('confirmed', 'in_progress', 'pending'));
```
### Why this is mathematically unassailable:
Even if 1,000 requests hit the database at the exact same nanosecond, PostgreSQL's GiST index engine locks the index leaf page. Exactly one request succeeds; the remaining 999 are rejected by PostgreSQL with error code `23P01 (exclusion_violation)`.

In [backend/core/views.py](file:///C:/Users/gclik/Desktop/Projects/Stalight%20Technologies/stalightride/backend/core/views.py), this is translated into a user-friendly error message:
```python
CONSTRAINT_MESSAGES = {
    "bookings_no_overlap": "Vehicle not available for selected dates",
    "driver_bookings_no_overlap": "Driver is already booked for the selected dates",
    "wash_bookings_cleaner_slot_uniq": "You already have a wash job in this slot",
}
```

### 2.2 Pessimistic Row Locking (`SELECT ... FOR UPDATE`)

When updating money, trip status, or booking windows, multiple actors (customer, host, webhook, cron worker) may touch the same row simultaneously.

Look at how `wallet_pay_booking` locks rows:
```sql
-- 1. Lock the booking row: No other transaction can modify or pay it while we work
SELECT * INTO b FROM public.bookings WHERE id = _booking_id FOR UPDATE;

-- 2. Lock the user's wallet row: Prevents race conditions on balance deduction
SELECT balance INTO bal FROM public.wallets WHERE user_id = b.customer_id FOR UPDATE;
```
Any competing transaction trying to select that wallet `FOR UPDATE` will block until this transaction completes (`COMMIT` or `ROLLBACK`).

---

## 3. Synchronous vs. Asynchronous Workflows

```mermaid
flowchart TD
    subgraph Synchronous_Path ["Synchronous Path (Request-Response, Port 8000)"]
        Req[HTTP POST /api/query/ or /api/rpc/] --> MW[DbRoleMiddleware]
        MW --> Tx[Atomic DB Transaction]
        Tx --> SQL[Execute Query with RLS]
        SQL --> Res[Return HTTP 200 JSON]
    end

    subgraph Asynchronous_Path ["Asynchronous Path (Channels & Daphne)"]
        DB[(PostgreSQL)] -->|Trigger pg_notify| Listener[Django Channels LISTEN Task]
        Listener --> WS[WebSocket Consumer (/ws/)]
        WS --> Push[Instant Push to Browser]
    end

    subgraph Background_Path ["Scheduled Background Path (Cron)"]
        Cron[Scheduled Runner (send_reminders)] --> Every5Min[Every 5 Minutes]
        Every5Min --> ExpireWindows[expire_booking_windows()]
        Every5Min --> Reminders[generate_scheduled_reminders()]
    end
```

### 3.1 Synchronous Flow: The HTTP API
- **Characteristics:** Deterministic, linear, blocking.
- **Guarantee:** **One request = One atomic database transaction.**
- In `DbRoleMiddleware`:
  ```python
  with transaction.atomic():
      set_db_role("anon")
      response = self.get_response(request)
      if response.status_code >= 400:
          transaction.set_rollback(True)
  ```
  If any error occurs anywhere during request handling (HTTP 400, 403, 500), the entire transaction is rolled back. No partial writes can ever exist!

### 3.2 Asynchronous Flow: Realtime WebSockets (`/ws/`)
- Built on **Daphne ASGI** and **Django Channels**.
- Uses an event-driven `asyncio` loop.
- **The RLS-Security WebSocket Loop:**
  In many apps, WebSockets leak private data because they broadcast raw database events to all listeners.
  In Synchoo:
  1. Stored trigger `notify_change` issues:
     `PERFORM pg_notify('pgrst', json_build_object('table', TG_TABLE_NAME, 'id', NEW.id)::text);`
  2. The Python `Channels` consumer listens on `pgrst`.
  3. When an event fires for row `ID`, the consumer **queries PostgreSQL again as the connected user**:
     `SELECT * FROM bookings WHERE id = ID` (under `role = 'authenticated'`, `auth.uid() = socket.user_id`).
  4. If RLS returns empty (user is not authorized to see that row), the event is silently discarded! Only authorized parties receive the message!

### 3.3 Background Scheduled Tasks: `send_reminders`
Certain critical tasks cannot wait for a user to refresh their browser:
- Expiring bookings where the host didn't respond in time.
- Cancelling unassigned doorstep washes and auto-refunding customers.
- Sending 24-hour and 2-hour trip start notifications.

This runs every 5 minutes via:
```bash
python manage.py send_reminders
```
Inside [backend/core/management/commands/send_reminders.py](file:///C:/Users/gclik/Desktop/Projects/Stalight%20Technologies/stalightride/backend/core/management/commands/send_reminders.py):
1. Calls database RPC `generate_scheduled_reminders()`.
2. Calls database RPC `expire_booking_windows()`.
3. Handles corporate approval windows, release of unassigned wash jobs, and auto-refunds.
