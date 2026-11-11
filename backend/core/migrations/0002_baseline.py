"""Load the schema inherited from Supabase, file by file, unedited."""

from django.conf import settings
from django.db import migrations

# QA seed: sets a test account's wallet to 500000 with no ledger row.
SKIP = {"20260811151118"}

# Supabase grants these on everything created in `public`; the SQL files only
# state the exceptions (REVOKE ...) and leave row-level security to gate rows.
# Scoped to this migration so Django's own tables never get them.
_PRIVS = (
    "ALTER DEFAULT PRIVILEGES IN SCHEMA public {verb} ALL ON TABLES {prep} anon, authenticated, service_role;"
    "ALTER DEFAULT PRIVILEGES IN SCHEMA public {verb} ALL ON SEQUENCES {prep} anon, authenticated, service_role;"
    "ALTER DEFAULT PRIVILEGES IN SCHEMA public {verb} ALL ON FUNCTIONS {prep} anon, authenticated, service_role;"
)


def load(apps, schema_editor):
    files = sorted(p for p in settings.BASELINE_SQL_DIR.glob("*.sql") if p.name.split("_")[0] not in SKIP)
    if not files:
        raise RuntimeError(f"no SQL files in {settings.BASELINE_SQL_DIR}")
    schema_editor.execute(_PRIVS.format(verb="GRANT", prep="TO"))
    try:
        for path in files:
            try:
                # One file = one implicit transaction, as on Supabase.
                schema_editor.execute(path.read_text(encoding="utf-8"), params=None)
            except Exception as exc:
                raise RuntimeError(f"baseline file failed: {path.name}: {exc}") from exc
    finally:
        schema_editor.execute(_PRIVS.format(verb="REVOKE", prep="FROM"))


class Migration(migrations.Migration):
    # shortcut: loads whatever files exist at migrate time, and a failure
    # leaves a half-built database. While main still adds files to
    # supabase/migrations, recreate the database after pulling them. Once that
    # folder is frozen, schema changes are ordinary Django migrations.
    atomic = False
    dependencies = [("core", "0001_supabase_compat")]
    operations = [migrations.RunPython(load, migrations.RunPython.noop)]
