from django.db import transaction

from .db import set_db_role


class DbRoleMiddleware:
    """One transaction per request, starting as `anon`.

    Authentication upgrades the role to `authenticated` for a signed-in user,
    so code that forgets to authenticate gets the least access, not the most.
    """

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        with transaction.atomic():
            set_db_role("anon")
            response = self.get_response(request)
            if response.status_code >= 400:
                transaction.set_rollback(True)
        return response
