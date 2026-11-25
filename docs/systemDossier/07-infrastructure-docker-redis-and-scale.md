# Synchoo System Dossier — 07: Infrastructure, Docker, Redis & Scaling

## 1. The 5-Year-Old Explanation: "The Magic Apartment Building, The Super-Chalkboard & The Traffic Cop"

Imagine you run the clubhouse for millions of kids across the world:
- **Docker Compose ("The Magic Fold-Up Apartment Building"):**
  - Instead of spending 5 days buying bricks, installing pipes, and hiring electricians, you have a magic blueprint!
  - You blow a whistle (`docker compose up`), and pop! A 5-story apartment instantly unfolds:
    - Floor 1: The Master Vault (**PostgreSQL**).
    - Floor 2: The Fast Chalkboard (**Redis**).
    - Floor 3: The Butler Office (**Django**).
    - Floor 4: The Reception Screen (**React Frontend**).
    - Floor 5: The Clock Alarm Worker (**Cron Job**).
  - Everything is pre-wired, plugged in, and works the exact same way on your laptop or on a giant server in Singapore!
- **Redis Caching ("The Super-Fast Chalkboard"):**
  - If 10,000 kids ask the butler: *"What cities does the clubhouse operate in?"*, the butler would get exhausted running down to the underground vault 10,000 times!
  - Instead, the butler writes on a small chalk tablet on his desk (**Redis**): *"Bengaluru, Mumbai, Delhi."*
  - When a kid asks, the butler answers in 1 millisecond without leaving his chair!
- **Load Balancing ("The Friendly Traffic Cop"):**
  - When 100,000 kids arrive at the front door at 9:00 AM, a single butler would collapse.
  - At the entrance stands a smart traffic cop (**Load Balancer / Nginx**).
  - The cop directs Kid #1 to Butler A, Kid #2 to Butler B, Kid #3 to Butler C.
  - If Butler B takes a nap, the cop automatically sends kids to Butler A and C without anyone noticing!

---

## 2. Docker & Docker Compose Architecture

### 2.1 Multi-Container Topology

```mermaid
flowchart TD
    Internet([Internet / Mobile App]) --> LB[Reverse Proxy / Load Balancer: Nginx (Port 80/443)]
    
    subgraph Docker_Compose ["Docker Compose Network (synchoo-net)"]
        LB -->|/api/*| BackendCluster["Django ASGI (Daphne: Port 8000)"]
        LB -->|/ws/*| BackendCluster
        LB -->|Static Assets| FrontendContainer["React Frontend (Nginx: Port 8080)"]
        
        BackendCluster <--> Redis[(Redis 7: Port 6379)]
        BackendCluster <--> Postgres[(PostgreSQL 17: Port 5432)]
        
        CronWorker["Cron Worker (send_reminders every 5 min)"] --> BackendCluster
        CronWorker --> Postgres
    end

    subgraph Volumes ["Persistent Storage"]
        PGData[(postgres_data)]
        MediaData[(media_uploads)]
        RedisData[(redis_data)]
    end

    Postgres --- PGData
    BackendCluster --- MediaData
    Redis --- RedisData
```

### 2.2 Complete Production-Ready `docker-compose.yml`

