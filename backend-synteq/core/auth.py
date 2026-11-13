"""Bearer-token authentication that also switches the database role."""

from rest_framework_simplejwt.authentication import JWTStatelessUserAuthentication

from .db import set_db_role


class JWTRoleAuthentication(JWTStatelessUserAuthentication):
    """Valid token: run the rest of the request as `authenticated` with auth.uid() set.

    No database lookup, so authentication never queries as `anon`. Without a
    token the request stays `anon` (see DbRoleMiddleware).
    """

    def authenticate(self, request):
        result = super().authenticate(request)
        if result is not None:
            set_db_role("authenticated", result[0].id)
        return result
