from django.db import DatabaseError, connection
from rest_framework.decorators import api_view
from rest_framework.response import Response

from .query import QueryError, run, run_rpc


def pg_error(exc):
    """A database error in the shape the frontend reads: {message, code, details, hint}."""
    cause = exc.__cause__ or exc
    diag = getattr(cause, "diag", None)
    return {
        "message": (diag and diag.message_primary) or str(cause),
        "code": getattr(cause, "sqlstate", None),
        "details": diag and diag.message_detail,
        "hint": diag and diag.message_hint,
    }


def guarded(fn):
    """Run fn(); map query and database errors to HTTP 400-style responses."""
    with connection.cursor() as c:
        c.execute("SET LOCAL statement_timeout = '10s'")
    try:
        return Response(fn())
    except QueryError as e:
        return Response(e.body, status=e.status)
    except DatabaseError as e:
        return Response(pg_error(e), status=400)


@api_view(["POST"])
def query(request):
    def go():
        data, count = run(request.data)
        return {"data": data, "count": count}

    return guarded(go)


@api_view(["POST"])
def rpc(request, name):
    return guarded(lambda: {"data": run_rpc(name, request.data)})
