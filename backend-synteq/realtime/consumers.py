"""Live table changes over one WebSocket, as the old realtime feed did.

A trigger (core migration 0002) sends pg_notify('changes', {table, event,
key, value}) after each write. One LISTEN task per server process forwards
it to that process's sockets. Each socket re-reads the row as its own user,
so row-level security decides who sees what. The notify carries only the
row's key, because notify payloads are limited to 8 KB.

Client messages:  {"type": "subscribe", "id", "table", "event", "filter": "col=eq.value"}
                  {"type": "unsubscribe", "id"}
Server messages:  {"type": "change", "id", "payload": {schema, table, eventType, new, old}}
"""

import asyncio
import json
import logging
from urllib.parse import parse_qs

import psycopg
from channels.db import database_sync_to_async
from channels.generic.websocket import AsyncJsonWebsocketConsumer
from django.db import connection, transaction
from psycopg import sql
from rest_framework_simplejwt.exceptions import TokenError
from rest_framework_simplejwt.tokens import AccessToken

from core.db import set_db_role
from core.query import columns

log = logging.getLogger(__name__)
TABLES = {"messages", "booking_locations", "notifications", "public_drivers", "wallets", "wallet_transactions"}
EVENTS = {"*", "INSERT", "UPDATE", "DELETE"}
_sockets = set()
_listener = None


@database_sync_to_async
def _columns(table):
    return set(columns(table))


@database_sync_to_async
def _read_row(table, key, value, user_id):
    with transaction.atomic():
        set_db_role("authenticated" if user_id else "anon", user_id)
        with connection.cursor() as c:
            c.execute(sql.SQL("SELECT to_json(t) FROM public.{} AS t WHERE t.{}::text = %s").format(
                sql.Identifier(table), sql.Identifier(key)), [value])
            row = c.fetchone()
    return row[0] if row else None


async def _listen(params):
    while True:
        try:
            async with await psycopg.AsyncConnection.connect(**params, autocommit=True) as conn:
                await conn.execute("LISTEN changes")
                async for note in conn.notifies():
                    change = json.loads(note.payload)
                    for socket in list(_sockets):
                        asyncio.create_task(socket.deliver(change))
        except asyncio.CancelledError:
            raise
        except Exception:
            log.exception("realtime listener lost its connection; retrying")
            await asyncio.sleep(2)


def _ensure_listener():
    global _listener
    loop = asyncio.get_running_loop()
    if _listener is None or _listener.done() or _listener.get_loop() is not loop:
        s = connection.settings_dict
        params = {"dbname": s["NAME"], "user": s["USER"], "password": s["PASSWORD"],
                  "host": s["HOST"] or None, "port": s["PORT"] or None}
        _listener = loop.create_task(_listen(params))


class ChangesConsumer(AsyncJsonWebsocketConsumer):
    async def connect(self):
        self.user_id, self.subs = None, {}
        token = parse_qs(self.scope["query_string"].decode()).get("token", [None])[0]
        if token:
            try:
                self.user_id = str(AccessToken(token)["sub"])
            except TokenError:
                await self.close(code=4001)  # client refreshes its token and reconnects
                return
        await self.accept()
        _sockets.add(self)
        _ensure_listener()

    async def disconnect(self, code):
        _sockets.discard(self)

    async def receive_json(self, msg, **kwargs):
        sid = msg.get("id")
        if msg.get("type") == "unsubscribe":
            self.subs.pop(sid, None)
            return
        if msg.get("type") != "subscribe":
            return
        table, event, flt = msg.get("table"), str(msg.get("event") or "*").upper(), msg.get("filter")
        col = val = None
        if flt:
            col, _, rest = str(flt).partition("=")
            op, _, val = rest.partition(".")
            if op != "eq" or col not in await _columns(table):
                col = None
                table = None
        if table not in TABLES or event not in EVENTS:
            await self.send_json({"type": "error", "id": sid, "message": "Cannot subscribe to that"})
            return
        self.subs[sid] = (table, event, col, val)
        await self.send_json({"type": "subscribed", "id": sid})

    async def deliver(self, change):
        matches = [(sid, s) for sid, s in self.subs.items()
                   if s[0] == change["table"] and s[1] in ("*", change["event"])]
        if not matches:
            return
        deleted = change["event"] == "DELETE"
        row = None if deleted else await _read_row(change["table"], change["key"], change["value"], self.user_id)
        if row is None and not deleted:
            return  # this user may not see the row
        for sid, (table, _, col, val) in matches:
            if col and (row is None or str(row.get(col)) != val):
                continue
            await self.send_json({"type": "change", "id": sid, "payload": {
                "schema": "public", "table": table, "eventType": change["event"],
                "new": row or {}, "old": {change["key"]: change["value"]} if deleted else {},
            }})
