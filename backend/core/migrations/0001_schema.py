"""The whole database schema: backend/sql/schema.sql.

Needs the roles from scripts/bootstrap_db.sql (anon, authenticated,
service_role). Later schema changes are new migrations, not edits to the file.
"""

from pathlib import Path

from django.db import migrations

SCHEMA = Path(__file__).resolve().parents[2] / "sql" / "schema.sql"


def load(apps, schema_editor):
    schema_editor.execute(SCHEMA.read_text(encoding="utf-8"), params=None)


class Migration(migrations.Migration):
    initial = True
    dependencies = []
    operations = [migrations.RunPython(load, migrations.RunPython.noop)]
