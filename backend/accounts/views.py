"""Sign up, sign in, tokens, Google sign-in and password reset.

Responses use the session and user shapes the frontend already reads:
session = {access_token, refresh_token, expires_in, expires_at, user},
user = {id, email, created_at, user_metadata}.
"""

import json
import logging

import jwt
from django.conf import settings
from django.contrib.auth import get_user_model
from django.contrib.auth.tokens import default_token_generator
from django.core.mail import send_mail
from django.core.validators import validate_email
from django.core.exceptions import ValidationError
from django.db import connection
from django.utils.encoding import force_bytes, force_str
from django.utils.http import urlsafe_base64_decode, urlsafe_base64_encode
from rest_framework.decorators import api_view
from rest_framework.response import Response
from rest_framework_simplejwt.exceptions import TokenError
from rest_framework_simplejwt.tokens import RefreshToken

from core.db import as_owner

User = get_user_model()
log = logging.getLogger(__name__)
MIN_PASSWORD = 6
_google_keys = jwt.PyJWKClient("https://www.googleapis.com/oauth2/v3/certs", cache_keys=True)


def _error(message, code, status=400):
    return Response({"message": message, "code": code}, status=status)


def user_payload(user_id):
    with as_owner(), connection.cursor() as c:
        c.execute("SELECT id, email, created_at, raw_user_meta_data FROM auth.users WHERE id = %s", [user_id])
        row = c.fetchone()
    if row is None:
        return None
    meta = json.loads(row[3]) if isinstance(row[3], str) else row[3]  # Django loads jsonb as text
    return {"id": str(row[0]), "email": row[1], "created_at": row[2].isoformat(),
            "user_metadata": meta or {}, "app_metadata": {}}


def _session(refresh, user_id):
    access = refresh.access_token
    return {
        "access_token": str(access),
        "refresh_token": str(refresh),
        "token_type": "bearer",
        "expires_in": int(access.lifetime.total_seconds()),
        "expires_at": int(access["exp"]),
        "user": user_payload(user_id),
    }


def session_for(user):
    with as_owner():
        return _session(RefreshToken.for_user(user), user.id)


@api_view(["POST"])
def signup(request):
    email = str(request.data.get("email") or "").strip().lower()
    password = str(request.data.get("password") or "")
    metadata = request.data.get("data") or {}
    try:
        validate_email(email)
    except ValidationError:
        return _error("Unable to validate email address: invalid format", "validation_failed")
    if len(password) < MIN_PASSWORD:
        return _error(f"Password should be at least {MIN_PASSWORD} characters.", "weak_password", 422)
    if not isinstance(metadata, dict):
        return _error("data must be an object", "validation_failed")

    ref = str(request.data.get("ref") or metadata.get("ref") or "").strip().upper()
    referrer_id = None

    with as_owner():
        if ref:
            with connection.cursor() as cur:
                cur.execute("SELECT id FROM public.profiles WHERE upper(referral_code) = %s", [ref])
                row = cur.fetchone()
                if not row and ref.startswith("SYN-"):
                    clean_ref = ref[4:].replace("-", "")
                    cur.execute("SELECT id FROM public.profiles WHERE upper(replace(id::text, '-', '')) LIKE %s", [f"{clean_ref}%"])
                    row = cur.fetchone()
                if row:
                    referrer_id = row[0]

        if User.objects.filter(email=email).exists():
            return _error("User already registered", "user_already_exists", 422)
        user = User.objects.create_user(email, password, **metadata)

        if referrer_id:
            with connection.cursor() as cur:
                cur.execute("UPDATE public.profiles SET referred_by = %s WHERE id = %s", [referrer_id, user.id])

    session = session_for(user)
    return Response({"user": session["user"], "session": session})


import re

INVISIBLE_CHARS_RE = re.compile(r"[\u200b-\u200d\ufeff\u00a0]")

def _clean_str(val):
    if not val:
        return ""
    return INVISIBLE_CHARS_RE.sub("", str(val)).strip().strip("\"'")

