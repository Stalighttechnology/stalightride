"""Run a query chain from the frontend (`api.from(t).select(...).eq(...)`) as SQL.

The query runs as the request's database role, so row-level security and
grants decide what is visible and writable; this module only translates.
Table, column and operator names are checked against the catalog or a fixed
list and quoted as identifiers. Values are always bound parameters.
"""

import re
from functools import lru_cache

from django.db import connection
from psycopg import sql
from psycopg.types.json import Json

MAX_ROWS = 1000  # same cap as the hosted API the frontend was written against

_OPS = {"eq": "=", "neq": "<>", "gt": ">", "gte": ">=", "lt": "<", "lte": "<=", "like": "LIKE", "ilike": "ILIKE"}
_ARRAY_OPS = {"cs": "@>", "contains": "@>", "cd": "<@", "containedBy": "<@", "ov": "&&", "overlaps": "&&"}
_EMBED = re.compile(r"^(?:(\w+):)?(\w+)(?:!\w+)?\((.*)\)$", re.S)
_COLUMN = re.compile(r"^(?:(\w+):)?(\w+)$")


class QueryError(Exception):
    def __init__(self, message, code="PGRST100", status=400):
        super().__init__(message)
        self.body = {"message": message, "code": code, "details": None, "hint": None}
        self.status = status


def _rows(query, params=()):
    with connection.cursor() as c:
        c.execute(query, params)
        return c.fetchall()


@lru_cache(maxsize=None)
def columns(table):
    """{column: type} for a public table or view; empty if there is none."""
    return dict(_rows(
        """SELECT a.attname, format_type(a.atttypid, a.atttypmod)
             FROM pg_attribute a
             JOIN pg_class r ON r.oid = a.attrelid
             JOIN pg_namespace n ON n.oid = r.relnamespace
            WHERE n.nspname = 'public' AND r.relname = %s AND r.relkind IN ('r', 'v', 'm', 'p')
              AND a.attnum > 0 AND NOT a.attisdropped""",
        [table],
    ))


@lru_cache(maxsize=None)
def _foreign_keys():
    """[(from_table, from_cols, to_table, to_cols)] between public tables."""
    return [
        (f, tuple(fc), t, tuple(tc))
        for f, fc, t, tc in _rows(
            """SELECT cl.relname,
                      array(SELECT a.attname FROM unnest(c.conkey) WITH ORDINALITY k(n, i)
                              JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = k.n ORDER BY k.i),
                      fcl.relname,
                      array(SELECT a.attname FROM unnest(c.confkey) WITH ORDINALITY k(n, i)
                              JOIN pg_attribute a ON a.attrelid = c.confrelid AND a.attnum = k.n ORDER BY k.i)
                 FROM pg_constraint c
                 JOIN pg_class cl ON cl.oid = c.conrelid
                 JOIN pg_namespace n ON n.oid = cl.relnamespace
                 JOIN pg_class fcl ON fcl.oid = c.confrelid
                 JOIN pg_namespace fn ON fn.oid = fcl.relnamespace
                WHERE c.contype = 'f' AND n.nspname = 'public' AND fn.nspname = 'public'"""
        )
    ]


@lru_cache(maxsize=None)
def _primary_key(table):
    return [r[0] for r in _rows(
        """SELECT a.attname FROM pg_index i
             JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
            WHERE i.indrelid = ('public.' || quote_ident(%s))::regclass AND i.indisprimary""",
        [table],
    )]


def _table_columns(table):
    cols = columns(table)
    if not cols:
        raise QueryError(f"Could not find the table 'public.{table}' in the schema cache", "PGRST205", 404)
    return cols


def _column_type(table, col):
    cols = _table_columns(table)
    if col not in cols:
        raise QueryError(f"Could not find the '{col}' column of '{table}' in the schema cache", "PGRST204")
    return cols[col]


def _split(text):
    """Split on commas that are not inside (), {} or double quotes."""
    parts, depth, quoted, cur = [], 0, False, ""
    for ch in text:
        if ch == '"':
            quoted = not quoted
        elif not quoted and ch in "({":
            depth += 1
        elif not quoted and ch in ")}":
            depth -= 1
        if ch == "," and depth == 0 and not quoted:
            parts.append(cur.strip())
            cur = ""
        else:
            cur += ch
    if cur.strip():
        parts.append(cur.strip())
    return parts


