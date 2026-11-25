# Synchoo System Dossier — 08: "One-Shot" Video Guides & Masterclass Resources

This curated guide provides the highest-yield, production-grade video masterclasses, crash courses, and authoritative engineering resources to "one-shot" every core technology and architectural pattern used across Synchoo.

---

## 1. Authentication, RBAC & PostgreSQL Row-Level Security (RLS)

Master how JWTs, role hierarchies, and database-level security policies work:

* **PostgreSQL Row Level Security (RLS) Complete Deep Dive** (Hussein Nasser)
  * [Watch on YouTube](https://www.youtube.com/watch?v=F_fP_0A9iN8)
  * *Why watch:* Explains `CREATE POLICY`, `auth.uid()`, multi-tenant security, and how RLS protects data at the storage layer without application-code leaks.
* **Authentication vs Authorization Explained in 100 Seconds** (Fireship)
  * [Watch on YouTube](https://www.youtube.com/watch?v=1rYw_44oTlg)
  * *Why watch:* High-level mental model of AuthN vs AuthZ, tokens, and cookies.
* **JSON Web Tokens (JWT) Explained & Best Practices** (ByteByteGo)
  * [Watch on YouTube](https://www.youtube.com/watch?v=7Q17ubqL20U)
  * *Why watch:* Covers access vs refresh tokens, token rotation, stateless authentication, and cryptographic signing.
* **Role-Based Access Control (RBAC) Architecture** (Web Dev Simplified)
  * [Watch on YouTube](https://www.youtube.com/watch?v=jI4K7L-LI88)
  * *Why watch:* Clean visual walkthrough of permissions, roles, and authorization gates.

---

## 2. Concurrency, Database Locking & Exclusion Constraints

Learn how to prevent double bookings, race conditions, and deadlocks:

* **Database Isolation Levels, Concurrency & Row Locks Explained** (Hussein Nasser)
  * [Watch on YouTube](https://www.youtube.com/watch?v=4EajrPgJAcw)
  * *Why watch:* Deep dive into `SELECT ... FOR UPDATE`, pessimistic vs optimistic locking, phantom reads, and ACID transactions.
* **Race Conditions & Concurrency in System Design** (ByteByteGo)
  * [Watch on YouTube](https://www.youtube.com/watch?v=VdtSg1i_y80)
  * *Why watch:* Real-world examples of simultaneous inventory booking and how to handle them.
* **PostgreSQL Range Types and Exclusion Constraints (`EXCLUDE USING gist`)** (PostgreSQL Tutorial)
  * [Official Documentation & Guide](https://www.postgresql.org/docs/current/rangetypes.html)
  * *Why read:* The exact mechanism Synchoo uses (`bookings_no_overlap`) to prevent two users from booking the same car at the same millisecond.

---

## 3. FinTech Payment Consistency, Idempotency & Razorpay

Master double-entry ledgers, idempotency keys, and payment webhook reconciliation:

* **What is Idempotency & Why is it Critical in Payments?** (ByteByteGo)
  * [Watch on YouTube](https://www.youtube.com/watch?v=hG9Zg2eY_Cg)
  * *Why watch:* How Stripe and Razorpay guarantee you never double-charge a customer, even when networks disconnect or users double-click.
* **How Payment Systems Work (System Design Architecture)** (ByteByteGo)
  * [Watch on YouTube](https://www.youtube.com/watch?v=olfaBgJ4vSo)
  * *Why watch:* Payment gateway integration, payment status state-machines, ledger entries, and webhook reconciliation.
* **Designing a Double-Entry Ledger System** (Hussein Nasser)
  * [Watch on YouTube](https://www.youtube.com/watch?v=xM_4W1E83F0)
  * *Why watch:* Why balances must never be plain number overwrites, and how atomic append-only ledgers guarantee zero money loss.
* **Razorpay Payment Gateway & Webhook Signature Verification Guide** (Razorpay Docs)
  * [Razorpay Integration Architecture](https://razorpay.com/docs/payments/payment-gateway/web-integration/standard/)
  * *Why read:* Explains order creation (`amount` in paise), HMAC-SHA256 signature verification, and asynchronous webhooks.

---

## 4. Async, Sync, WebSockets & Django Channels

Understand real-time asynchronous streaming versus synchronous transactional execution:

* **WebSockets vs HTTP: Everything You Need to Know** (Hussein Nasser)
  * [Watch on YouTube](https://www.youtube.com/watch?v=2Nt-ZrNP22o)
  * *Why watch:* The differences between synchronous request-response cycles and persistent, duplex asynchronous WebSocket connections.
* **Django Channels & WebSockets Crash Course** (Dennis Ivy / FreeCodeCamp)
  * [Watch on YouTube](https://www.youtube.com/watch?v=cw8-KFVXpTE)
  * *Why watch:* How ASGI (Daphne), consumers, channel layers, and WebSockets fit into a Django project.
* **PostgreSQL `LISTEN` and `NOTIFY` Explained** (Hussein Nasser)
  * [Watch on YouTube](https://www.youtube.com/watch?v=uK8f-C0v89w)
  * *Why watch:* The exact pub/sub engine used in Synchoo to push table changes from PostgreSQL triggers directly to WebSockets.

---

## 5. Declarative APIs & Modern Backend Architecture

Learn how Synchoo's query engine (`core/query.py`) and RPC engine replace hundreds of REST endpoints:

* **REST vs GraphQL vs RPC (gRPC / Stored Procedures)** (ByteByteGo)
  * [Watch on YouTube](https://www.youtube.com/watch?v=IvsANO0qZEg)
  * *Why watch:* Compares REST, GraphQL, and RPC paradigms to understand why Synchoo uses declarative queries plus stored procedure RPCs.
* **Building a Declarative SQL Query Builder** (ArjanCodes)
  * [Watch on YouTube](https://www.youtube.com/watch?v=0k5iZ2u_C3A)
  * *Why watch:* Explains how to parse query intent, validate schemas against SQL catalogs, and safely bind parameters without SQL injection.

---

## 6. Enterprise Workflows & Approval Windows (Corporate Travel)

Master state-machines, manager approvals, and automated timeout windows:

* **State Machine Design Pattern & Workflow Engines** (Continuous Delivery)
  * [Watch on YouTube](https://www.youtube.com/watch?v=E4ms_aZq65E)
  * *Why watch:* How to model workflows (`pending` $\to$ `approved` $\to$ `expired`) with strict transition guards and automated timeout windows.
* **GST B2B Tax Invoicing & Input Tax Credit (ITC) Rules** (ClearTax India)
  * [ClearTax Invoicing Guide under CGST Rule 46](https://cleartax.in/s/invoicing-rules-gst)
  * *Why read:* Explains CGST, SGST, IGST calculations, mandatory invoice fields, and why compliant invoices allow companies to reclaim business travel tax.

---

## 7. Frontend Engineering: React 19, TanStack Router & shadcn/ui

Master the modern React ecosystem used in `frontend/`:

* **React 19 Full Course & What's New** (Jack Herrington)
  * [Watch on YouTube](https://www.youtube.com/watch?v=e_Zpy_xNlW4)
  * *Why watch:* Covers React 19 Actions, optimistic updates, and performance optimizations.
* **TanStack Router Crash Course: The Future of React Routing** (Jack Herrington)
  * [Watch on YouTube](https://www.youtube.com/watch?v=XswV_J1bH4U)
  * *Why watch:* Explains file-based routing, type-safe search parameters, loaders, and route guard layouts (`_authenticated`).
* **shadcn/ui & Tailwind CSS Masterclass** (Web Dev Simplified)
  * [Watch on YouTube](https://www.youtube.com/watch?v=kit4q1_A8pE)
  * *Why watch:* How to compose accessible, headless Radix primitives into custom design systems with dark/light theme switching.

---

## 8. Docker, Docker Compose, Redis & Load Balancing

Master infrastructure, container networking, caching, and traffic routing:

* **Docker & Docker Compose Full Course for Beginners** (TechWorld with Nana)
  * [Watch on YouTube](https://www.youtube.com/watch?v=pg19Z8LL0vQ)
  * *Why watch:* From zero to orchestrating multi-container web stacks (DB, Cache, Backend, Frontend) with bridged networking and volumes.
* **Redis Crash Course: Cache, Pub/Sub & Rate Limiting** (Traversy Media / Fireship)
  * [Watch on YouTube](https://www.youtube.com/watch?v=jgpVdJB2sKQ)
  * *Why watch:* In-memory data structures, caching strategies, TTL expiration, and Redis as a message broker.
* **Load Balancers & Reverse Proxies (Nginx) Explained** (Hussein Nasser)
  * [Watch on YouTube](https://www.youtube.com/watch?v=2vS_A_sYn0Y)
  * *Why watch:* Reverse proxying, SSL termination, round-robin load distribution, and WebSocket connection upgrades.

---

## 9. Recommended "One-Shot" Study Sequence

If you want to master all 11 topics sequentially in 1–2 days:

1. **Step 1: The Core Database Engine**
   * Watch Hussein Nasser's *PostgreSQL Row-Level Security* and *Database Concurrency & Locking*.
   * Read Synchoo Dossier: [`01-auth-rbac-and-security.md`](01-auth-rbac-and-security.md) & [`04-concurrency-and-async-systems.md`](04-concurrency-and-async-systems.md).
2. **Step 2: Payments & Idempotency**
   * Watch ByteByteGo's *Idempotency in Payments* and *System Design of Payment Systems*.
   * Read Synchoo Dossier: [`03-payments-idempotency-and-consistency.md`](03-payments-idempotency-and-consistency.md).
3. **Step 3: Asynchronous Channels & WebSockets**
   * Watch Hussein Nasser's *WebSockets vs HTTP* and FreeCodeCamp's *Django Channels*.
   * Read Synchoo Dossier: [`02-apis-and-data-flow.md`](02-apis-and-data-flow.md).
4. **Step 4: Enterprise Workflows & Corporate Travel**
   * Read Synchoo Dossier: [`05-corporate-travel-subsystem.md`](05-corporate-travel-subsystem.md) and review migration `0038`.
5. **Step 5: Frontend React 19 & TanStack Router**
   * Watch Jack Herrington's *React 19* & *TanStack Router*.
   * Read Synchoo Dossier: [`06-frontend-ui-and-react-patterns.md`](06-frontend-ui-and-react-patterns.md).
6. **Step 6: Docker, Redis & Load Balancing**
   * Watch TechWorld with Nana's *Docker Compose* and Hussein Nasser's *Nginx Load Balancers*.
   * Read Synchoo Dossier: [`07-infrastructure-docker-redis-and-scale.md`](07-infrastructure-docker-redis-and-scale.md).
