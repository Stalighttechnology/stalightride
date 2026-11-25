# Master Computer Science & Web Engineering Roadmap

> **Your Complete Learning Journey: From Ground-Zero CS Basics to Synchoo Full-Stack Architect**

If you try to learn concepts like *"Database Row Locking"*, *"Asynchronous WebSockets"*, or *"Payment Idempotency"* without understanding **how computers run code, how the internet moves packets, or how memory works**, it feels overwhelming and abstract.

This roadmap starts from the **absolute core fundamentals of Computer Science** (JavaScript/Python basics, how the Event Loop executes, how networking works) and connects each concept step-by-step directly to **Synchoo's production codebase**.

---

## 🗺️ The 6 Foundational Stages

```mermaid
flowchart TD
    subgraph Stage0 ["Stage 0: Programming & Runtime Foundations"]
        S0A["Variables, Functions, Call Stack & Memory"]
        S0B["The Single-Threaded Event Loop (JS & Python)"]
        S0C["Callbacks, Promises & Async/Await"]
        S0A --> S0B --> S0C
    end

    subgraph Stage1 ["Stage 1: Networking, Web & Cryptography"]
        S1A["Client-Server, IP, DNS, TCP Three-Way Handshake"]
        S1B["HTTP Request-Response Lifecycle & Statelessness"]
        S1C["WebSockets vs HTTP Keep-Alive"]
        S1D["Cryptography 101: Hashing (SHA-256), HMAC & Tokens (JWT)"]
        S1A --> S1B --> S1C --> S1D
    end

    subgraph Stage2 ["Stage 2: OS Concurrency & Database Engines"]
        S2A["Processes vs Threads & Shared Memory"]
        S2B["Race Conditions & Critical Sections"]
        S2C["Relational Algebra & SQL Basics"]
        S2D["ACID Transactions & Isolation Levels"]
        S2E["Pessimistic Locks (FOR UPDATE) & Exclusion Constraints"]
        S2A --> S2B
        S2C --> S2D --> S2E
        S2B --> S2E
    end

    subgraph Stage3 ["Stage 3: Distributed Systems & FinTech Guarantees"]
        S3A["Network Failures & The Fallacies of Distributed Computing"]
        S3B["Idempotency Keys & Deduplication"]
        S3C["Double-Entry Ledger Accounting Math"]
        S3A --> S3B --> S3C
    end

    subgraph Stage4 ["Stage 4: Infrastructure, Caching & Containers"]
        S4A["RAM vs Disk & Sub-Millisecond Caching (Redis)"]
        S4B["Linux Namespaces & Containerization (Docker)"]
        S4C["Reverse Proxies & Load Balancing (Nginx)"]
        S4A --> S4B --> S4C
    end

    subgraph Stage5 ["Stage 5: Synchoo Full-Stack Architecture"]
        SY1["Django 5 ASGI + DbRoleMiddleware"]
        SY2["PostgreSQL 17 RLS & Triggers Engine"]
        SY3["React 19 + TanStack Router + WebSockets"]
        SY4["Razorpay Payment Rails & Corporate Travel"]
        SY1 --- SY2 --- SY3 --- SY4
    end

    Stage0 --> Stage1
    Stage1 --> Stage2
    Stage2 --> Stage3
    Stage3 --> Stage4
    Stage4 --> Stage5
```

---

## 📚 Curriculum Index & Guide Files

| Stage | Document | Core Questions Answered |
|---|---|---|
| **Stage 0** | [01-cs-foundations-programming-and-runtimes.md](01-cs-foundations-programming-and-runtimes.md) | How does a computer run code? What is the Call Stack? What is the Event Loop? Why do we need `async/await`? |
| **Stage 1** | [02-cs-networking-and-web-protocols.md](02-cs-networking-and-web-protocols.md) | What happens when you type a URL? How does TCP work? What is HTTP? How do WebSockets stay open? What is HMAC? |
| **Stage 2** | [03-cs-databases-concurrency-and-acid.md](03-cs-databases-concurrency-and-acid.md) | What are threads and processes? Why do race conditions break apps? What are ACID transactions, row locks, and isolation levels? |
| **Stage 3** | [04-distributed-systems-idempotency-and-payments.md](04-distributed-systems-idempotency-and-payments.md) | Why do networks drop requests? How does an Idempotency Key stop double charges? How does a double-entry ledger work? |
| **Stage 4** | [05-operating-systems-containers-and-caching.md](05-operating-systems-containers-and-caching.md) | What is a Docker container? Why is RAM faster than SSD? How does Redis pub/sub work? What does an Nginx load balancer do? |
| **Stage 5** | [06-from-cs-foundations-to-synchoo-codebase.md](06-from-cs-foundations-to-synchoo-codebase.md) | **The Master Capstone:** How every single fundamental above connects directly to Synchoo's files and lines of code. |

---

## 🎯 How to Follow This Roadmap

1. **Don't skip the basics:** If you don't know what a *Call Stack* is, `async/await` will feel like magic. Read Stage 0 first.
2. **Read the "Intuitive Analogy":** Every chapter starts with a real-world physical analogy before diving into computer science theory.
3. **Run the Code Snippets:** Open your browser console or terminal and run the simple 5-line examples.
4. **Follow the Synchoo Bridges:** At the end of every chapter, look at the exact file in Synchoo where that concept is used in production.
