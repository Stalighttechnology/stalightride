# Stage 4: Operating Systems, Containers, Caching & Load Balancing

Before you can understand **Docker Compose**, **Redis Caching**, or **Nginx Reverse Proxies**, you must understand how operating systems manage hardware resources.

---

## 1. The Computer Memory Hierarchy

Not all memory is created equal. Computer hardware is organized in a speed-versus-capacity pyramid:

| Level | Type | Approximate Speed (Latency) | Real-World Human Analogy |
|---|---|---|---|
| **Level 1** | **CPU Registers & L1/L2 Cache** | ~0.5 – 1 nanosecond | A thought in your head right now |
| **Level 2** | **RAM (Memory)** | ~100 nanoseconds | A book on your desk |
| **Level 3** | **NVMe SSD (Disk)** | ~100,000 nanoseconds (100 µs) | Walking to the library down the street |
| **Level 4** | **Internet Network Call** | ~50,000,000 nanoseconds (50 ms) | Taking an airplane to another country |

### Why We Use Redis (In-Memory Caching)
* PostgreSQL stores tables on **Disk (SSD)** to ensure durability. Reading from disk takes 1 to 5 milliseconds.
* **Redis** stores data in **RAM**. Reading from Redis takes **0.05 milliseconds** (100 times faster!).
* In Synchoo, frequently accessed static data (platform fees, active cities, tax rates) is cached in Redis so the database isn't overwhelmed.

---

## 2. Linux Kernel Fundamentals: What is a Container?

Many people think a Docker container is a miniature "Virtual Machine" (VM). It is not!
* **Virtual Machine (VM):** Simulates an entire virtual motherboard, virtual hard drive, and boots a full second copy of the Linux/Windows OS. (Heavy, takes 2 minutes to boot, uses 4GB of RAM).
* **Docker Container:** Uses two built-in features of the **Linux Kernel**:
  1. **Namespaces:** Creates an isolated bubble. Inside the container, the program thinks it is the only program on the computer (isolated process IDs, network interfaces, and file mounts).
  2. **cgroups (Control Groups):** Sets strict hardware limits (e.g., *"This container may use at most 2 CPU cores and 1GB of RAM"*).

A container is simply a normal process running inside an isolated Linux sandbox! It starts in **0.2 seconds** and uses almost zero overhead.

---

## 3. Multi-Container Orchestration: Docker Compose

In a modern application, you don't run just one program. You have:
1. `db`: PostgreSQL 17
2. `redis`: Redis 7
3. `backend`: Django 5 ASGI (Daphne)
4. `frontend`: React SPA (Nginx)
5. `cron`: Background task runner

**Docker Compose (`docker-compose.yml`)** orchestrates all of them:
* **Bridged Virtual Network:** Docker creates an internal private network (`synchoo-network`). Containers can talk to each other using their service names (e.g. `DB_HOST=db`, `REDIS_URL=redis://redis:6379`).
* **Persistent Named Volumes:** Links a folder on your host computer to `/var/lib/postgresql/data` so your data survives even if you restart or delete containers.

---

## 4. Reverse Proxies & Load Balancers (Nginx)

When 50,000 users visit `synchoo.com`, they don't talk directly to Python. Python is great at business logic, but poor at handling thousands of raw network sockets.

At the front door sits **Nginx (The Reverse Proxy & Load Balancer)**:

```
[ 50,000 Users ] ──► [ Nginx (Port 80/443) ]
                             │
                             ├──► /assets/* ──► Serves static files directly from disk (0ms Python time!)
                             ├──► /api/*    ──► Distributes across 3 Django backend nodes
                             └──► /ws/*     ──► Upgrades connection to Daphne WebSocket
```

### Key Load Balancer Responsibilities:
1. **SSL/TLS Termination:** Decrypts HTTPS encryption at the edge so backend nodes don't waste CPU cycles.
2. **Load Distribution Algorithms:**
   * **Round Robin:** Sends Request 1 to Server A, Request 2 to Server B, Request 3 to Server C.
   * **Least Connections:** Sends the new request to whichever server is currently doing the least work.
3. **Health Checks:** If Server B crashes, Nginx immediately stops sending traffic to it without users seeing an error.

---

## 5. How This Connects to Synchoo

* `docker-compose.yml`: Defines the entire multi-container topology for Synchoo.
* `backend/config/settings.py`: Configures `CHANNEL_LAYERS` to use Redis as the pub/sub message broker across workers.
* `docs/systemDossier/07-infrastructure-docker-redis-and-scale.md`: Provides the full, production-ready Nginx configuration file with WebSocket upgrade headers.

---

## 6. Curated CS Learning Resources

* 🔗 [Watch: Docker & Docker Compose Full Course (TechWorld with Nana)](https://www.youtube.com/results?search_query=TechWorld+with+Nana+Docker+Compose+Full+Course)
  * *Best for:* From zero to containerizing multi-tier web applications.
* 🔗 [Watch: Redis Crash Course: Cache, Pub/Sub & Rate Limiting (Traversy Media)](https://www.youtube.com/results?search_query=Traversy+Media+Redis+Crash+Course)
  * *Best for:* Understanding in-memory data structures and Redis pub/sub.
* 🔗 [Watch: Load Balancers & Reverse Proxies (Nginx) Explained (Hussein Nasser)](https://www.youtube.com/results?search_query=Hussein+Nasser+Nginx+Reverse+Proxy+Load+Balancer)
  * *Best for:* Visualizing Layer 4 vs Layer 7 routing and SSL termination.
