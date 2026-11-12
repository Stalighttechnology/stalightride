/**
 * The only module that talks to the Django backend.
 *
 * Keeps the chain syntax the pages were written with:
 *   api.from("bookings").select("*, vehicles(title)").eq("id", id).maybeSingle()
 * Results are { data, error, count }; errors are returned, not thrown.
 * Row-level security in the database decides what each user may see and do.
 */

// shortcut: rows are untyped (any); type them per table if bugs show up.
/* eslint-disable @typescript-eslint/no-explicit-any */

const BASE = String(import.meta.env.VITE_API_URL ?? "").replace(/\/$/, "");
const SESSION_KEY = "synchoo-session";
const NONCE_KEY = "synchoo-google-nonce";

export type ApiError = {
  message: string;
  code?: string | null;
  details?: string | null;
  hint?: string | null;
  status?: number;
};
export type Result<T = any> = {
  data: T;
  error: ApiError | null;
  count?: number | null;
  status?: number;
};
export type User = {
  id: string;
  email: string;
  phone?: string;
  created_at: string;
  user_metadata: Record<string, any>;
  app_metadata: Record<string, any>;
};
export type Session = {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_in: number;
  expires_at: number;
  user: User;
};
export type AuthEvent =
  | "INITIAL_SESSION"
  | "SIGNED_IN"
  | "SIGNED_OUT"
  | "TOKEN_REFRESHED"
  | "USER_UPDATED"
  | "PASSWORD_RECOVERY";
type Listener = (event: AuthEvent, session: Session | null) => void;

const hasWindow = typeof window !== "undefined";

// -- session -------------------------------------------------------------------

function readStored(): Session | null {
  try {
    const raw = hasWindow ? localStorage.getItem(SESSION_KEY) : null;
    return raw ? (JSON.parse(raw) as Session) : null;
  } catch {
    return null;
  }
}

let session: Session | null = readStored();
const listeners = new Set<Listener>();

function setSession(next: Session | null, event: AuthEvent) {
  session = next;
  try {
    if (next) localStorage.setItem(SESSION_KEY, JSON.stringify(next));
    else localStorage.removeItem(SESSION_KEY);
  } catch {
    // private mode or no window: the session lives in memory only
  }
  listeners.forEach((cb) => cb(event, next));
  realtime.reconnect();
}

let refreshing: Promise<boolean> | null = null;

function refreshSession(): Promise<boolean> {
  if (!session) return Promise.resolve(false);
  refreshing ??= (async () => {
    try {
      const res = await fetch(`${BASE}/api/auth/refresh/`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ refresh_token: session?.refresh_token }),
      });
      if (res.ok) {
        setSession((await res.json()) as Session, "TOKEN_REFRESHED");
        return true;
      }
      if (res.status === 401) setSession(null, "SIGNED_OUT");
      return false;
    } catch {
      return false;
    } finally {
      refreshing = null;
    }
  })();
  return refreshing;
}

async function validSession(): Promise<Session | null> {
  if (session && session.expires_at - 60 < Date.now() / 1000) await refreshSession();
  return session;
}

type Raw = { ok: boolean; status: number; body: any };

async function request(
  path: string,
  body?: unknown,
  form?: FormData,
  retried = false,
): Promise<Raw> {
  const s = await validSession();
  const headers: Record<string, string> = {};
  if (!form) headers["content-type"] = "application/json";
  if (s) headers.Authorization = `Bearer ${s.access_token}`;
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, {
      method: "POST",
      headers,
      body: form ?? (body === undefined ? undefined : JSON.stringify(body)),
    });
  } catch (e: any) {
    return { ok: false, status: 0, body: { message: e?.message || "Failed to fetch" } };
  }
  if (res.status === 401 && s && !retried && (await refreshSession()))
    return request(path, body, form, true);
  const text = await res.text();
  let parsed: any = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = { message: text };
  }
  return { ok: res.ok, status: res.status, body: parsed };
}

function toError(raw: Raw): ApiError {
  const b = raw.body ?? {};
  return {
    message: b.message || `Request failed (${raw.status})`,
    code: b.code ?? null,
    details: b.details ?? null,
    hint: b.hint ?? null,
    status: raw.status,
  };
}

// -- table queries -----------------------------------------------------------------

type Filter = [string, string, unknown] | ["or", string] | ["not", string, string, unknown];

export class Query<R = any[]> implements PromiseLike<Result<R>> {
  private q: Record<string, any>;

  constructor(table: string) {
    this.q = { table, action: "select", select: "*", filters: [] as Filter[], order: [] };
  }

  select(
    columns = "*",
    opts?: { count?: "exact" | "planned" | "estimated"; head?: boolean },
  ): Query<R> {
    this.q.select = columns;
    if (opts?.count) this.q.count = opts.count;
    if (opts?.head) this.q.head = true;
    return this;
  }

