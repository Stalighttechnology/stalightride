import os

from django.core.asgi import get_asgi_application

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")
http = get_asgi_application()  # must load before the consumer imports models

from channels.routing import ProtocolTypeRouter, URLRouter  # noqa: E402
from django.urls import path  # noqa: E402

from realtime.consumers import ChangesConsumer  # noqa: E402

application = ProtocolTypeRouter({
    "http": http,
    "websocket": URLRouter([path("ws/", ChangesConsumer.as_asgi())]),
})
