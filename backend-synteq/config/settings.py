import os
from datetime import timedelta
from pathlib import Path
from urllib.parse import unquote, urlparse

BASE_DIR = Path(__file__).resolve().parent.parent

# backend/.env: KEY=VALUE lines; real environment variables win.
_env = BASE_DIR / ".env"
if _env.exists():
    for _line in _env.read_text().splitlines():
        if "=" in _line and not _line.lstrip().startswith("#"):
            _k, _v = _line.split("=", 1)
            os.environ.setdefault(_k.strip(), _v.strip())

DEBUG = os.environ.get("DJANGO_DEBUG", "0") == "1"
SECRET_KEY = os.environ.get("DJANGO_SECRET_KEY") or "synchoo-production-secret-key-fallback-replace-me"

# In production, allow all or specify domains via DJANGO_ALLOWED_HOSTS (e.g. *.synteq.cloud, localhost)
_allowed = os.environ.get("DJANGO_ALLOWED_HOSTS", "*")
ALLOWED_HOSTS = [h.strip() for h in _allowed.split(",") if h.strip()]

INSTALLED_APPS = [
    "daphne",  # ASGI server for HTTP & WebSockets
    "django.contrib.staticfiles",
    "django.contrib.contenttypes",
    "django.contrib.auth",
    "rest_framework",
    "rest_framework_simplejwt.token_blacklist",
    "channels",
    "core",
    "accounts",
]

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "django.middleware.common.CommonMiddleware",
    "core.middleware.DbRoleMiddleware",
]

try:
    import corsheaders  # noqa: F401
    INSTALLED_APPS.insert(1, "corsheaders")
    MIDDLEWARE.insert(0, "corsheaders.middleware.CorsMiddleware")
except ImportError:
    pass

try:
    import whitenoise  # noqa: F401
    sec_idx = MIDDLEWARE.index("django.middleware.security.SecurityMiddleware")
    MIDDLEWARE.insert(sec_idx + 1, "whitenoise.middleware.WhiteNoiseMiddleware")
except ImportError:
    pass

# CORS configuration
CORS_ALLOW_ALL_ORIGINS = os.environ.get("CORS_ALLOW_ALL", "0") == "1" or DEBUG
_cors = os.environ.get("CORS_ALLOWED_ORIGINS", "http://localhost:8080")
CORS_ALLOWED_ORIGINS = [url.strip() for url in _cors.split(",") if url.strip()]
CORS_ALLOW_CREDENTIALS = True

ROOT_URLCONF = "config.urls"
WSGI_APPLICATION = "config.wsgi.application"
ASGI_APPLICATION = "config.asgi.application"

def _get_db_config():
    db_url = os.environ.get("DATABASE_URL")
    if db_url:
        p = urlparse(db_url)
        return {
            "ENGINE": "django.db.backends.postgresql",
            "NAME": p.path.lstrip("/"),
            "USER": unquote(p.username or "postgres"),
            "PASSWORD": unquote(p.password or ""),
            "HOST": p.hostname or "localhost",
            "PORT": str(p.port or 5432),
        }
    return {
        "ENGINE": "django.db.backends.postgresql",
        "NAME": os.environ.get("DB_NAME", "synchoo"),
        "USER": os.environ.get("DB_USER", "synchoo"),
        "PASSWORD": os.environ.get("DB_PASSWORD", "synchoo"),
        "HOST": os.environ.get("DB_HOST", "localhost"),
        "PORT": os.environ.get("DB_PORT", "5432"),
    }

DATABASES = {"default": _get_db_config()}

AUTH_USER_MODEL = "accounts.User"
REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": ["core.auth.JWTRoleAuthentication"],
    "DEFAULT_PERMISSION_CLASSES": ["rest_framework.permissions.AllowAny"],
    "DEFAULT_RENDERER_CLASSES": ["rest_framework.renderers.JSONRenderer"],
    "DEFAULT_PARSER_CLASSES": ["rest_framework.parsers.JSONParser"],
    "UNAUTHENTICATED_USER": None,
}
SIMPLE_JWT = {
    "ACCESS_TOKEN_LIFETIME": timedelta(hours=1),
    "REFRESH_TOKEN_LIFETIME": timedelta(days=30),
    "USER_ID_FIELD": "id",
    "USER_ID_CLAIM": "sub",
    "SIGNING_KEY": SECRET_KEY,
}

# Static files
STATIC_URL = "/static/"
STATIC_ROOT = BASE_DIR / "staticfiles"

# Uploaded files (see files/views.py).
MEDIA_ROOT = Path(os.environ.get("MEDIA_ROOT", BASE_DIR / "media"))
DATA_UPLOAD_MAX_MEMORY_SIZE = 25 * 1024 * 1024

# Where links in emails point (password reset).
FRONTEND_URL = os.environ.get("FRONTEND_URL", "http://localhost:8080").rstrip("/")
GOOGLE_CLIENT_ID = os.environ.get("GOOGLE_CLIENT_ID", "")
RAZORPAY_KEY_ID = os.environ.get("RAZORPAY_KEY_ID", "")
RAZORPAY_KEY_SECRET = os.environ.get("RAZORPAY_KEY_SECRET", "")

# Email goes to the console unless SMTP is configured.
EMAIL_BACKEND = ("django.core.mail.backends.smtp.EmailBackend" if os.environ.get("EMAIL_HOST")
                 else "django.core.mail.backends.console.EmailBackend")
EMAIL_HOST = os.environ.get("EMAIL_HOST", "")
EMAIL_PORT = int(os.environ.get("EMAIL_PORT", "587"))
EMAIL_HOST_USER = os.environ.get("EMAIL_HOST_USER", "")
EMAIL_HOST_PASSWORD = os.environ.get("EMAIL_HOST_PASSWORD", "")
EMAIL_USE_TLS = True
DEFAULT_FROM_EMAIL = os.environ.get("DEFAULT_FROM_EMAIL", "Synchoo <no-reply@localhost>")

# Trip times are wall-clock times in India.
BUSINESS_TIME_ZONE = "Asia/Kolkata"
USE_TZ = True
TIME_ZONE = "UTC"
DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"