  private write(action: string, values?: unknown, extra?: Record<string, unknown>): Query<R> {
    Object.assign(this.q, { action, values, select: null, ...extra });
    return this;
  }
  insert(values: any, _opts?: unknown): Query<R> {
    return this.write("insert", values);
  }
  upsert(values: any, opts?: { onConflict?: string; ignoreDuplicates?: boolean }): Query<R> {
    return this.write("upsert", values, {
      onConflict: opts?.onConflict,
      ignoreDuplicates: opts?.ignoreDuplicates,
    });
  }
  update(values: any, _opts?: unknown): Query<R> {
    return this.write("update", values);
  }
  delete(_opts?: unknown): Query<R> {
    return this.write("delete");
  }

  private add(f: Filter): Query<R> {
    this.q.filters.push(f);
    return this;
  }
  eq(col: string, value: unknown) {
    return this.add([col, "eq", value]);
  }
  neq(col: string, value: unknown) {
    return this.add([col, "neq", value]);
  }
  gt(col: string, value: unknown) {
    return this.add([col, "gt", value]);
  }
  gte(col: string, value: unknown) {
    return this.add([col, "gte", value]);
  }
  lt(col: string, value: unknown) {
    return this.add([col, "lt", value]);
  }
  lte(col: string, value: unknown) {
    return this.add([col, "lte", value]);
  }
  like(col: string, pattern: string) {
    return this.add([col, "like", pattern]);
  }
  ilike(col: string, pattern: string) {
    return this.add([col, "ilike", pattern]);
  }
  is(col: string, value: null | boolean) {
    return this.add([col, "is", value]);
  }
  in(col: string, values: readonly unknown[]) {
    return this.add([col, "in", [...values]]);
  }
  contains(col: string, value: unknown) {
    return this.add([col, "cs", value]);
  }
  containedBy(col: string, value: unknown) {
    return this.add([col, "cd", value]);
  }
  overlaps(col: string, value: unknown) {
    return this.add([col, "ov", value]);
  }
  filter(col: string, op: string, value: unknown) {
    return this.add([col, op, value]);
  }
  not(col: string, op: string, value: unknown) {
    return this.add(["not", col, op, value]);
  }
  or(filters: string) {
    return this.add(["or", filters]);
  }
  match(values: Record<string, unknown>) {
    Object.entries(values).forEach(([k, v]) => this.add([k, "eq", v]));
    return this;
  }

  order(col: string, opts?: { ascending?: boolean; nullsFirst?: boolean }): Query<R> {
    this.q.order.push([col, opts?.ascending ?? true, opts?.nullsFirst ?? null]);
    return this;
  }
  limit(n: number): Query<R> {
    this.q.limit = n;
    return this;
  }
  range(from: number, to: number): Query<R> {
    this.q.offset = from;
    this.q.limit = to - from + 1;
    return this;
  }
  single(): Query<any> {
    this.q.single = "one";
    return this as unknown as Query<any>;
  }
  maybeSingle(): Query<any> {
    this.q.single = "maybe";
    return this as unknown as Query<any>;
  }

  async execute(): Promise<Result<R>> {
    const raw = await request("/api/query/", this.q);
    if (!raw.ok) return { data: null as R, error: toError(raw), count: null, status: raw.status };
    return {
      data: raw.body.data as R,
      error: null,
      count: raw.body.count ?? null,
      status: raw.status,
    };
  }

  then<A = Result<R>, B = never>(
    onFulfilled?: ((value: Result<R>) => A | PromiseLike<A>) | null,
    onRejected?: ((reason: any) => B | PromiseLike<B>) | null,
  ): Promise<A | B> {
    return this.execute().then(onFulfilled, onRejected);
  }
}

// -- storage -----------------------------------------------------------------------

function absolute(path: string) {
  return BASE ? `${BASE}${path}` : hasWindow ? `${window.location.origin}${path}` : path;
}

function bucketApi(bucket: string) {
  const b = encodeURIComponent(bucket);
  return {
    async upload(
      path: string,
      file: Blob,
      opts?: { upsert?: boolean; contentType?: string; cacheControl?: string },
    ) {
      const form = new FormData();
      form.append("path", path);
      form.append("file", file);
      form.append("upsert", String(!!opts?.upsert));
      const raw = await request(`/api/storage/${b}/upload/`, undefined, form);
      return raw.ok
        ? { data: raw.body as { path: string; fullPath: string }, error: null }
        : { data: null, error: toError(raw) };
    },
    async remove(paths: string[]) {
      const raw = await request(`/api/storage/${b}/remove/`, { paths });
      return raw.ok
        ? { data: raw.body as any[], error: null }
        : { data: null, error: toError(raw) };
    },
    async createSignedUrls(paths: string[], expiresIn: number) {
      const raw = await request(`/api/storage/${b}/sign/`, { paths, expiresIn });
      if (!raw.ok) return { data: null, error: toError(raw) };
      return {
        data: raw.body as { path: string; signedUrl: string | null; error: string | null }[],
        error: null,
      };
    },
    async createSignedUrl(path: string, expiresIn: number) {
      const { data, error } = await this.createSignedUrls([path], expiresIn);
      if (error) return { data: null, error };
      const item = data?.[0];
      if (!item?.signedUrl)
        return {
          data: null,
          error: { message: item?.error || "Object not found", status: 404 } as ApiError,
        };
      return { data: { signedUrl: item.signedUrl }, error: null };
    },
    getPublicUrl(path: string) {
      const p = path.split("/").map(encodeURIComponent).join("/");
      return { data: { publicUrl: absolute(`/api/storage/public/${b}/${p}`) } };
    },
  };
}