```yaml
version: "3.9"

services:
  # 1. Primary PostgreSQL 17 Database
  db:
    image: postgres:17-alpine
    container_name: synchoo-db
    restart: always
    environment:
      POSTGRES_USER: ${DB_USER:-postgres}
      POSTGRES_PASSWORD: ${DB_PASSWORD:-postgres}
      POSTGRES_DB: ${DB_NAME:-synchoo}
    volumes:
      - pgdata:/var/lib/postgresql/data
      - ./backend/scripts/bootstrap_db.sql:/docker-entrypoint-initdb.d/01_bootstrap.sql:ro
    ports:
      - "5432:5432"
    networks:
      - synchoo-network
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres"]
      interval: 5s
      timeout: 5s
      retries: 5

  # 2. Redis 7 (In-Memory Cache & Channels Pub/Sub Layer)
  redis:
    image: redis:7-alpine
    container_name: synchoo-redis
    restart: always
    command: ["redis-server", "--appendonly", "yes"]
    volumes:
      - redisdata:/data
    ports:
      - "6379:6379"
    networks:
      - synchoo-network
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 5s
      timeout: 3s
      retries: 5

  # 3. Django ASGI Backend (Daphne HTTP + WebSockets)
  backend:
    build:
      context: ./backend
      dockerfile: Dockerfile
    container_name: synchoo-backend
    restart: always
    command: >
      sh -c "python manage.py migrate &&
             daphne -b 0.0.0.0 -p 8000 config.asgi:application"
    environment:
      DJANGO_SECRET_KEY: ${DJANGO_SECRET_KEY}
      DJANGO_DEBUG: ${DJANGO_DEBUG:-False}
      DB_NAME: ${DB_NAME:-synchoo}
      DB_USER: ${DB_USER:-synchoo}
      DB_PASSWORD: ${DB_PASSWORD:-synchoo}
      DB_HOST: db
      DB_PORT: 5432
      REDIS_URL: redis://redis:6379/0
      RAZORPAY_KEY_ID: ${RAZORPAY_KEY_ID}
      RAZORPAY_KEY_SECRET: ${RAZORPAY_KEY_SECRET}
    volumes:
      - ./backend/media:/app/media
    ports:
      - "8000:8000"
    depends_on:
      db:
        condition: service_healthy
      redis:
        condition: service_healthy
    networks:
      - synchoo-network

  # 4. Background Scheduled Tasks (Reminders & Expiration Windows)
  cron:
    build:
      context: ./backend
      dockerfile: Dockerfile
    container_name: synchoo-cron
    restart: always
    command: >
      sh -c "while true; do
               python manage.py send_reminders;
               sleep 300;
             done"
    environment:
      DB_NAME: ${DB_NAME:-synchoo}
      DB_USER: ${DB_USER:-synchoo}
      DB_PASSWORD: ${DB_PASSWORD:-synchoo}
      DB_HOST: db
      DB_PORT: 5432
    depends_on:
      - backend
    networks:
      - synchoo-network

  # 5. Frontend React SPA (Served via Nginx)
  frontend:
    build:
      context: ./frontend
      dockerfile: Dockerfile
    container_name: synchoo-frontend
    restart: always
    ports:
      - "8080:80"
    depends_on:
      - backend
    networks:
      - synchoo-network

networks:
  synchoo-network:
    driver: bridge

volumes:
  pgdata:
  redisdata:
```

---

## 3. Redis Caching & Pub/Sub in Synchoo

Redis is an in-memory, key-value data structure store running at microsecond speeds. In Synchoo, it fills **three critical roles**:

### 3.1 Metadata & Platform Settings Caching
- **The Issue:** Every vehicle search, checkout calculation, and map display queries `platform_settings` (GST rate, platform fee, SOS hotline) and `cities` (active operating hubs).
- **The Redis Solution:**
  ```python
  from django.core.cache import cache

  def get_active_cities():
      cities = cache.get("active_cities")
      if cities is None:
          cities = run_query({"table": "cities", "filters": [["is_active", "eq", True]]})
          cache.set("active_cities", cities, timeout=3600) # Cache for 1 hour
      return cities
  ```
  Reduces database load by 90% during peak search hours.

### 3.2 Rate-Limiting & Brute-Force Defense
- **The Issue:** Attackers trying to brute-force the 6-digit trip handover code or spammers abusing SMS OTP verification.
- **The Redis Solution:**
  Redis atomic counters (`INCR` with `EXPIRE`):
  ```python
  key = f"rate_limit:login:{ip_address}"
  attempts = redis_client.incr(key)
  if attempts == 1:
      redis_client.expire(key, 60) # 1 minute window
  if attempts > 10:
      raise FnError("Too many login attempts. Please wait 60 seconds.", status=429)
  ```

