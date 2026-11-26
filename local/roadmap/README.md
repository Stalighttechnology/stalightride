# Synchoo Full-Stack Engineering Roadmap (From CS Basics to Architect)

Welcome to the **Synchoo Master Learning Roadmap**. 

This roadmap is designed for developers who want to understand the system **from the absolute ground-zero Computer Science foundations** (JavaScript/Python runtimes, call stacks, event loops, and network packets) before diving into Synchoo's production stack (PostgreSQL 17 rules engine, Django 5 ASGI, React 19 SPAs, and Razorpay FinTech).

---

## 🚀 Part 1: Core Computer Science Foundations (The Prerequisite Sequence)

If you are new to concepts like asynchronous programming, threads, network protocols, or database transactions, start here:

| Stage | Document | Core Computer Science Foundations Covered |
|---|---|---|
| **Stage 0** | [01-cs-foundations-programming-and-runtimes.md](01-cs-foundations-programming-and-runtimes.md) | **How Computers Run Code:** Call Stack, Memory, Blocking vs Non-Blocking I/O, The Single-Threaded Event Loop, Promises, and `async/await`. |
| **Stage 1** | [02-cs-networking-and-web-protocols.md](02-cs-networking-and-web-protocols.md) | **How the Web Moves Data:** Client-Server model, TCP 3-way handshake, HTTP Request/Response cycle, WebSockets full-duplex sockets, and Cryptography (SHA-256, HMAC, JWT). |
| **Stage 2** | [03-cs-databases-concurrency-and-acid.md](03-cs-databases-concurrency-and-acid.md) | **Operating Systems & Database Engines:** Processes vs Threads, Race Conditions, Mutexes, Relational Algebra, ACID Transactions, Concurrency Anomalies, Isolation Levels, and Row Locking (`FOR UPDATE`). |
| **Stage 3** | [04-distributed-systems-idempotency-and-payments.md](04-distributed-systems-idempotency-and-payments.md) | **Distributed Systems & FinTech Math:** Network unreliability, The Two Generals Problem, At-Least-Once Delivery, Idempotency Keys, and Double-Entry Ledger Bookkeeping. |
| **Stage 4** | [05-operating-systems-containers-and-caching.md](05-operating-systems-containers-and-caching.md) | **Hardware, Containers & Infrastructure:** RAM vs SSD Latency Hierarchy, In-Memory Caching (Redis), Linux Namespaces & cgroups (Docker), and Reverse Proxies & Load Balancing (Nginx). |
| **Stage 5** | [06-from-cs-foundations-to-synchoo-codebase.md](06-from-cs-foundations-to-synchoo-codebase.md) | **The Master Capstone Bridge:** The complete translation matrix mapping every CS fundamental above to exact files, functions, and lines of code in Synchoo. |

---

## 🛠️ Part 2: Synchoo Technology Deep Dives

Once you understand the CS foundations, use these modular deep dives to explore each specific subsystem in detail:

| Track | Guide File | Synchoo Engineering Subsystem |
|---|---|---|
| **Track 1** | [01-foundations-sql-and-database-engine.md](01-foundations-sql-and-database-engine.md) | **PostgreSQL 17 Database Rules:** Schema triggers, RLS policies, exclusion constraints, and PL/pgSQL stored procedures. |
| **Track 2** | [02-backend-python-django-drf.md](02-backend-python-django-drf.md) | **Django 5 & Backend Architecture:** Daphne ASGI, `DbRoleMiddleware`, REST Framework, and direct database cursors. |
| **Track 3** | [03-auth-rbac-and-security.md](03-auth-rbac-and-security.md) | **Authentication & Multi-Role RBAC:** SimpleJWT tokens, refresh rotation, Google OAuth, and RLS database role switching. |
| **Track 4** | [04-fintech-payments-and-idempotency.md](04-fintech-payments-and-idempotency.md) | **Razorpay & Payment Consistency:** Order creation, HMAC signature checks, webhooks, idempotency row locks, and auto-refunds. |
| **Track 5** | [05-concurrency-async-and-realtime.md](05-concurrency-async-and-realtime.md) | **Concurrency & Real-time WebSockets:** Django Channels, `pg_notify` event bus, and 5-minute scheduled reminder sweeps. |
| **Track 6** | [06-enterprise-workflows-and-corporate-travel.md](06-enterprise-workflows-and-corporate-travel.md) | **Corporate Mobility Suite:** Company policies, manager approval timeout windows, and CGST Rule 46 B2B tax invoicing. |
| **Track 7** | [07-modern-frontend-react-and-tanstack.md](07-modern-frontend-react-and-tanstack.md) | **Frontend Architecture:** React 19, TanStack Router file-based routing, Tailwind CSS v4, and shadcn/ui components. |
| **Track 8** | [08-devops-docker-redis-and-scaling.md](08-devops-docker-redis-and-scaling.md) | **DevOps & Scaling:** Production `docker-compose.yml`, Redis caching, Channels Redis pub/sub, and Nginx reverse proxying. |

---

## ⏱️ Recommended Study Timelines

### Option A: The Complete Foundations-to-Architect Path (4 Weeks)
* **Week 1 (CS Foundations & Web Protocols):** Stages 0, 1 & 2 (Event loops, HTTP/WebSockets, OS Concurrency, and SQL ACID).
* **Week 2 (The Data & Security Core):** Stage 3 + Tracks 1 & 3 (PostgreSQL RLS, SimpleJWT, and RBAC).
* **Week 3 (Backend, Realtime & FinTech):** Tracks 2, 4 & 5 (Django 5, Channels WebSockets, Razorpay, and Ledgers).
* **Week 4 (Corporate Travel, Frontend & DevOps):** Tracks 6, 7 & 8 (Enterprise Mobility, React 19, Docker Compose, and Redis).

### Option B: The Fast Track (7 Days for Experienced Engineers)
* **Day 1:** Stage 0 & Stage 1 (Call stack, async runtimes, and WebSockets).
* **Day 2:** Stage 2 & Track 1 (PostgreSQL RLS, `FOR UPDATE` locking, and exclusion constraints).
* **Day 3:** Track 2 & Track 3 (Django ASGI, `DbRoleMiddleware`, and JWT stateless auth).
* **Day 4:** Stage 3 & Track 4 (FinTech idempotency, Razorpay HMAC, and double-entry ledgers).
* **Day 5:** Track 5 & Track 6 (Channels WebSockets, approval windows, and GST invoicing).
* **Day 6:** Track 7 (React 19, TanStack Router, and shadcn/ui).
* **Day 7:** Stage 4, Stage 5 & Track 8 (Docker Compose, Redis, Nginx, and Master Capstone).