// -- live updates ------------------------------------------------------------------

type ChangeSpec = {
  event: "*" | "INSERT" | "UPDATE" | "DELETE";
  schema?: string;
  table: string;
  filter?: string;
};
type ChangeHandler = (payload: {
  eventType: string;
  new: any;
  old: any;
  table: string;
  schema: string;
}) => void;

const realtime = (() => {
  const subs = new Map<string, { spec: ChangeSpec; cb: ChangeHandler }>();
  let socket: WebSocket | null = null;
  let retry: ReturnType<typeof setTimeout> | null = null;
  let attempts = 0;
  let nextId = 0;

  const send = (msg: unknown) => {
    if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(msg));
  };
  const subscribeMsg = (id: string, spec: ChangeSpec) => ({
    type: "subscribe",
    id,
    table: spec.table,
    event: spec.event,
    filter: spec.filter,
  });

  function url() {
    const base = BASE
      ? BASE.replace(/^http/, "ws")
      : `${window.location.protocol === "https:" ? "wss" : "ws"}://${window.location.host}`;
    return `${base}/ws/${session ? `?token=${encodeURIComponent(session.access_token)}` : ""}`;
  }

  function connect() {
    if (!hasWindow || typeof WebSocket === "undefined" || socket || subs.size === 0) return;
    const ws = new WebSocket(url());
    socket = ws;
    ws.onopen = () => {
      attempts = 0;
      subs.forEach((s, id) => send(subscribeMsg(id, s.spec)));
    };
    ws.onmessage = (e) => {
      const msg = JSON.parse(String(e.data));
      if (msg.type === "change") subs.get(msg.id)?.cb(msg.payload);
    };
    ws.onclose = async (e) => {
      if (socket !== ws) return;
      socket = null;
      if (e.code === 4001) await refreshSession();
      if (subs.size === 0) return;
      const wait = Math.min(30_000, 1000 * 2 ** attempts++);
      retry = setTimeout(() => {
        retry = null;
        connect();
      }, wait);
    };
  }

  return {
    add(spec: ChangeSpec, cb: ChangeHandler) {
      const id = String(++nextId);
      subs.set(id, { spec, cb });
      if (socket) send(subscribeMsg(id, spec));
      else connect();
      return id;
    },
    remove(id: string) {
      subs.delete(id);
      send({ type: "unsubscribe", id });
      if (subs.size === 0 && socket) {
        const ws = socket;
        socket = null;
        ws.close();
      }
    },
    /** New token or signed out: reopen so the server reads rows as the right user. */
    reconnect() {
      if (retry) clearTimeout(retry);
      retry = null;
      const ws = socket;
      socket = null;
      ws?.close();
      connect();
    },
  };
})();

export class Channel {
  private pending: { spec: ChangeSpec; cb: ChangeHandler }[] = [];
  private ids: string[] = [];
  constructor(readonly name: string) {}

  on(_type: "postgres_changes", spec: ChangeSpec, cb: ChangeHandler): Channel {
    this.pending.push({ spec, cb });
    return this;
  }
  subscribe(status?: (s: "SUBSCRIBED") => void): Channel {
    this.ids.push(...this.pending.map((p) => realtime.add(p.spec, p.cb)));
    this.pending = [];
    status?.("SUBSCRIBED");
    return this;
  }
  unsubscribe() {
    this.ids.forEach((id) => realtime.remove(id));
    this.ids = [];
  }
}

// -- auth --------------------------------------------------------------------------

async function authCall(path: string, body: unknown, event: AuthEvent = "SIGNED_IN") {
  const raw = await request(path, body);
  if (!raw.ok) return { data: { user: null, session: null }, error: toError(raw) };
  const s: Session = raw.body.session ?? raw.body;
  setSession(s, event);
  return { data: { user: s.user, session: s }, error: null };
}

function decodeClaims(token: string): Record<string, any> | null {
  try {
    const part = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    return JSON.parse(atob(part));
  } catch {
    return null;
  }
}

