# Synchoo System Dossier (Master Index)

Welcome to the **Synchoo System Dossier**. This dossier provides an exhaustive, ground-up explanation of the entire Synchoo engineering ecosystem, designed for both five-year-olds and senior principal architects.

Whether you need to explain the system to stakeholders, understand how authentication and payments flow end-to-end, or dive into the codebase and make architectural changes yourself, this dossier contains the complete technical blueprint.

---

## Dossier Navigation & Topics Index

| # | Chapter / Dossier File | Covered Concepts | Target Takeaways |
|---|---|---|---|
| **00** | [00-executive-summary-and-5yo-guide.md](00-executive-summary-and-5yo-guide.md) | **The 5-Year-Old Toy Clubhouse, High-Level Architecture, Tech Matrix, End-to-End Request Life** | Intuitive grasp of the whole project from the browser to the database, request lifecycle sequence. |
| **01** | [01-auth-rbac-and-security.md](01-auth-rbac-and-security.md) | **Authentication, Authorization, RBAC, Row-Level Security (RLS), JWT Rotation** | Multi-role hierarchy, how `DbRoleMiddleware` sets `anon`/`authenticated`/`service_role`, PostgreSQL RLS policies. |
| **02** | [02-apis-and-data-flow.md](02-apis-and-data-flow.md) | **The 5 API Modalities, Declarative Query Engine (`query.py`), RPCs, Server Actions, WebSockets** | How frontend queries become parameterized SQL, embedded relations, catalog validation, stored procedure execution. |
| **03** | [03-payments-idempotency-and-consistency.md](03-payments-idempotency-and-consistency.md) | **Razorpay Workflows, Idempotency Keys, Double-Entry Wallet Ledger, HMAC Verification, Late-Payment Refunds** | Preventing double-charges, webhook reconciliation, atomic wallet balance transitions, cryptographic verification. |
| **04** | [04-concurrency-and-async-systems.md](04-concurrency-and-async-systems.md) | **Concurrency Control, Exclusion Constraints (`gist`), Pessimistic Locks (`FOR UPDATE`), Async WebSockets, Cron** | Mathematical prevention of double-bookings, atomic ledger operations, real-time reactive loop via `pg_notify`. |
| **05** | [05-corporate-travel-subsystem.md](05-corporate-travel-subsystem.md) | **Corporate Travel Issue, Enterprise Mobility Suite, Policy Checking Engine, Parallel Approvals, GST Rule 46** | Solving corporate rogue spend, employee budgets, approval expiry windows, B2B tax invoice generation with full ITC. |
| **06** | [06-frontend-ui-and-react-patterns.md](06-frontend-ui-and-react-patterns.md) | **React 19, TanStack Router, Tailwind v4, shadcn/ui, Light-First Theme, 360° Inspection Uploader** | File-based routing, layout guards (`_authenticated`), custom pickers, real-time UI state sync, developer recipes. |
| **07** | [07-infrastructure-docker-redis-and-scale.md](07-infrastructure-docker-redis-and-scale.md) | **Docker Compose, Redis Caching, Load Balancing (Nginx), Channels Redis Layer, Developer Cheat Sheet** | Multi-container setup, sub-millisecond caching, rate-limiting, WebSocket scaling, rules for reading/modifying code. |
| **08** | [08-crash-courses-and-resources.md](08-crash-courses-and-resources.md) | **"One-Shot" Video Guides, Engineering Masterclasses & Recommended Study Path** | Top-tier YouTube crash courses, system design masterclasses, and an accelerated 6-step study sequence for all 11 topics. |

---

## Quick Architecture Summary

```
[ Browser / Mobile PWA (React 19 + TanStack Router) ]
                     │  Port 8080 (Vite / Nginx)
                     ▼
           [ Nginx / Load Balancer ]
          /           │            \
         / (REST/RPC) │ (/ws/)      \ (Static Assets)
        ▼             ▼              ▼
 [ Django 5.2 ASGI / Daphne (Port 8000) ] ◄──► [ Redis 7 (Cache & Channels Bus) ]
        │             │
        │             │ (Every request runs under a DB role: anon / authenticated / service_role)
        ▼             ▼
 [ PostgreSQL 17 (The Core Engine: Triggers, RLS, Exclusion Constraints, Wallets) ]
        │
        ├──► Razorpay (Domestic INR Payments & Webhook Reconciler)
        ├──► Google Maps & Google Identity Services (OAuth)
        └──► send_reminders Cron (Every 5 mins: booking windows, expirations & job dispatch)
```

---

## The 3 Cardinal Rules Every Developer Must Follow

1. **Rules Live in PostgreSQL, Not in Code:** Pricing, cancellation fees, booking expiry, double-booking prevention, and wallet accounting must be defined via migrations in PostgreSQL functions and triggers.
2. **Never Query Outside the Role Sandbox:** User-facing queries must always run with `set_db_role("authenticated", user_id)`. The database owner role bypasses RLS and must only be touched by Django internal tables via `as_owner()`.
3. **Keep Client & Server Time Calculations Synchronized:** If you adjust booking check-in windows, update both `frontend/src/lib/trip-window.ts` and `backend/payments/trip_window.py`.
