# Track 05: Concurrency, Async Systems & Realtime WebSockets (From Basics to Master)

In high-traffic marketplaces, managing simultaneous user interactions without race conditions or server bottlenecks is essential.

---

## 1. The Core Basics (Zero Prerequisites)

### What is Concurrency?
Concurrency means multiple tasks running in overlapping time periods:
* **The Problem:** If User A and User B both tap "Book Vehicle" for the exact same car at 10:00:00.001 AM, which one gets it? Without concurrency controls, both are charged, and both expect the keys!

### What is Synchronous vs. Asynchronous?
* **Synchronous (Linear & Blocking):** You ask a question, you stand and wait until the answer arrives. (Like standard HTTP APIs: `POST /api/query/` waits for PostgreSQL to reply).
* **Asynchronous (Non-Blocking & Event-Driven):** You place an order, you walk away to do other work, and when your order is ready, a buzzer in your pocket beeps! (Like WebSockets and background cron tasks).

---

## 2. Intermediate Concepts: Row Locks & WebSockets

### 2.1 Pessimistic Row Locking (`SELECT ... FOR UPDATE`)
When multiple processes want to modify the same wallet or booking at the same second:
```sql
SELECT balance FROM public.wallets WHERE user_id = '...' FOR UPDATE;
```
`FOR UPDATE` places a temporary lock on that specific database row. Any other transaction trying to read or write that row will pause until the first transaction calls `COMMIT` or `ROLLBACK`.

### 2.2 WebSockets vs. HTTP Polling
* **Old Polling:** The browser asks the server every 2 seconds: *"Any new messages? No. Any new messages? No."* (Wastes battery and network).
* **Persistent WebSockets (`ws://`):** The browser and server open a persistent two-way pipe. The server pushes updates down the pipe the exact millisecond they happen!

---

## 3. Advanced Synchoo Concepts: Daphne ASGI & The PostgreSQL Notification Bus

Synchoo implements a secure, scalable real-time architecture:

```
[ PostgreSQL Trigger ] ──► pg_notify('pgrst', row_id)
                                    │
                                    ▼
                     [ Daphne ASGI Consumer ]
                                    │ (Queries row again as CONNECTED USER to apply RLS)
                                    ▼
                     [ User's WebSocket Browser ]
```

### 3.1 The RLS Security Filter on WebSockets
Most WebSockets accidentally leak private data by broadcasting raw events. In Synchoo, when PostgreSQL fires `pg_notify`:
1. The Channels worker in [`backend/realtime/consumers.py`](file:///C:/Users/gclik/Desktop/Projects/Stalight%20Technologies/stalightride/backend/realtime/consumers.py) catches the event.
2. It **queries the row again as the connected user** (`role = 'authenticated'`).
3. If PostgreSQL's Row-Level Security policy blocks the user, the event is silently dropped! Only authorized users receive updates!

### 3.2 Scheduled Background Tasks (`send_reminders.py`)
Certain actions cannot wait for user interaction (e.g. expiring unanswered booking windows, auto-refunding unclaimed washes).
A background runner executes every 5 minutes:
```bash
python manage.py send_reminders
```
It runs `expire_booking_windows()`, unlocking reserved vehicles and notifying both parties automatically.

---

## 4. Where This Lives in the Synchoo Codebase

* `backend/realtime/consumers.py`: Channels WebSocket consumer handling live chat, notifications, and location tracking.
* `backend/config/asgi.py`: ASGI application routing HTTP to Django and WebSockets to Channels.
* `backend/core/management/commands/send_reminders.py`: Scheduled task runner for booking expirations.
* `frontend/src/lib/api.ts`: Client `api.channel()` subscription wrapper.

---

## 5. Step-by-Step Learning Checklist

- [ ] **Step 1:** Learn the difference between processes, threads, and async event loops (`asyncio` in Python).
- [ ] **Step 2:** Experiment with PostgreSQL `SELECT ... FOR UPDATE` in two separate terminal windows.
- [ ] **Step 3:** Understand Deadlocks and how database transaction isolation prevents them.
- [ ] **Step 4:** Build a simple WebSocket connection using Python websockets or Node.js.
- [ ] **Step 5:** Learn how Django Channels, Daphne, and ASGI work together.
- [ ] **Step 6:** Inspect `backend/realtime/consumers.py` to see how `pg_notify` translates to WebSocket events.

---

## 6. Curated Learning Resources

* 🔗 [Watch: Database Isolation Levels & Row Locks (Hussein Nasser)](https://www.youtube.com/results?search_query=Hussein+Nasser+Database+Isolation+Levels)
  * *Best for:* Mastering `FOR UPDATE` and concurrency anomalies.
* 🔗 [Watch: WebSockets vs HTTP Explained (Hussein Nasser)](https://www.youtube.com/results?search_query=Hussein+Nasser+WebSockets+vs+HTTP)
  * *Best for:* Understanding duplex connections vs polling.
* 🔗 [Watch: Django Channels & WebSockets Crash Course (Dennis Ivy / FreeCodeCamp)](https://www.youtube.com/results?search_query=Django+Channels+Dennis+Ivy+WebSockets)
  * *Best for:* Hands-on setup of ASGI, consumers, and channel layers.
* 🔗 [Watch: PostgreSQL LISTEN and NOTIFY Explained (Hussein Nasser)](https://www.youtube.com/results?search_query=Hussein+Nasser+Postgres+LISTEN+NOTIFY)
  * *Best for:* Database-driven pub/sub messaging architectures.