@api_view(["POST"])
def signin(request):
    raw_email = request.data.get("email")
    raw_password = request.data.get("password")
    email = _clean_str(raw_email).lower()
    password = str(raw_password or "")
    cleaned_pw = _clean_str(password)

    with as_owner():
        user = User.objects.filter(email=email, is_active=True).first()
        ok = user is not None and (
            user.check_password(password)
            or user.check_password(cleaned_pw)
            or user.check_password(password.strip())
        )
    if not ok:
        return _error("Invalid login credentials", "invalid_credentials")
    session = session_for(user)
    return Response({"user": session["user"], "session": session})


@api_view(["POST"])
def refresh(request):
    try:
        with as_owner():
            old = RefreshToken(str(request.data.get("refresh_token") or ""))
            user_id = old["sub"]
            if not User.objects.filter(id=user_id, is_active=True).exists():
                raise TokenError("user is inactive")
            old.blacklist()
            new = RefreshToken.for_user(User.objects.get(id=user_id))
            return Response(_session(new, user_id))
    except TokenError:
        return _error("Invalid Refresh Token", "refresh_token_not_found", 401)


@api_view(["POST"])
def signout(request):
    try:
        with as_owner():
            RefreshToken(str(request.data.get("refresh_token") or "")).blacklist()
    except TokenError:
        pass  # already invalid: signed out either way
    return Response(status=204)


@api_view(["GET"])
def current_user(request):
    if not request.user:
        return _error("Auth session missing!", "session_not_found", 401)
    payload = user_payload(request.user.id)
    if payload is None:
        return _error("User from sub claim in JWT does not exist", "user_not_found", 403)
    return Response(payload)


@api_view(["POST"])
def google(request):
    """Exchange a Google ID token (from the sign-in redirect) for a session."""
    if not settings.GOOGLE_CLIENT_ID:
        return _error("Google sign-in is not configured", "provider_disabled")
    token = str(request.data.get("id_token") or "")
    try:
        key = _google_keys.get_signing_key_from_jwt(token)
        claims = jwt.decode(token, key.key, algorithms=["RS256"], audience=settings.GOOGLE_CLIENT_ID,
                            issuer=["https://accounts.google.com", "accounts.google.com"])
    except jwt.PyJWTError as e:
        log.warning("Google sign-in rejected: %s: %s", type(e).__name__, e)
        return _error("Invalid Google sign-in", "bad_oauth_callback", 401)
    if claims.get("nonce") != request.data.get("nonce") or not claims.get("email_verified"):
        log.warning("Google sign-in rejected: nonce %s, email_verified=%s",
                    "missing" if not request.data.get("nonce") else
                    "ok" if claims.get("nonce") == request.data.get("nonce") else "mismatch",
                    claims.get("email_verified"))
        return _error("Invalid Google sign-in", "bad_oauth_callback", 401)
    email = claims["email"].lower()
    with as_owner():
        user = User.objects.filter(email=email).first()
        if user is None:
            user = User.objects.create_user(
                email, full_name=claims.get("name") or email.split("@")[0], avatar_url=claims.get("picture"))
        elif not user.is_active:
            return _error("User is banned", "user_banned", 403)
    return Response(session_for(user))


@api_view(["POST"])
def password_reset(request):
    """Email a reset link. Always answers the same so it never reveals who has an account."""
    email = str(request.data.get("email") or "").strip().lower()
    with as_owner():
        user = User.objects.filter(email=email, is_active=True).first()
        if user:
            uid = urlsafe_base64_encode(force_bytes(user.pk))
            link = f"{settings.FRONTEND_URL}/reset-password?uid={uid}&token={default_token_generator.make_token(user)}"
            send_mail("Reset your Synchoo password",
                      f"Open this link to choose a new password:\n\n{link}\n\nIf you did not ask for this, ignore this email.",
                      None, [user.email])
    return Response({})


@api_view(["POST"])
def password_reset_confirm(request):
    password = str(request.data.get("password") or "")
    if len(password) < MIN_PASSWORD:
        return _error(f"Password should be at least {MIN_PASSWORD} characters.", "weak_password", 422)
    with as_owner():
        try:
            user = User.objects.get(pk=force_str(urlsafe_base64_decode(str(request.data.get("uid") or ""))))
        except (User.DoesNotExist, ValueError, ValidationError):
            user = None
        if user is None or not default_token_generator.check_token(user, str(request.data.get("token") or "")):
            return _error("This reset link is invalid or has expired", "otp_expired")
        user.set_password(password)
        user.save(update_fields=["password"])
    return Response(session_for(user))