const auth = {
  async getSession() {
    return { data: { session: await validSession() }, error: null };
  },
  async getUser(): Promise<{ data: { user: User | null }; error: ApiError | null }> {
    if (!(await validSession()))
      return { data: { user: null }, error: { message: "Auth session missing!" } };
    const res = await fetch(`${BASE}/api/auth/user/`, {
      headers: { Authorization: `Bearer ${session!.access_token}` },
    }).catch(() => null);
    if (!res) return { data: { user: session?.user ?? null }, error: null }; // offline: trust the stored session
    if (res.status === 401 || res.status === 403) {
      setSession(null, "SIGNED_OUT");
      return {
        data: { user: null },
        error: { message: "Auth session missing!", status: res.status },
      };
    }
    const user = (await res.json()) as User;
    return { data: { user }, error: null };
  },
  async getClaims() {
    const s = await validSession();
    const claims = s ? decodeClaims(s.access_token) : null;
    return {
      data: claims ? { claims } : null,
      error: claims ? null : { message: "Auth session missing!" },
    };
  },
  onAuthStateChange(cb: Listener) {
    listeners.add(cb);
    queueMicrotask(() => cb("INITIAL_SESSION", session));
    return { data: { subscription: { unsubscribe: () => void listeners.delete(cb) } } };
  },
  signInWithPassword(creds: { email: string; password: string }) {
    return authCall("/api/auth/signin/", creds);
  },
  signUp(creds: {
    email: string;
    password: string;
    options?: { data?: Record<string, unknown>; emailRedirectTo?: string };
  }) {
    return authCall("/api/auth/signup/", {
      email: creds.email,
      password: creds.password,
      data: creds.options?.data ?? {},
    });
  },
  async signOut() {
    const refresh = session?.refresh_token;
    setSession(null, "SIGNED_OUT");
    if (refresh) await request("/api/auth/signout/", { refresh_token: refresh });
    return { error: null };
  },
  async signInWithOAuth(opts: { provider: "google"; options?: { redirectTo?: string } }) {
    const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined;
    if (opts.provider !== "google" || !clientId) {
      return { data: null, error: { message: "Google sign-in is not configured" } as ApiError };
    }
    const nonce = crypto.randomUUID();
    sessionStorage.setItem(NONCE_KEY, nonce);
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: opts.options?.redirectTo ?? `${window.location.origin}/auth`,
      response_type: "id_token",
      scope: "openid email profile",
      nonce,
      prompt: "select_account",
    });
    window.location.assign(`https://accounts.google.com/o/oauth2/v2/auth?${params}`);
    return { data: { provider: "google" }, error: null };
  },
  async resetPasswordForEmail(email: string, _opts?: { redirectTo?: string }) {
    const raw = await request("/api/auth/password-reset/", { email });
    return { data: {}, error: raw.ok ? null : toError(raw) };
  },
  /** Finish a reset from the emailed link; signs the user in. */
  confirmPasswordReset(uid: string, token: string, password: string) {
    return authCall(
      "/api/auth/password-reset/confirm/",
      { uid, token, password },
      "PASSWORD_RECOVERY",
    );
  },
};

/** Back from Google with #id_token=...: exchange it for a session. */
async function finishGoogleSignIn() {
  if (!hasWindow || !window.location.hash.includes("id_token=")) return;
  const hash = new URLSearchParams(window.location.hash.slice(1));
  const nonce = sessionStorage.getItem(NONCE_KEY);
  sessionStorage.removeItem(NONCE_KEY);
  const result = await authCall("/api/auth/google/", { id_token: hash.get("id_token"), nonce });
  window.history.replaceState(null, "", window.location.pathname + window.location.search);
  if (result.error) console.error("Google sign-in failed:", result.error.message);
}
void finishGoogleSignIn();

// -- the client ----------------------------------------------------------------

export const api = {
  from: (table: string) => new Query(table),
  async rpc(name: string, args?: Record<string, unknown>): Promise<Result<any>> {
    const raw = await request(`/api/rpc/${encodeURIComponent(name)}/`, args ?? {});
    return raw.ok
      ? { data: raw.body.data, error: null, status: raw.status }
      : { data: null, error: toError(raw), status: raw.status };
  },
  /** Server actions (payments, handover). Throws on failure, like the old server functions. */
  async fn<T = any>(name: string, data?: unknown): Promise<T> {
    const raw = await request(`/api/fn/${encodeURIComponent(name)}/`, data ?? {});
    if (!raw.ok) throw new Error(toError(raw).message);
    return raw.body.data as T;
  },
  auth,
  storage: { from: bucketApi },
  channel: (name: string) => new Channel(name),
  removeChannel: (ch: Channel) => {
    ch.unsubscribe();
    return Promise.resolve("ok" as const);
  },
};
