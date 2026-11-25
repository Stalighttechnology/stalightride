# Track 08: DevOps, Docker Compose, Redis & Scaling (From Basics to Master)

In production, writing good code is only half the battle. You must be able to containerize, deploy, cache, and scale the application smoothly across multiple server instances.

---

## 1. The Core Basics (Zero Prerequisites)

### What is Docker?
Think of a **Docker Container** like a standardized shipping container:
* In the old days, software only worked on "the developer's laptop" because the server had the wrong Python version or missing libraries.
* Docker packages your code, Python 3.13, system binaries, and dependencies into an identical, lightweight container that runs the exact same way on Windows, Mac, or an AWS Linux server.

### What is Docker Compose?
A web app rarely runs alone—it needs a database (Postgres), a cache (Redis), a backend (Django), and a frontend (Nginx).
**Docker Compose (`docker-compose.yml`)** is a single configuration file that defines, boots, and networks all these containers together with one command:
```bash
docker compose up -d
```

---

## 2. Intermediate Concepts: Volumes & In-Memory Caching

### 2.1 Persistent Volumes
Containers are ephemeral: if a container is deleted, its files vanish!
To keep database data safe across restarts, Docker uses **Named Volumes**:
```yaml
volumes:
  - pgdata:/var/lib/postgresql/data
```
The data is stored safely on the host machine's hard drive.

### 2.2 Redis In-Memory Caching
* Reading from a hard drive takes 5–20 milliseconds.
* Reading from RAM (Memory) takes 0.05 milliseconds!
**Redis** stores key-value pairs entirely in RAM. Synchoo uses Redis to cache static metadata (like active cities and tax rates), reducing database load by over 90%.

---

## 3. Advanced Synchoo Concepts: Channels Redis & Load Balancing

### 3.1 Channels Redis Pub/Sub Bus
If you run 3 backend servers behind a load balancer:
* Customer A is connected via WebSocket to Server 1.
* Host B confirms a booking on Server 3.
How does Server 1 know to notify Customer A?
Synchoo uses **`channels_redis`**: Server 3 publishes the event into Redis; Redis instantly broadcasts it to Server 1, which pushes down the open WebSocket to Customer A!

### 3.2 Nginx Reverse Proxy & Load Balancing
An Nginx reverse proxy sits at the edge (Port 80/443):
* Serves static frontend files directly without hitting Django.
* Distributes API calls (`/api/*`) across backend workers using least-connections load balancing.
* Handles WebSocket connections (`/ws/*`) with `Upgrade` and `Connection` headers.

---

## 4. Where This Lives in the Synchoo Codebase

* `docker-compose.yml`: Multi-container topology (Postgres, Redis, Django ASGI, Cron runner, React SPA).
* `backend/Dockerfile` & `frontend/Dockerfile`: Container build recipes.
* `backend/config/settings.py`: `CHANNEL_LAYERS` Redis configuration and database connection pooling.
* `docs/systemDossier/07-infrastructure-docker-redis-and-scale.md`: Full production Nginx configuration.

---

## 5. Step-by-Step Learning Checklist

- [ ] **Step 1:** Learn container basics (Images, Containers, Registries, Dockerfiles).
- [ ] **Step 2:** Learn Docker Compose (Services, Networks, Volumes, Environment variables).
- [ ] **Step 3:** Spin up a local PostgreSQL and Redis container using Docker Compose.
- [ ] **Step 4:** Learn Redis basic commands (`SET`, `GET`, `EXPIRE`, `INCR`).
- [ ] **Step 5:** Understand Reverse Proxies and configure Nginx to proxy HTTP requests.
- [ ] **Step 6:** Inspect the production `docker-compose.yml` in Synchoo and trace container networking.

---

## 6. Curated Learning Resources

* 🔗 [Watch: Docker & Docker Compose Full Course (TechWorld with Nana)](https://www.youtube.com/results?search_query=TechWorld+with+Nana+Docker+Compose+Full+Course)
  * *Best for:* From zero to orchestrating multi-container web applications.
* 🔗 [Watch: Redis Crash Course: Cache, Pub/Sub & Rate Limiting (Traversy Media)](https://www.youtube.com/results?search_query=Traversy+Media+Redis+Crash+Course)
  * *Best for:* Mastering in-memory data structures and Redis pub/sub.
* 🔗 [Watch: Load Balancers & Reverse Proxies (Nginx) Explained (Hussein Nasser)](https://www.youtube.com/results?search_query=Hussein+Nasser+Nginx+Reverse+Proxy+Load+Balancer)
  * *Best for:* Visualizing traffic routing, SSL termination, and WebSocket upgrades.
* 📖 [Read: Docker Compose Official Documentation](https://docs.docker.com/compose/)