def _value(val, typ):
    """A bound parameter cast to the column's type."""
    if typ in ("json", "jsonb") or isinstance(val, dict):
        val = Json(val)
    return sql.SQL("{}::{}").format(sql.Placeholder(), sql.SQL(typ)), val


class _Builder:
    """Collects SQL fragments and their parameters in order."""

    def __init__(self):
        self.params = []
        self._n = 0

    def alias(self):
        self._n += 1
        return f"_{self._n}"

    def param(self, val, typ):
        frag, v = _value(val, typ)
        self.params.append(v)
        return frag

    # -- filters -----------------------------------------------------------

    def condition(self, table, alias, col, op, val):
        typ = _column_type(table, col)
        ref = sql.Identifier(alias, col)
        if op in ("like", "ilike"):
            self.params.append(str(val))
            return sql.SQL("{}::text {} %s").format(ref, sql.SQL(_OPS[op]))
        if op in _OPS:
            return sql.SQL("{} {} {}").format(ref, sql.SQL(_OPS[op]), self.param(val, typ))
        if op == "in":
            items = _parse_list(val) if isinstance(val, str) else list(val)
            if not items:
                return sql.SQL("false")
            return sql.SQL("{} = ANY({})").format(ref, self.param(items, typ + "[]"))
        if op == "is":
            word = {None: "NULL", True: "TRUE", False: "FALSE"}.get(val) or str(val).upper()
            if word not in ("NULL", "TRUE", "FALSE", "UNKNOWN"):
                raise QueryError(f"Invalid value for is: {val}")
            return sql.SQL("{} IS {}").format(ref, sql.SQL(word))
        if op in _ARRAY_OPS:
            return sql.SQL("{} {} {}").format(ref, sql.SQL(_ARRAY_OPS[op]), self.param(val, typ))
        raise QueryError(f"Unsupported operator: {op}")

    def where(self, table, alias, filters):
        conds = []
        for f in filters or []:
            kind = f[0]
            if kind == "or":
                conds.append(self.or_string(table, alias, f[1]))
            elif kind == "not":
                conds.append(sql.SQL("NOT ({})").format(self.condition(table, alias, f[1], f[2], f[3])))
            else:
                conds.append(self.condition(table, alias, f[0], f[1], f[2]))
        if not conds:
            return sql.SQL("")
        return sql.SQL(" WHERE ") + sql.SQL(" AND ").join(conds)

    def or_string(self, table, alias, text):
        """`a.eq.1,b.ilike.%x%,c.not.is.null` -> (a = 1 OR b ILIKE ... OR NOT c IS NULL)."""
        conds = []
        for part in _split(text):
            col, _, rest = part.partition(".")
            negate = rest.startswith("not.")
            if negate:
                rest = rest[4:]
            op, _, val = rest.partition(".")
            if not col or not op:
                raise QueryError(f"Could not parse filter: {part}")
            c = self.condition(table, alias, col, op, _literal(op, val))
            conds.append(sql.SQL("NOT ({})").format(c) if negate else c)
        return sql.SQL("({})").format(sql.SQL(" OR ").join(conds))

    # -- select lists and embedded relations -------------------------------

    def select_list(self, table, alias, spec):
        _table_columns(table)
        parts = []
        for item in _split(spec or "*"):
            if item == "*":
                parts.append(sql.SQL("{}.*").format(sql.Identifier(alias)))
            elif m := _EMBED.match(item):
                label, target, inner = m[1], m[2], m[3]
                parts.append(sql.SQL("{} AS {}").format(
                    self.embed(table, alias, target, inner), sql.Identifier(label or target)))
            elif m := _COLUMN.match(item):
                _column_type(table, m[2])
                parts.append(sql.SQL("{} AS {}").format(sql.Identifier(alias, m[2]), sql.Identifier(m[1] or m[2])))
            else:
                raise QueryError(f"Could not parse select item: {item}")
        return sql.SQL(", ").join(parts)

    def embed(self, parent, palias, target, inner):
        fks = _foreign_keys()
        if target in columns(parent):  # `vehicles:vehicle_id(...)`: follow that column's foreign key
            rel = [("one", t, tc, fc) for f, fc, t, tc in fks if f == parent and fc == (target,)]
        else:
            rel = [("one", t, tc, fc) for f, fc, t, tc in fks if f == parent and t == target]
            rel += [("many", f, fc, tc) for f, fc, t, tc in fks if t == parent and f == target]
        if len(rel) != 1:
            word = "no" if not rel else "more than one"
            raise QueryError(
                f"Could not find a relationship between '{parent}' and '{target}': {word} relationship found",
                "PGRST200" if not rel else "PGRST201")
        kind, child, child_cols, parent_cols = rel[0]
        a, e = self.alias(), self.alias()
        cols = self.select_list(child, a, inner)
        join = sql.SQL(" AND ").join(
            sql.SQL("{} = {}").format(sql.Identifier(a, cc), sql.Identifier(palias, pc))
            for cc, pc in zip(child_cols, parent_cols))
        body = sql.SQL("SELECT {} FROM public.{} AS {} WHERE {}").format(cols, sql.Identifier(child), sql.Identifier(a), join)
        if kind == "one":
            return sql.SQL("(SELECT to_json({e}) FROM ({b} LIMIT 1) AS {e})").format(e=sql.Identifier(e), b=body)
        return sql.SQL("(SELECT coalesce(json_agg({e}), '[]'::json) FROM ({b}) AS {e})").format(e=sql.Identifier(e), b=body)

    def order(self, table, alias, order):
        parts = []
        for col, ascending, nulls_first in order or []:
            _column_type(table, col)
            frag = sql.SQL("{} {}").format(sql.Identifier(alias, col), sql.SQL("ASC" if ascending else "DESC"))
            if nulls_first is not None:
                frag = sql.SQL("{} {}").format(frag, sql.SQL("NULLS FIRST" if nulls_first else "NULLS LAST"))
            parts.append(frag)
        return sql.SQL(" ORDER BY ") + sql.SQL(", ").join(parts) if parts else sql.SQL("")


