import { randomUUID } from "node:crypto";

type Row = Record<string, unknown>;
type Result = { data: unknown; error: { code?: string; message: string } | null; count?: number | null };

/** Mini base en mémoire qui imite la partie de l'API supabase-js utilisée par le code serveur. */
export class FakeDb {
  tables: Record<string, Row[]> = {
    runs: [],
    applications: [],
    reports: [],
    documents: [],
    user_settings: [],
  };

  from(table: string) {
    return new Query(this, table);
  }

  seedSettings(userId: string, patch: Row = {}) {
    this.tables.user_settings.push({
      user_id: userId,
      cv_md: "# Jane Dupont\n\n## Experience\n### Acme — Paris\n**Product Marketing Manager**\n2019 – 2024\n- Lancé 3 produits, +35% de revenus\n",
      profile: { full_name: "Jane Dupont", target_roles: ["Product Marketing Manager"] },
      profile_md: "",
      output_language: "fr",
      spend_tier: "standard",
      ...patch,
    });
  }
}

class Query {
  private mode: "select" | "insert" | "update" | "delete" = "select";
  private filters: Array<(r: Row) => boolean> = [];
  private payload: Row = {};
  private orderBy: { col: string; asc: boolean } | null = null;
  private max: number | null = null;
  private head = false;
  private wantCount = false;

  private db: FakeDb;
  private table: string;

  constructor(db: FakeDb, table: string) {
    this.db = db;
    this.table = table;
  }

  select(_cols?: string, opts?: { count?: string; head?: boolean }) {
    this.head = !!opts?.head;
    this.wantCount = !!opts?.count;
    return this;
  }
  insert(row: Row) {
    this.mode = "insert";
    this.payload = row;
    return this;
  }
  update(patch: Row) {
    this.mode = "update";
    this.payload = patch;
    return this;
  }
  delete() {
    this.mode = "delete";
    return this;
  }
  eq(k: string, v: unknown) {
    this.filters.push((r) => r[k] === v);
    return this;
  }
  neq(k: string, v: unknown) {
    this.filters.push((r) => r[k] !== v);
    return this;
  }
  gte(k: string, v: unknown) {
    this.filters.push((r) => String(r[k]) >= String(v));
    return this;
  }
  or(expr: string) {
    // « status.neq.failed,provider.not.is.null » : failed sans provider n'est pas compté.
    if (expr.includes("provider.not.is.null")) {
      this.filters.push((r) => r.status !== "failed" || r.provider != null);
    }
    return this;
  }
  order(col: string, opts?: { ascending?: boolean }) {
    this.orderBy = { col, asc: opts?.ascending !== false };
    return this;
  }
  limit(n: number) {
    this.max = n;
    return this;
  }
  returns() {
    return this;
  }
  maybeSingle() {
    return this.run(true);
  }
  single() {
    return this.run(true, true);
  }
  then<T>(resolve: (r: Result) => T) {
    return this.run(false).then(resolve);
  }

  private async run(single: boolean, strict = false): Promise<Result> {
    const rows = this.db.tables[this.table] ?? (this.db.tables[this.table] = []);

    if (this.mode === "insert") {
      const row = this.defaults({ ...this.payload });
      const clash = this.uniqueClash(rows, row);
      if (clash) return { data: null, error: { code: "23505", message: clash } };
      rows.push(row);
      return { data: single ? row : [row], error: null };
    }

    let matched = rows.filter((r) => this.filters.every((f) => f(r)));
    if (this.mode === "update") {
      for (const r of matched) Object.assign(r, this.payload);
      return { data: null, error: null };
    }
    if (this.mode === "delete") {
      this.db.tables[this.table] = rows.filter((r) => !matched.includes(r));
      return { data: null, error: null };
    }

    if (this.orderBy) {
      const { col, asc } = this.orderBy;
      matched = [...matched].sort((a, b) => (a[col]! > b[col]! ? 1 : a[col]! < b[col]! ? -1 : 0) * (asc ? 1 : -1));
    }
    const count = matched.length;
    if (this.max != null) matched = matched.slice(0, this.max);
    if (this.head) return { data: null, error: null, count };
    if (single) {
      if (strict && matched.length === 0) return { data: null, error: { message: "no rows" } };
      return { data: matched[0] ?? null, error: null };
    }
    return { data: matched, error: null, count: this.wantCount ? count : undefined };
  }

  private defaults(row: Row): Row {
    const now = new Date().toISOString();
    const base: Row = { id: randomUUID(), created_at: now };
    if (this.table === "runs") {
      Object.assign(base, {
        status: "running",
        input_tokens: 0,
        output_tokens: 0,
        cache_read_tokens: 0,
        cache_write_tokens: 0,
        provider: null,
        model: null,
        error: null,
        output: null,
      });
    }
    if (this.table === "applications") Object.assign(base, { status: "Evaluated", notes: "", updated_at: now });
    return { ...base, ...row };
  }

  private uniqueClash(rows: Row[], row: Row): string | null {
    if (this.table !== "applications") return null;
    if (rows.some((r) => r.user_id === row.user_id && r.num === row.num)) return "unique (user_id, num)";
    if (row.url_key && rows.some((r) => r.user_id === row.user_id && r.url_key === row.url_key)) return "unique (user_id, url_key)";
    return null;
  }
}
