# Stage 0: Programming Foundations, Call Stack & Async Runtimes

Before you can understand **Asynchronous WebSockets** or **React Promises**, you must understand how a computer runs code line by line.

---

## 1. How a Computer Executes Code (The Call Stack)

### The Call Stack Analogy (A Stack of Plates)
Imagine your computer has a cafeteria plate dispenser:
* When you call a function, the computer puts a plate on top (**Push**).
* While that function is working, the computer can only look at the top plate.
* When the function finishes, the plate is removed (**Pop**).

```javascript
function greet() {
  console.log("Hello!");
}

function start() {
  greet(); // Pushes greet onto the stack
}

start(); // Pushes start onto the stack
```

**The Call Stack Sequence:**
1. Stack: `[ start ]`
2. Stack: `[ start, greet ]`
3. Stack: `greet` logs "Hello!" and finishes $\to$ Pops off.
4. Stack: `[ start ]` finishes $\to$ Pops off.
5. Stack: `[ empty ]`.

---

## 2. The Problem: What is "Blocking" (Synchronous)?

Imagine you want to load 50 car photos from a server:
* If your program is **Synchronous (Blocking)**, the CPU literally freezes and does nothing while waiting for the photos to download over Wi-Fi.
* If a user tries to click a button while the CPU is frozen, the button won't respond. The browser shows: *"Page Unresponsive"*.

---

## 3. The Solution: The Event Loop & Asynchronous Runtimes

Both **JavaScript (Node.js & Browsers)** and **Python (`asyncio`)** use an **Event Loop**.

### The Restaurant Kitchen Analogy
* **Synchronous Cook:** Puts toast in the toaster and stands completely still for 2 minutes watching it. He refuses to pour coffee or take new orders until the toast pops up.
* **Event-Driven Asynchronous Cook:** Puts toast in the toaster and sets a timer. While the toast is cooking, he pours coffee, takes orders, and cleans the counter. When the toaster dings (**Event**), he grabs the toast!

```
[ Call Stack (What's running right now) ]
                ▲
                │ (Event Loop pushes tasks when stack is empty)
[ Task Queue / Microtask Queue (Waiting callbacks) ]
                ▲
                │ (Web APIs / Background Network Threads)
```

---

## 4. From Callbacks to Promises and `async / await`

### 4.1 The Evolution in JavaScript

#### Step 1: Callbacks (Old & Messy)
```javascript
fetchCarData(carId, function(car) {
  fetchOwnerDetails(car.ownerId, function(owner) {
    console.log(owner.name); // "Callback Hell"
  });
});
```

#### Step 2: Promises (A Ticket for Future Food)
When you order at a burger joint, they give you a vibrating buzzer (**Promise**). The buzzer is in one of three states:
1. `Pending`: The burger is being grilled.
2. `Fulfilled`: The burger is ready (`.then(...)`).
3. `Rejected`: They ran out of beef (`.catch(...)`).

```javascript
fetchCarData(carId)
  .then(car => fetchOwnerDetails(car.ownerId))
  .then(owner => console.log(owner.name))
  .catch(err => console.error(err));
```

#### Step 3: `async / await` (The Clean Modern Way)
`async / await` is syntactic sugar over Promises. It looks like synchronous code, but is 100% non-blocking!

```javascript
async function showCarOwner(carId) {
  try {
    const car = await fetchCarData(carId);       // Pauses this function, but DOES NOT freeze the browser!
    const owner = await fetchOwnerDetails(car.ownerId);
    console.log(owner.name);
  } catch (err) {
    console.error(err);
  }
}
```

---

## 5. How Python Handles Async (`asyncio`)

In Python (used in Synchoo's Django ASGI backend), asynchronous code uses `async def` and `await`:

```python
import asyncio

async def fetch_database_row(booking_id):
    await asyncio.sleep(0.1) # Simulates network wait without blocking other requests!
    return {"id": booking_id, "status": "confirmed"}

async def main():
    # Both tasks run concurrently!
    result1, result2 = await asyncio.gather(
        fetch_database_row("booking-1"),
        fetch_database_row("booking-2")
    )
```

---

## 6. How This Connects to Synchoo

1. **Frontend (`frontend/src/lib/api.ts`):** Every API call is an `async` function returning a Promise:
   ```typescript
   const { data, error } = await api.from("vehicles").select("*");
   ```
2. **Backend (`backend/realtime/consumers.py`):** Channels WebSocket consumers are `async def` functions using Python's `asyncio` event loop to listen for `pg_notify` database events without blocking HTTP requests.

---

## 7. Curated CS Learning Resources

* 🔗 [Watch: What the Heck is the Event Loop Anyway? (Philip Roberts)](https://www.youtube.com/results?search_query=Philip+Roberts+What+the+heck+is+the+event+loop+anyway)
  * *The #1 most famous computer science talk on JavaScript runtimes and event loops.*
* 🔗 [Watch: JavaScript Promises & Async Await in 10 Minutes (Web Dev Simplified)](https://www.youtube.com/results?search_query=Web+Dev+Simplified+Async+Await+JavaScript)
  * *Best for:* Visualizing Callbacks $\to$ Promises $\to$ `async/await`.
* 🔗 [Watch: Python Asyncio Complete Crash Course (ArjanCodes)](https://www.youtube.com/results?search_query=ArjanCodes+Python+Asyncio+Complete+Course)
  * *Best for:* Understanding non-blocking coroutines in Python.
