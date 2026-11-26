# Track 03: Authentication, RBAC & Security (From Basics to Master)

Security in Synchoo is designed with defense-in-depth: stateless cryptographic tokens in the application layer combined with database-enforced Row-Level Security.

---

## 1. The Core Basics (Zero Prerequisites)

### What is Authentication vs. Authorization?
* **Authentication (AuthN):** *"Who are you?"* (e.g., logging in with email `alex@example.com` and password).
* **Authorization (AuthZ):** *"What are you allowed to do?"* (e.g., Alex is a Customer, so he can rent a car, but he cannot delete someone else's vehicle listing).

### What is a Session vs. a Token?
* **Stateful Sessions:** In old web apps, every time you log in, the server saves your session ID in memory or a database. If 1,000,000 users log in, the server memory fills up!
* **Stateless Tokens (JWT):** The server gives you a signed cryptographic badge (**JSON Web Token**). The badge contains your user ID and expiration date. Every time you make a request, the server inspects the cryptographic signature without querying any database!

---

## 2. Intermediate Concepts: JWT Architecture & Refresh Rotation

### 2.1 Anatomy of a JWT
A JWT string looks like: `header.payload.signature`
* **Header:** Algorithm used (e.g. HS256).
* **Payload:** Claims (e.g. `{"user_id": "abc-123", "exp": 1732560000}`).
* **Signature:** Created using `HMAC-SHA256(header + payload, SECRET_KEY)`. If anyone alters their user ID, the signature breaks immediately!

### 2.2 Access vs. Refresh Tokens
* **Access Token:** Short lifespan (e.g., 1 hour). Sent in the `Authorization: Bearer <token>` header with every API request.
* **Refresh Token:** Long lifespan (e.g., 7 days). Kept securely in the client. When the access token expires, the client calls `/api/auth/refresh` to get a fresh token pair. Old refresh tokens are blacklisted immediately to stop token replay attacks.

---

## 3. Advanced Synchoo Concepts: Multi-Role RBAC & PostgreSQL RLS Integration

### 3.1 Role-Based Access Control (RBAC)
In Synchoo, user roles are stored in `public.user_roles`:
* `customer`: Default role for all signups.
* `vendor`: Vehicle hosts listing cars.
* `driver`: Approved chauffeurs accepting hire jobs.
* `cleaner` & `wash_center`: Doorstep cleaners and washing facilities.
* `admin`: Platform managers.

A single user can hold multiple roles simultaneously (e.g., a customer who is also a host).

### 3.2 The JWT-to-PostgreSQL RLS Bridge
How does PostgreSQL know who is logged in when Django runs queries?
Look at [`backend/core/auth.py`](file:///C:/Users/gclik/Desktop/Projects/Stalight%20Technologies/stalightride/backend/core/auth.py):
1. Django verifies the JWT token signature statelessly (0 database queries).
2. It calls `set_db_role("authenticated", user.id)`.
3. Inside PostgreSQL:
   ```sql
   SELECT set_config('role', 'authenticated', true),
          set_config('request.jwt.claim.sub', '<user_uuid>', true);
   ```
4. Now, every single SQL table policy evaluates `auth.uid()` against this transaction-local setting!

---

## 4. Where This Lives in the Synchoo Codebase

* `backend/accounts/views.py`: Signup, signin, token refresh, and Google OAuth ID-token verification.
* `backend/core/auth.py`: `JWTRoleAuthentication` class bridging Django authentication to database roles.
* `backend/core/db.py`: `set_db_role()`, `as_owner()`, and `db_role("service_role")` context managers.
* `frontend/src/lib/api.ts`: Client session storage (`localStorage`), automatic token refresh interceptor.
* `frontend/src/hooks/use-is-admin.ts`: React hook to check platform admin privileges.

---

## 5. Step-by-Step Learning Checklist

- [ ] **Step 1:** Learn the difference between cookies, local storage, and bearer tokens.
- [ ] **Step 2:** Decode a JWT on [jwt.io](https://jwt.io) and understand the header, payload, and signature.
- [ ] **Step 3:** Implement simple JWT authentication in Django using `djangorestframework-simplejwt`.
- [ ] **Step 4:** Build an RBAC schema with users, roles, and user_roles tables.
- [ ] **Step 5:** Understand how `SET LOCAL role` and `current_setting()` work in PostgreSQL.
- [ ] **Step 6:** Inspect `backend/core/auth.py` and trace how a token switches PostgreSQL roles.

---

## 6. Curated Learning Resources

* 🔗 [Watch: Authentication vs Authorization in 100 Seconds (Fireship)](https://www.youtube.com/results?search_query=Fireship+Session+vs+Token+Authentication+in+100+Seconds)
  * *Best for:* Quick visual grasp of modern auth.
* 🔗 [Watch: Session vs JWT: Deep Dive (ByteByteGo)](https://www.youtube.com/results?search_query=ByteByteGo+Session+vs+JWT)
  * *Best for:* Architectural trade-offs between sessions and tokens.
* 🔗 [Watch: Role-Based Access Control Architecture (Web Dev Simplified)](https://www.youtube.com/results?search_query=Web+Dev+Simplified+Role+Based+Access+Control)
  * *Best for:* Modeling roles and permissions in databases.
* 🔗 [Watch: PostgreSQL Row-Level Security Deep Dive (Supabase)](https://www.youtube.com/results?search_query=Supabase+Postgres+Row+Level+Security+Deep+Dive)
  * *Best for:* Enforcing data isolation with `CREATE POLICY`.
