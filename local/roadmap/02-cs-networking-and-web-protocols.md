# Stage 1: Computer Networking, Web Protocols & Cryptography Basics

Before you can understand **APIs**, **WebSockets**, or **JWT Authentication**, you must understand how computers send messages across the wire.

---

## 1. The Client-Server Model & TCP/IP

### What Happens When You Visit a Website?
1. **Client (Your Browser):** The requester.
2. **Server (Django Backend):** The listener waiting for requests.
3. **DNS (Domain Name System):** The phonebook that converts `synchoo.com` into an IP address like `192.168.1.50`.
4. **TCP Three-Way Handshake:** Before sending data, the client and server introduce themselves:
   * Client $\to$ Server: *"SYN (Can we talk?)"*
   * Server $\to$ Client: *"SYN-ACK (Yes, I hear you!)"*
   * Client $\to$ Server: *"ACK (Great, sending data now!)"*

---

## 2. The HTTP Protocol (Hypertext Transfer Protocol)

HTTP is a simple, plain-text request/response conversation.

### 2.1 An HTTP Request
```http
POST /api/query/ HTTP/1.1
Host: localhost:8000
Authorization: Bearer eyJhbGci...
Content-Type: application/json

{"table": "vehicles", "select": "id, title"}
```

* **Method:** `GET` (Read), `POST` (Submit/Action), `PUT`/`PATCH` (Update), `DELETE` (Remove).
* **Headers:** Metadata (Content type, auth token, device type).
* **Body:** The actual JSON data payload.

### 2.2 An HTTP Response & Status Codes
```http
HTTP/1.1 200 OK
Content-Type: application/json

{"data": [{"id": "1", "title": "Mahindra Thar"}]}
```

* **`2xx` (Success):** `200 OK`, `201 Created`.
* **`4xx` (Client Error):** `400 Bad Request` (You sent invalid data), `401 Unauthorized` (You aren't logged in), `403 Forbidden` (You are logged in, but not an admin), `404 Not Found`.
* **`5xx` (Server Error):** `500 Internal Server Error` (Python crashed).

---

## 3. HTTP vs. WebSockets (Why Synchoo Uses Both)

| Feature | HTTP/1.1 | WebSockets (`ws://`) |
|---|---|---|
| **Connection** | Opens, sends 1 request, receives 1 response, closes. | Opens once and stays open indefinitely (**Persistent Connection**). |
| **Direction** | **One-way (Half-duplex):** Client must always ask first. Server cannot speak unprompted! | **Two-way (Full-duplex):** Both client and server can speak anytime! |
| **Use in Synchoo** | Fetching vehicle catalog, submitting booking requests (`/api/query/`, `/api/rpc/`). | Live chat, driver location updates, real-time push alerts (`/ws/`). |

---

## 4. Cryptography 101: Hashes, HMAC & Digital Signatures

### 4.1 What is a Cryptographic Hash? (SHA-256)
A hash is a mathematical one-way meat grinder:
$$\text{SHA-256}(\text{"password123"}) \implies \text{ef92b778bafe771e89245b89ecbc08a4...}$$
* It is **deterministic:** The same input always produces the exact same hash.
* It is **irreversible:** You cannot turn the hash back into `"password123"`.
* **Avalanche effect:** Changing a single letter completely scrambles the output.
*(This is why Synchoo never stores plain passwords—it stores bcrypt hashes in `auth.users`).*

### 4.2 What is an HMAC? (Hash-Based Message Authentication Code)
An HMAC is a hash mixed with a secret key:
$$\text{HMAC} = \text{Hash}(\text{Message} + \text{SecretKey})$$
* Used in **Razorpay verification**: Razorpay hashes the payment ID with your secret key. When the payment reaches your backend, your server recomputes the HMAC. If the signatures match, nobody tampered with the money amount!

### 4.3 What is a JWT? (JSON Web Token)
A JWT has 3 parts separated by dots:
1. `Header` (Base64 encoded): `{"alg": "HS256"}`
2. `Payload` (Base64 encoded): `{"user_id": "123", "role": "customer"}`
3. `Signature`: `HMAC(Header + Payload, ServerSecret)`

* The client can read the payload (it is not encrypted!), but the client **cannot modify it**. If you change `"role": "customer"` to `"admin"`, the signature becomes invalid and Django rejects the request!

---

## 5. How This Connects to Synchoo

* `backend/payments/views.py`: Uses `hmac.new(secret, ..., hashlib.sha256)` to verify Razorpay payments.
* `backend/core/auth.py`: SimpleJWT parses the Bearer JWT token header on every request.
* `backend/realtime/consumers.py`: Upgrades standard HTTP connections to full-duplex WebSockets at `/ws/`.

---

## 6. Curated CS Learning Resources

* 🔗 [Watch: How the Internet Works in 5 Minutes (Aaron)](https://www.youtube.com/results?search_query=How+the+Internet+Works+in+5+Minutes)
  * *Best for:* Packets, routers, IP addresses, and DNS.
* 🔗 [Watch: HTTP Crash Course & Request/Response Lifecycle (Traversy Media)](https://www.youtube.com/results?search_query=Traversy+Media+HTTP+Crash+Course)
  * *Best for:* Methods, headers, and status codes.
* 🔗 [Watch: WebSockets vs HTTP Explained (Hussein Nasser)](https://www.youtube.com/results?search_query=Hussein+Nasser+WebSockets+vs+HTTP)
  * *Best for:* The physics of persistent TCP sockets vs HTTP polling.
* 🔗 [Watch: Cryptography: Hashing vs Encryption vs Encoding (Fireship)](https://www.youtube.com/results?search_query=Fireship+Hashing+vs+Encryption)
  * *Best for:* Demystifying SHA-256, HMAC, and Base64 in 100 seconds.
