import os
import sys
from daphne.cli import CommandLineInterface

port = os.environ.get("PORT", "8000")
try:
    int(port)
except ValueError:
    port = "8000"

bind = os.environ.get("HOST", "0.0.0.0")

print(f"--> Starting Daphne ASGI server on {bind}:{port}...", flush=True)
sys.argv = ["daphne", "-b", bind, "-p", str(port), "config.asgi:application"]
CommandLineInterface().entrypoint()
