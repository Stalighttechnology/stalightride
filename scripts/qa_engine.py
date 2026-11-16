"""Traceability matrix and test runner for all 97 test cases from TEST_CASES.md.
Executes against live running backend at http://localhost:8000 and database.
"""

import json
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import date, datetime, timedelta
from decimal import Decimal
from pathlib import Path
from zoneinfo import ZoneInfo

backend_dir = Path("c:/Users/gchir/stalight_ride/backend").resolve()
sys.path.insert(0, str(backend_dir))

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
import django
django.setup()

from django.db import connection

BASE_URL = "http://localhost:8000"
IST = ZoneInfo("Asia/Kolkata")

def q(sql, params=None):
    with connection.cursor() as c:
        c.execute(sql, params)
        return c.fetchall() if c.description else None

def admin_q(sql, params=None):
    with connection.cursor() as c:
        c.execute("SELECT set_config('request.jwt.claim.sub', id::text, false) FROM auth.users WHERE email = 'c3-admin@test.local';")
        c.execute(sql, params)
        return c.fetchall() if c.description else None

def http_post(endpoint, data=None, token=None):
    url = f"{BASE_URL}{endpoint}"
    payload = json.dumps(data or {}).encode("utf-8")
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    req = urllib.request.Request(url, data=payload, headers=headers)
    try:
        with urllib.request.urlopen(req) as resp:
            content = resp.read().decode("utf-8")
            if not content:
                return resp.status, {}
            return resp.status, json.loads(content)
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8")
        if not body:
            return e.code, {}
        try:
            return e.code, json.loads(body)
        except Exception:
            return e.code, {"raw": body}
    except Exception as e:
        return 0, {"error": str(e)}

def http_get(endpoint, token=None):
    url = f"{BASE_URL}{endpoint}"
    headers = {}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    req = urllib.request.Request(url, headers=headers)
    try:
        with urllib.request.urlopen(req) as resp:
            content = resp.read().decode("utf-8")
            if not content:
                return resp.status, {}
            return resp.status, json.loads(content)
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8")
        if not body:
            return e.code, {}
        try:
            return e.code, json.loads(body)
        except Exception:
            return e.code, {"raw": body}
    except Exception as e:
        return 0, {"error": str(e)}

def login(email, password="Test@12345"):
    st, res = http_post("/api/auth/signin/", {"email": email, "password": password})
    if st == 200 and "session" in res:
        return res["session"]["access_token"], res["user"]
    raise RuntimeError(f"Login failed for {email} ({st}): {res}")

def run_ff_cmd(ff_name):
    from scripts.run_ff import execute_ff
    return execute_ff(ff_name)

# Container for all results
RESULTS = {}

def record(test_id, name, status, expected, actual, evidence=""):
    RESULTS[test_id] = {
        "id": test_id,
        "name": name,
        "status": status,
        "expected": expected,
        "actual": actual,
        "evidence": evidence
    }
    print(f"[{test_id}] {status}: {actual[:100]}")

print("Test infrastructure initialized successfully.")