### 3.3 Django Channels `channels_redis` Layer
- **The Issue:** If you run 4 backend server instances behind a load balancer, User A's WebSocket is connected to Server 1, but User B triggers a payment on Server 3. How does Server 1 know to push an update to User A?
- **The Solution:** Redis acts as the **cross-server pub/sub message bus**. Server 3 publishes `booking_paid` into Redis; Redis instantly notifies Server 1, which pushes down the open WebSocket to User A!
  ```python
  # In backend/config/settings.py:
  CHANNEL_LAYERS = {
      "default": {
          "BACKEND": "channels_redis.core.RedisChannelLayer",
          "CONFIG": {
              "hosts": [os.environ.get("REDIS_URL", "redis://localhost:6379/0")],
          },
      },
  }
  ```

---

## 4. Load Balancing & Reverse Proxy Architecture

A **Load Balancer (Nginx / Cloudflare / AWS ALB)** sits in front of the application cluster:

### 4.1 Traffic Routing Configuration (Nginx)

```nginx
upstream django_backend {
    least_conn; # Routes traffic to the least busy backend node
    server backend1:8000;
    server backend2:8000;
}

server {
    listen 80;
    server_name synchoo.com;
    return 301 https://$host$request_uri; # Force SSL
}

server {
    listen 443 ssl http2;
    server_name synchoo.com;

    ssl_certificate /etc/letsencrypt/live/synchoo.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/synchoo.com/privkey.pem;

    # 1. Frontend SPA Static Files
    location / {
        root /var/www/synchoo/dist;
        try_files $uri $uri/ /index.html;
    }

    # 2. REST & RPC Backend APIs
    location /api/ {
        proxy_pass http://django_backend;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # 3. Realtime WebSockets (Must support HTTP Upgrade!)
    location /ws/ {
        proxy_pass http://django_backend;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_read_timeout 86400s; # Keep connection open for 24h
    }
}
```

---

## 5. Master Developer Cheat Sheet: How to Read & Modify This Codebase

### 5.1 The 3 Cardinal Rules of Synchoo
1. **Never enforce business rules in Python/TypeScript:** Write pricing, refund, status gates, and validation in PostgreSQL migrations (`backend/core/migrations/`).
2. **Never query without database roles:** All user calls must run through `JWTRoleAuthentication` as `authenticated` with `auth.uid()` bound. Only elevated server actions may use `db_role("service_role")`.
3. **Keep `trip-window.ts` and `trip_window.py` synchronized:** Handover timing and check-in window calculations are mirrored across client and server.

### 5.2 How to Add a New Table & Expose It
1. Create a new migration in `backend/core/migrations/00XX_my_feature.py`:
   ```python
   from django.db import migrations
   SQL = """
   CREATE TABLE public.loyalty_badges (
     id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
     user_id uuid REFERENCES public.profiles(id),
     badge_type text NOT NULL,
     created_at timestamptz DEFAULT now()
   );
   ALTER TABLE public.loyalty_badges ENABLE ROW LEVEL SECURITY;
   CREATE POLICY "Users read own badges" ON public.loyalty_badges
     FOR SELECT TO authenticated USING (auth.uid() = user_id);
   """
   class Migration(migrations.Migration):
       dependencies = [("core", "0040_previous_migration")]
       operations = [migrations.RunSQL(SQL)]
   ```
2. Run migration:
   ```bash
   python manage.py migrate
   ```
3. Read directly from the frontend in React:
   ```typescript
   const { data: badges } = await api.from("loyalty_badges").select("*");
   ```
   *No Django serializer, viewset, or endpoint needs to be created! The query engine and RLS handle it automatically!*

### 5.3 How to Run Tests
```bash
# Backend (Hits a throwaway test database):
cd backend
.venv/Scripts/python -m pytest

# Frontend (Vitest in-memory backend tests):
cd frontend
npm run test
npx tsc --noEmit
```
