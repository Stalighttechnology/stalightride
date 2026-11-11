"""Uploads, deletes and signed links for the five storage buckets.

Files live on disk under MEDIA_ROOT/<bucket>/<path>. Every action first
writes or reads the matching storage.objects row as the request's role, so
the bucket policies in the schema decide who may upload, read or delete.
"""

import mimetypes
import time
from pathlib import Path, PurePosixPath

from django.conf import settings
from django.core import signing
from django.db import DatabaseError, connection, transaction
from django.http import FileResponse, Http404
from rest_framework.decorators import api_view, parser_classes
from rest_framework.parsers import JSONParser, MultiPartParser
from rest_framework.response import Response

from core.views import pg_error

MAX_UPLOAD = 20 * 1024 * 1024
_SALT = "storage-link"


def _error(message, status=400, code=None):
    return Response({"message": message, "statusCode": str(status), "code": code}, status=status)


def _clean(path):
    """A safe relative path like 'uid/file.jpg', or None."""
    p = PurePosixPath(str(path or "").strip())
    if not p.parts or p.is_absolute() or any(part in ("", ".", "..") for part in p.parts) or "\\" in str(p):
        return None
    return str(p)


def _disk(bucket, path):
    root = (Path(settings.MEDIA_ROOT) / bucket).resolve()
    full = (root / path).resolve()
    if root not in full.parents:
        raise Http404
    return full


def _bucket(bucket):
    with connection.cursor() as c:
        c.execute("SELECT public FROM storage.buckets WHERE id = %s", [bucket])
        row = c.fetchone()
    return None if row is None else row[0]


def _link(request, bucket, path, expires_in):
    token = signing.dumps({"b": bucket, "p": path, "e": int(time.time()) + int(expires_in)}, salt=_SALT)
    return request.build_absolute_uri(f"/api/storage/file/{token}")


@api_view(["POST"])
@parser_classes([MultiPartParser])
def upload(request, bucket):
    path, file = _clean(request.data.get("path")), request.FILES.get("file")
    upsert = str(request.data.get("upsert")).lower() == "true"
    if _bucket(bucket) is None:
        return _error("Bucket not found", 404)
    if path is None or file is None:
        return _error("path and file are required")
    if file.size > MAX_UPLOAD:
        return _error("The object exceeded the maximum allowed size", 413, "EntityTooLarge")
    conflict = "DO UPDATE SET created_at = now()" if upsert else "DO NOTHING"
    try:
        with connection.cursor() as c:
            c.execute(
                f"INSERT INTO storage.objects (bucket_id, name, owner) VALUES (%s, %s, auth.uid()) "
                f"ON CONFLICT (bucket_id, name) {conflict}",
                [bucket, path])
            # No RETURNING: that would also need read access, which a draft vehicle's images lack.
            created = c.rowcount
    except DatabaseError as e:
        err = pg_error(e)
        return _error("new row violates row-level security policy" if err["code"] == "42501" else err["message"], 403)
    if not created:
        return _error("The resource already exists", 409, "Duplicate")
    target = _disk(bucket, path)
    target.parent.mkdir(parents=True, exist_ok=True)
    with open(target, "wb") as out:
        for chunk in file.chunks():
            out.write(chunk)
    return Response({"path": path, "fullPath": f"{bucket}/{path}"})


@api_view(["POST"])
@parser_classes([JSONParser])
def remove(request, bucket):
    paths = [p for p in map(_clean, request.data.get("paths") or []) if p]
    with connection.cursor() as c:
        c.execute("DELETE FROM storage.objects WHERE bucket_id = %s AND name = ANY(%s::text[]) RETURNING name", [bucket, paths])
        removed = [r[0] for r in c.fetchall()]

    def unlink():
        for p in removed:
            _disk(bucket, p).unlink(missing_ok=True)

    transaction.on_commit(unlink)  # keep the files if the request rolls back
    return Response([{"name": p, "bucket_id": bucket} for p in removed])


@api_view(["POST"])
@parser_classes([JSONParser])
def sign(request, bucket):
    """Signed links for paths the caller may read. Body: {paths, expiresIn}."""
    expires_in = int(request.data.get("expiresIn") or 3600)
    paths = [_clean(p) for p in request.data.get("paths") or []]
    with connection.cursor() as c:
        c.execute("SELECT name FROM storage.objects WHERE bucket_id = %s AND name = ANY(%s::text[])",
                  [bucket, [p for p in paths if p]])
        readable = {r[0] for r in c.fetchall()}
    return Response([
        {"path": p, "signedUrl": _link(request, bucket, p, expires_in), "error": None} if p in readable
        else {"path": p, "signedUrl": None, "error": "Object not found"}
        for p in paths
    ])


def _serve(bucket, path):
    full = _disk(bucket, path)
    if not full.is_file():
        raise Http404
    kind = mimetypes.guess_type(full.name)[0] or "application/octet-stream"
    return FileResponse(open(full, "rb"), content_type=kind)


def public_file(request, bucket, path):
    """Files in public buckets need no login, as before."""
    path = _clean(path)
    if path is None or _bucket(bucket) is not True:
        raise Http404
    return _serve(bucket, path)


def signed_file(request, token):
    try:
        data = signing.loads(token, salt=_SALT)
    except signing.BadSignature:
        raise Http404
    if data["e"] < time.time() or _clean(data["p"]) is None:
        raise Http404
    return _serve(data["b"], data["p"])
