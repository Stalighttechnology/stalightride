"""Live updates arrive only for rows the socket's user may read."""

import asyncio
import uuid

import pytest
from asgiref.sync import async_to_sync
from channels.db import database_sync_to_async
from channels.testing import WebsocketCommunicator
from django.contrib.auth import get_user_model
from django.db import connection, transaction

from accounts.views import session_for
from config.asgi import application


def _notify(user_id):
    with connection.cursor() as c:
        c.execute("INSERT INTO public.notifications (user_id, title, body) VALUES (%s, 'live', 'hello')", [user_id])


@pytest.mark.django_db(transaction=True)
def test_notification_reaches_its_owner_only():
    user = get_user_model().objects.create_user(f"live-{uuid.uuid4()}@example.com", "secret123")
    with transaction.atomic():
        token = session_for(user)["access_token"]
    spec = {"type": "subscribe", "id": "1", "table": "notifications", "event": "INSERT", "filter": f"user_id=eq.{user.id}"}

    async def scenario():
        owner = WebsocketCommunicator(application, f"/ws/?token={token}")
        stranger = WebsocketCommunicator(application, "/ws/")
        assert (await owner.connect())[0] and (await stranger.connect())[0]
        for sock in (owner, stranger):
            await sock.send_json_to(spec)
            assert (await sock.receive_json_from(timeout=5))["type"] == "subscribed"
        await asyncio.sleep(0.5)  # let the listener start LISTENing
        await database_sync_to_async(_notify)(user.id)
        msg = await owner.receive_json_from(timeout=5)
        assert msg["payload"]["eventType"] == "INSERT" and msg["payload"]["new"]["title"] == "live"
        assert await stranger.receive_nothing(timeout=1)
        await owner.disconnect()
        await stranger.disconnect()

    try:
        async_to_sync(scenario)()
    finally:
        user.delete()  # this test commits for real; remove its rows
