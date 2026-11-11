from django.urls import path

from accounts import views as auth
from core import views as core
from files import views as files
from payments import views as payments

urlpatterns = [
    path("api/query/", core.query),
    path("api/rpc/<str:name>/", core.rpc),
    path("api/fn/<str:name>/", payments.call),
    path("api/auth/signup/", auth.signup),
    path("api/auth/signin/", auth.signin),
    path("api/auth/refresh/", auth.refresh),
    path("api/auth/signout/", auth.signout),
    path("api/auth/user/", auth.current_user),
    path("api/auth/google/", auth.google),
    path("api/auth/password-reset/", auth.password_reset),
    path("api/auth/password-reset/confirm/", auth.password_reset_confirm),
    path("api/storage/<str:bucket>/upload/", files.upload),
    path("api/storage/<str:bucket>/remove/", files.remove),
    path("api/storage/<str:bucket>/sign/", files.sign),
    path("api/storage/public/<str:bucket>/<path:path>", files.public_file),
    path("api/storage/file/<str:token>", files.signed_file),
]
