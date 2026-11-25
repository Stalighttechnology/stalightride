# Track 01: PostgreSQL & The Database Rules Engine (From Basics to Master)

In Synchoo, **all core business rules live in PostgreSQL 17**. If you master this track, you understand 70% of the entire application architecture.

---

## 1. The Core Basics (Zero Prerequisites)

### What is a Relational Database?
Think of a database like a digital filing cabinet filled with Excel sheets called **Tables**:
* A table has columns (e.g., `name`, `price`, `status`) and rows (each row is one item, like a Toyota Innova).
* In a *relational* database, tables can reference each other using **Foreign Keys** (e.g., a `booking` references the `vehicle_id` of the car being rented).

### What is SQL?
**SQL (Structured Query Language)** is the universal language used to ask questions and store information in tables:
* `SELECT * FROM vehicles WHERE city = 'Bengaluru';` (Read)
* `INSERT INTO profiles (full_name) VALUES ('Bruce Wayne');` (Create)
* `UPDATE bookings SET status = 'confirmed' WHERE id = '...';` (Modify)
* `DELETE FROM reviews WHERE id = '...';` (Delete)

---

## 2. Intermediate Concepts: Constraints & Transactions

### 2.1 What is a Database Transaction? (ACID)
Imagine transferring ₹1,000 from Alex's wallet to Sam's wallet. Two things must happen:
1. Deduct ₹1,000 from Alex.
2. Add ₹1,000 to Sam.

What if the server crashes right between step 1 and step 2? Alex lost ₹1,000, and Sam got nothing!
A **Transaction (`BEGIN ... COMMIT`)** guarantees that either **both steps succeed**, or **everything is cancelled (Rollback)**. Money is never lost!

### 2.2 What are Database Triggers & Stored Procedures?
* **Function (Stored Procedure):** A piece of code written in SQL (or PL/pgSQL) that runs directly inside the database at lightning speed.
* **Trigger:** An automatic listener attached to a table. For example: *"Whenever someone inserts a new user, automatically create a blank wallet row for them!"*

---

## 3. Advanced Synchoo Concepts: RLS & Exclusion Constraints

### 3.1 Row-Level Security (RLS)
In normal apps, your backend Python code decides if a user can see a row. If a junior developer forgets to check `where user_id = current_user`, a customer might see other people's private bookings!
In Synchoo, **PostgreSQL itself blocks unauthorized rows**:
```sql
CREATE POLICY "Parties view booking" ON public.bookings
  FOR SELECT TO authenticated
  USING (auth.uid() = customer_id OR auth.uid() = vendor_id);
```
Even if your Python code runs `SELECT * FROM bookings;`, PostgreSQL will ONLY return the rows belonging to that specific user!

### 3.2 Exclusion Constraints (`EXCLUDE USING gist`)
How do we mathematically prevent two users from booking the exact same car for overlapping dates?
Synchoo uses a GiST index with time ranges:
```sql
ALTER TABLE public.bookings
  ADD CONSTRAINT bookings_no_overlap
  EXCLUDE USING gist (
    vehicle_id WITH =,
    tsrange(start_date, end_date, '[]') WITH &&
  );
```
PostgreSQL's storage engine locks the index leaf. Even if two people click "Book" at the exact same millisecond, the second insert is physically blocked with error `23P01`.

---

## 4. Where This Lives in the Synchoo Codebase

* `backend/sql/schema.sql`: The master database schema containing tables, foreign keys, triggers, and RLS policies.
* `backend/core/migrations/`: Database migration files (e.g., `0020_remediate_components_01_to_04_gaps.py` for exclusion constraints, `0038_corporate_accounts.py` for corporate travel).
* `backend/core/db.py`: Python module that switches database roles (`anon`, `authenticated`, `service_role`).

---

## 5. Step-by-Step Learning Checklist

- [ ] **Step 1:** Learn basic SQL syntax (`SELECT`, `INSERT`, `UPDATE`, `DELETE`, `JOIN`, `GROUP BY`).
- [ ] **Step 2:** Understand Primary Keys, Foreign Keys, and Database Normalization (1NF, 2NF, 3NF).
- [ ] **Step 3:** Master ACID Transactions (`BEGIN`, `COMMIT`, `ROLLBACK`, Savepoints).
- [ ] **Step 4:** Write your first PL/pgSQL function and Trigger (`CREATE OR REPLACE FUNCTION ...`).
- [ ] **Step 5:** Learn Row-Level Security (`ALTER TABLE ... ENABLE ROW LEVEL SECURITY; CREATE POLICY ...`).
- [ ] **Step 6:** Inspect `backend/sql/schema.sql` and understand how `wallet_apply()` works.

---

## 6. Curated Learning Resources

* 🔗 [Watch: PostgreSQL Full Course for Beginners (FreeCodeCamp)](https://www.youtube.com/results?search_query=FreeCodeCamp+PostgreSQL+Full+Course+for+Beginners)
  * *Best for:* Learning SQL syntax from absolute ground zero.
* 🔗 [Watch: Relational Database ACID Transactions Explained (Hussein Nasser)](https://www.youtube.com/results?search_query=Hussein+Nasser+ACID+Transactions+Explained)
  * *Best for:* Visualizing transactions, rollbacks, and isolation guarantees.
* 🔗 [Watch: PostgreSQL Row Level Security (RLS) Deep Dive (Supabase)](https://www.youtube.com/results?search_query=Supabase+Postgres+Row+Level+Security+Deep+Dive)
  * *Best for:* Understanding multi-tenant security and `auth.uid()`.
* 📖 [Read: PostgreSQL Official Documentation (DDL & Row Security)](https://www.postgresql.org/docs/current/ddl-rowsecurity.html)