def _parse_list(text):
    """`(a,b,"c d")` -> ['a', 'b', 'c d']."""
    return [p.strip().strip('"') for p in _split(text.strip().removeprefix("(").removesuffix(")"))]


def _literal(op, val):
    """A value as written in an `or()` string."""
    if op == "in":
        return _parse_list(val)
    if op == "is":
        return {"null": None, "true": True, "false": False}.get(val.lower(), val)
    return val


def _fetch_json(query, params):
    with connection.cursor() as c:
        c.execute(query, params)
        return c.fetchone()[0]


def run(q):
    """Execute one query description. Returns (data, count)."""
    table, action = q.get("table"), q.get("action", "select")
    if not isinstance(table, str) or not table:
        raise QueryError("table is required")
    b = _Builder()
    base = sql.Identifier("_0")
    filters = q.get("filters") or []

    if action == "select":
        count = None
        if q.get("count"):
            cb = _Builder()
            count_sql = sql.SQL("SELECT count(*) FROM public.{} AS _0{}").format(
                sql.Identifier(table), cb.where(table, "_0", filters))
            count = _rows(count_sql, cb.params)[0][0]
            if q.get("head"):
                return None, count
        cols = b.select_list(table, "_0", q.get("select"))
        where = b.where(table, "_0", filters)
        order = b.order(table, "_0", q.get("order"))
        limit = min(int(q["limit"]), MAX_ROWS) if q.get("limit") is not None else MAX_ROWS
        offset = int(q.get("offset") or 0)
        b.params += [limit, offset]
        query = sql.SQL(
            "SELECT coalesce(json_agg(_r), '[]'::json) FROM "
            "(SELECT {} FROM public.{} AS {}{}{} LIMIT %s OFFSET %s) AS _r"
        ).format(cols, sql.Identifier(table), base, where, order)
        return _single(q, _fetch_json(query, b.params)), count

    if action in ("insert", "upsert"):
        values = q.get("values")
        rows = values if isinstance(values, list) else [values]
        if not rows or not all(isinstance(r, dict) for r in rows):
            raise QueryError("values must be an object or a list of objects")
        names = list(dict.fromkeys(k for r in rows for k in r))
        types = {n: _column_type(table, n) for n in names}
        tuples = sql.SQL(", ").join(
            sql.SQL("({})").format(sql.SQL(", ").join(
                b.param(r[n], types[n]) if n in r else sql.SQL("DEFAULT") for n in names))
            for r in rows)
        write = sql.SQL("INSERT INTO public.{} AS {} ({}) VALUES {}").format(
            sql.Identifier(table), base, sql.SQL(", ").join(map(sql.Identifier, names)), tuples)
        if action == "upsert":
            conflict = [c.strip() for c in (q.get("onConflict") or "").split(",") if c.strip()] or _primary_key(table)
            for c in conflict:
                _column_type(table, c)
            update = [n for n in names if n not in conflict]
            if q.get("ignoreDuplicates") or not update:
                action_sql = sql.SQL("DO NOTHING")
            else:
                action_sql = sql.SQL("DO UPDATE SET ") + sql.SQL(", ").join(
                    sql.SQL("{} = EXCLUDED.{}").format(sql.Identifier(n), sql.Identifier(n)) for n in update)
            write += sql.SQL(" ON CONFLICT ({}) {}").format(sql.SQL(", ").join(map(sql.Identifier, conflict)), action_sql)
    elif action == "update":
        values = q.get("values")
        if not isinstance(values, dict) or not values:
            raise QueryError("values must be a non-empty object")
        sets = sql.SQL(", ").join(
            sql.SQL("{} = {}").format(sql.Identifier(k), b.param(v, _column_type(table, k))) for k, v in values.items())
        if not filters:
            raise QueryError("UPDATE requires a WHERE clause", "21000")
        write = sql.SQL("UPDATE public.{} AS {} SET {}{}").format(
            sql.Identifier(table), base, sets, b.where(table, "_0", filters))
    elif action == "delete":
        if not filters:
            raise QueryError("DELETE requires a WHERE clause", "21000")
        write = sql.SQL("DELETE FROM public.{} AS {}{}").format(sql.Identifier(table), base, b.where(table, "_0", filters))
    else:
        raise QueryError(f"Unknown action: {action}")

    if q.get("select") is None:
        with connection.cursor() as c:
            c.execute(write, b.params)
        return None, None
    # Embedded selects in the returned rows read `_0` from the CTE.
    params = b.params
    rb = _Builder()
    rb._n = b._n
    cols = rb.select_list(table, "_0", q["select"])
    query = sql.SQL(
        "WITH _w AS ({} RETURNING *) SELECT coalesce(json_agg(_r), '[]'::json) FROM (SELECT {} FROM _w AS _0) AS _r"
    ).format(write, cols)
    return _single(q, _fetch_json(query, params + rb.params)), None


