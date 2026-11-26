# Stage 2: OS Concurrency, Database Engines & ACID Transactions

Before you can understand **"Double Bookings"**, **"Pessimistic Row Locking (`FOR UPDATE`)"**, or **"Exclusion Constraints"**, you must understand how computers handle simultaneous tasks.

---

## 1. Operating Systems: Processes, Threads & Shared Memory

### What is a Process?
A **Process** is an independent running program (e.g., one instance of Django). It has its own private memory space allocated by the Operating System. Process A cannot accidentally overwrite variables in Process B.

### What is a Thread?
A **Thread** is a lightweight worker *inside* a process. Multiple threads share the exact same memory space:
* **The Danger (Race Conditions):** If Thread 1 and Thread 2 both execute `balance = balance + 10` on the same memory address at the same nanosecond, one update is lost!

```
[ Process Memory Space ]
   ├── Variable: balance = 100
   ├── Thread 1 (Reads 100, computes 110) ──┐ (Race Condition!)
   └── Thread 2 (Reads 100, computes 105) ──┴── Result: 105 (Thread 1 update is LOST!)
```

### Critical Sections & Mutexes (Locks)
To prevent lost updates, we create a **Mutex (Mutual Exclusion Lock)**:
* Thread 1 grabs the key to the room (**Acquire Lock**).
* Thread 2 tries to enter, sees the door is locked, and **waits**.
* Thread 1 finishes writing `balance = 110` and releases the key (**Release Lock**).
* Thread 2 enters, reads the new value `110`, and adds its money safely.

---

## 2. Relational Database Foundations & SQL

### Why Relational Databases?
Instead of saving files as messy JSON blobs on disk, a Relational Database enforces mathematical structure based on **Relational Algebra**:
* **Tables (Relations):** A collection of structured records.
* **Primary Key:** A unique identifier for every row (e.g. UUID `a4f89d32...`).
* **Foreign Key:** A reference linking two tables (e.g., `bookings.customer_id REFERENCES profiles.id`).
* **Joins:** Combining related tables in a single query:
  ```sql
  SELECT bookings.id, profiles.full_name, vehicles.title
  FROM bookings
  JOIN profiles ON bookings.customer_id = profiles.id
  JOIN vehicles ON bookings.vehicle_id = vehicles.id;
  ```

---

## 3. ACID Transactions: The Gold Standard of Reliability

A **Database Transaction** is a sequence of SQL commands executed as a single, indivisible unit. It must satisfy **ACID**:

| Letter | Property | What it Means in Real Life |
|:---:|---|---|
| **A** | **Atomicity** | *"All or Nothing."* If a transaction has 5 steps and step 4 fails, steps 1, 2, and 3 are automatically rolled back. No partial half-written records ever exist! |
| **C** | **Consistency** | The database can never violate its rules (e.g. `balance >= 0`, foreign keys must exist). If an operation breaks a rule, it is rejected. |
| **I** | **Isolation** | Transactions running concurrently do not interfere with or corrupt each other. |
| **D** | **Durability** | Once a transaction commits, its data is safely written to disk (via WAL - Write Ahead Logging). Even if the power plug is pulled 1 millisecond later, the data is safe! |

---

## 4. Transaction Anomalies & Isolation Levels

When thousands of users use Synchoo at once, what happens when transactions overlap?

### 4.1 The 3 Classic Concurrency Anomalies
1. **Dirty Read:** Transaction B reads changes made by Transaction A *before* Transaction A has committed. If Transaction A rolls back, Transaction B acted on data that never existed!
2. **Non-Repeatable Read:** Transaction A reads a row (`price = 100`). Transaction B updates that row (`price = 200`) and commits. Transaction A reads the row again and sees a different price!
3. **Phantom Read:** Transaction A counts all available cars (`count = 5`). Transaction B inserts a new car and commits. Transaction A queries again and sees 6 cars!

### 4.2 The SQL Isolation Levels

| Isolation Level | Dirty Reads? | Non-Repeatable Reads? | Phantom Reads? |
|---|:---:|:---:|:---:|
| **Read Uncommitted** | ❌ Allowed | ❌ Allowed | ❌ Allowed |
| **Read Committed** *(PostgreSQL Default)* | ✅ Prevented | ❌ Allowed | ❌ Allowed |
| **Repeatable Read** | ✅ Prevented | ✅ Prevented | ❌ Allowed |
| **Serializable** | ✅ Prevented | ✅ Prevented | ✅ Prevented |

---

## 5. How Synchoo Solves Concurrency: Row Locks & Exclusion Constraints

Synchoo uses **PostgreSQL 17** with two powerful mechanisms:

### 5.1 Pessimistic Row Locking (`SELECT ... FOR UPDATE`)
When paying for a booking or topping up a wallet in [`backend/payments/views.py`](file:///C:/Users/gclik/Desktop/Projects/Stalight%20Technologies/stalightride/backend/payments/views.py):
```sql
SELECT * FROM public.wallet_topups WHERE razorpay_order_id = %s FOR UPDATE;
```
PostgreSQL puts an exclusive lock on that specific row. If another webhook or user click hits at the exact same millisecond, it is forced to wait in line.

### 5.2 Exclusion Constraints (`EXCLUDE USING gist`)
In [`backend/core/migrations/0020_remediate_components_01_to_04_gaps.py`](file:///C:/Users/gclik/Desktop/Projects/Stalight%20Technologies/stalightride/backend/core/migrations/0020_remediate_components_01_to_04_gaps.py):
```sql
ALTER TABLE public.bookings
  ADD CONSTRAINT bookings_no_overlap
  EXCLUDE USING gist (
    vehicle_id WITH =,
    tsrange(start_date, end_date, '[]') WITH &&
  );
```
Even if 1,000 requests hit the server simultaneously, PostgreSQL's index engine mathematically guarantees that **overlapping time ranges for the same vehicle cannot be inserted**.

---

## 6. Curated CS Learning Resources

* 🔗 [Watch: Database Isolation Levels, Concurrency & Row Locks (Hussein Nasser)](https://www.youtube.com/results?search_query=Hussein+Nasser+Database+Isolation+Levels)
  * *The definitive masterclass on isolation levels and database locking.*
* 🔗 [Watch: Relational Database ACID Transactions Explained (Hussein Nasser)](https://www.youtube.com/results?search_query=Hussein+Nasser+ACID+Transactions+Explained)
  * *Best for:* Visualizing Atomicity, WAL logs, and Rollbacks.
* 🔗 [Watch: Concurrency & Race Conditions in System Design (ByteByteGo)](https://www.youtube.com/results?search_query=ByteByteGo+Concurrency+Race+Conditions)
  * *Best for:* Understanding Mutexes, semaphores, and inventory booking race conditions.
