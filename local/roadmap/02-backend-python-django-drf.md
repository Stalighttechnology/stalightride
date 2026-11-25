# Track 02: Python, Django 5 & Backend Architecture (From Basics to Master)

In Synchoo, the backend is powered by **Python 3.13** and **Django 5.2** running under **Daphne (ASGI)**.

---

## 1. The Core Basics (Zero Prerequisites)

### What is Python?
Python is a clean, readable programming language. In Synchoo, Python acts as the orchestrator: it receives HTTP requests from the browser, validates inputs, coordinates external payment APIs, and talks to PostgreSQL.

### What is Django?
Django is a "batteries-included" web framework. Rather than reinventing web servers from scratch, Django provides:
* **URL Routing:** Mapping web addresses (`/api/query/`) to Python functions.
* **Settings & Config:** Managing secret keys, database credentials, and environments (`backend/config/settings.py`).
* **Management Commands:** Running automated jobs from the terminal (`python manage.py send_reminders`).

---

## 2. Intermediate Concepts: REST, DRF & Custom Middleware

### 2.1 Django REST Framework (DRF)
In Synchoo, the backend doesn't render HTML pages; it returns raw JSON data for the React frontend:
```python
from rest_framework.decorators import api_view
from rest_framework.response import Response

@api_view(["POST"])
def query(request):
    data = run_query(request.data)
    return Response({"data": data})
```

### 2.2 What is Middleware?
Middleware is a chain of security checkpoints that every incoming HTTP request passes through before reaching your code:

```
[ Incoming Request ] ──► [ Security Check 1 ] ──► [ DbRoleMiddleware ] ──► [ Your View ]
```

In Synchoo, [`backend/core/middleware.py`](file:///C:/Users/gclik/Desktop/Projects/Stalight%20Technologies/stalightride/backend/core/middleware.py) performs a brilliant architectural trick:
1. It opens an atomic database transaction.
2. It immediately sets the database role to `anon` (least privilege).
3. If the user sent a valid token, authentication upgrades the role to `authenticated`.
4. If anything crashes (HTTP 400 or 500), it rolls back the entire database transaction!

---

## 3. Advanced Synchoo Concepts: Raw SQL Cursors & The Query Engine

Most Django projects use the Django ORM (`Vehicle.objects.filter(...)`). 
In Synchoo, because business rules and Row-Level Security live in PostgreSQL, using heavy ORM models would bypass RLS or cause unnecessary overhead!

Instead, Synchoo uses **Direct Database Cursors**:
```python
from django.db import connection

with connection.cursor() as cursor:
    cursor.execute("SELECT id, title, price_per_day FROM public.vehicles WHERE city = %s", ["Bengaluru"])
    rows = cursor.fetchall()
```

### The Declarative Query Engine (`backend/core/query.py`)
Rather than writing 500 separate endpoints, `core/query.py` compiles JSON filter requests into safe parameterized SQL, checking every column against PostgreSQL's `information_schema` catalog to prevent SQL injection.

---

## 4. Where This Lives in the Synchoo Codebase

* `backend/manage.py`: The entry point for running commands (`runserver`, `migrate`, `send_reminders`).
* `backend/config/`: Master settings, ASGI/WSGI entry points, and root URL routes (`urls.py`, `asgi.py`).
* `backend/core/`: The core engine (`middleware.py`, `auth.py`, `query.py`, `views.py`, `db.py`).
* `backend/accounts/`: Sign-up, sign-in, token refresh, and Google OAuth handlers.
* `backend/payments/`: Server actions for Razorpay, wallet top-ups, and handover inspections.

---

## 5. Step-by-Step Learning Checklist

- [ ] **Step 1:** Learn Python 3 basics (Functions, Dicts, Lists, Classes, Exceptions, Context Managers `with`).
- [ ] **Step 2:** Understand HTTP Methods (`GET`, `POST`, `PUT`, `DELETE`) and Status Codes (`200`, `400`, `401`, `403`, `500`).
- [ ] **Step 3:** Build a simple Django project with an app and URL routing.
- [ ] **Step 4:** Learn Django REST Framework (DRF) `@api_view`, `Request`, and `Response`.
- [ ] **Step 5:** Understand Django Middleware lifecycle (`__init__`, `__call__`).
- [ ] **Step 6:** Learn how to execute raw SQL using `django.db.connection.cursor()`.
- [ ] **Step 7:** Read `backend/core/middleware.py` and trace how an HTTP request enters Synchoo.

---

## 6. Curated Learning Resources

* 🔗 [Watch: Python for Beginners Full Course (FreeCodeCamp)](https://www.youtube.com/results?search_query=FreeCodeCamp+Python+for+Beginners+Full+Course)
  * *Best for:* Mastering Python syntax from scratch.
* 🔗 [Watch: Django 5 Full Course for Beginners (Dennis Ivy / FreeCodeCamp)](https://www.youtube.com/results?search_query=FreeCodeCamp+Django+Full+Course+Dennis+Ivy)
  * *Best for:* Understanding project structures, apps, settings, and views.
* 🔗 [Watch: Django REST Framework (DRF) Crash Course (Dennis Ivy)](https://www.youtube.com/results?search_query=Dennis+Ivy+Django+REST+Framework+Crash+Course)
  * *Best for:* Building clean JSON APIs with DRF.
* 🔗 [Watch: Django Custom Middleware Deep Dive (Corey Schafer)](https://www.youtube.com/results?search_query=Django+Custom+Middleware+Corey+Schafer)
  * *Best for:* Mastering request/response interception and database transactions.
* 📖 [Read: Django Official Documentation: Executing Raw SQL](https://docs.djangoproject.com/en/5.0/topics/db/sql/)