def _single(q, rows):
    mode = q.get("single")
    if not mode:
        return rows
    if len(rows) == 1:
        return rows[0]
    if mode == "maybe" and not rows:
        return None
    raise QueryError(
        f"JSON object requested, multiple (or no) rows returned (the result contains {len(rows)} rows)",
        "PGRST116", 406)


# -- functions -----------------------------------------------------------------

def run_rpc(name, args):
    """Call public.<name>(arg => value, ...). EXECUTE grants decide who may."""
    if not re.fullmatch(r"\w+", name or ""):
        raise QueryError("Invalid function name")
    args = args or {}
    candidates = _rows(
        """SELECT p.oid, coalesce(p.proargnames, '{}'), p.proretset,
                  t.typtype, array(SELECT format_type(x, NULL) FROM unnest(p.proargtypes) x),
                  p.prorettype = 'void'::regtype
             FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace JOIN pg_type t ON t.oid = p.prorettype
            WHERE n.nspname = 'public' AND p.proname = %s AND p.prokind = 'f'""",
        [name],
    )
    for _, argnames, retset, typtype, argtypes, void in candidates:
        named = dict(zip(argnames, argtypes))
        if set(args) <= set(named):
            break
    else:
        raise QueryError(
            f"Could not find the function public.{name}({', '.join(sorted(args))}) in the schema cache",
            "PGRST202", 404)
    b = _Builder()
    call = sql.SQL("public.{}({})").format(sql.Identifier(name), sql.SQL(", ").join(
        sql.SQL("{} => {}").format(sql.Identifier(k), b.param(v, named[k])) for k, v in args.items()))
    if retset:
        query = sql.SQL("SELECT coalesce(json_agg(_r), '[]'::json) FROM {} AS _r").format(call)
    elif typtype == "c":
        query = sql.SQL("SELECT to_json(_r) FROM {} AS _r").format(call)
    else:
        query = sql.SQL("SELECT to_json({})").format(call)
    result = _fetch_json(query, b.params)
    return None if void else result
