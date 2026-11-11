"""The load-bearing piece: queries run as the right role, and RLS follows."""

import uuid

import pytest
from django.db import connection, transaction
from django.http import HttpResponse

from core.db import db_role, set_db_role
from core.middleware import DbRoleMiddleware

pytestmark = pytest.mark.django_db


def q(sql, params=None):
    with connection.cursor() as c:
        c.execute(sql, params)
        return c.fetchall()


def make_user(email):
    uid = uuid.uuid4()
    q("INSERT INTO auth.users (id, email) VALUES (%s, %s) RETURNING id", [uid, email])
    return uid


def test_baseline_loaded():
    tables = q("SELECT count(*) FROM pg_tables WHERE schemaname = 'public' AND rowsecurity")[0][0]
    policies = q("SELECT count(*) FROM pg_policies WHERE schemaname = 'public'")[0][0]
    assert tables >= 35 and policies >= 95


def test_signup_trigger_creates_profile_and_role():
    uid = make_user("a@example.com")
    assert q("SELECT count(*) FROM public.profiles WHERE id = %s", [uid])[0][0] == 1
    assert q("SELECT role::text FROM public.user_roles WHERE user_id = %s", [uid]) == [("customer",)]


def test_rls_follows_the_role():
    a, b = make_user("a@example.com"), make_user("b@example.com")

    with db_role("authenticated", a):
        assert q("SELECT auth.uid()")[0][0] == a
        assert [r[0] for r in q("SELECT id FROM public.profiles")] == [a]
    with db_role("authenticated", b):
        assert [r[0] for r in q("SELECT id FROM public.profiles")] == [b]
    with db_role("anon"):
        assert q("SELECT id FROM public.profiles") == []
    with db_role("service_role"):
        assert len(q("SELECT id FROM public.profiles")) == 2


def test_role_is_restored():
    owner = q("SELECT current_user")[0][0]
    with db_role("anon"):
        assert q("SELECT current_user")[0][0] == "anon"
    assert q("SELECT current_user")[0][0] == owner


@pytest.mark.django_db(transaction=True)
def test_set_db_role_refuses_outside_a_transaction():
    with pytest.raises(RuntimeError):
        set_db_role("anon")
    with transaction.atomic():
        set_db_role("anon")


def test_middleware_starts_every_request_as_anon(rf):
    seen = []

    def view(request):
        seen.append(q("SELECT current_user")[0][0])
        return HttpResponse()

    DbRoleMiddleware(view)(rf.get("/"))
    assert seen == ["anon"]
