"""System audit logging helper.

Records end-to-end events (auth login/signup/signout, user instructions, bookings,
cancellations, payments, payouts, server activities and errors) into public.system_audit_logs.
"""

import json
import logging
from django.db import connection
from core.db import as_owner

log = logging.getLogger(__name__)


def log_audit_event(
    event_type: str,
    category: str,
    action: str,
    level: str = "info",
    actor_id=None,
    actor_email: str = None,
    actor_role: str = None,
    target_id: str = None,
    target_type: str = None,
    details: dict = None,
    request=None,
):
    """Safely insert an audit log record into public.system_audit_logs."""
    ip = None
    ua = None
    if request:
        ip = (
            request.META.get("HTTP_X_FORWARDED_FOR", "").split(",")[0].strip()
            or request.META.get("REMOTE_ADDR")
        )
        ua = request.META.get("HTTP_USER_AGENT", "")[:300]
        if not actor_id and getattr(request, "user", None) and getattr(request.user, "is_authenticated", False):
            actor_id = str(request.user.id)
            if hasattr(request.user, "email"):
                actor_email = request.user.email

    try:
        details_json = json.dumps(details or {})
        with as_owner(), connection.cursor() as cur:
            cur.execute(
                """
                INSERT INTO public.system_audit_logs (
                    event_type, category, level, actor_id, actor_email, actor_role,
                    action, target_id, target_type, details, ip_address, user_agent
                ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s::jsonb, %s, %s)
                """,
                [
                    event_type,
                    category,
                    level,
                    actor_id,
                    actor_email,
                    actor_role,
                    action,
                    target_id,
                    target_type,
                    details_json,
                    ip,
                    ua,
                ],
            )
    except Exception as e:
        log.warning("Failed to record audit log: %s", e)
