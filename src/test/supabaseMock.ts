/**
 * Mock encadenable del cliente de Supabase para los tests (Vitest).
 *
 * Emula la API fluida de supabase-js (`from().select().eq().order()...`) sin
 * tocar la base de datos real. Cada tabla se respalda con un array en memoria,
 * de modo que insert/update/delete/select operan sobre ese estado y se pueden
 * verificar en el test. Así los tests de CRUD tienen setup/teardown reales sin
 * dejar basura en Supabase.
 */
import { vi } from 'vitest';

export type Row = Record<string, unknown>;

interface QueryState {
  table: string;
  op: 'select' | 'insert' | 'update' | 'delete';
  payload?: Row | Row[];
  filters: { col: string; val: unknown }[];
  headCount: boolean;
  single: boolean;
  orderCol?: string;
  orderAsc?: boolean;
  limitN?: number;
}

/** Base de datos en memoria: nombre de tabla → filas. */
export type MemoryDB = Record<string, Row[]>;

let idCounter = 1;
function genId(): string {
  return `test-id-${idCounter++}`;
}

/**
 * Construye un cliente Supabase simulado sobre una base de datos en memoria.
 * @param db Estado inicial por tabla (se muta con las operaciones).
 */
export function makeSupabaseMock(db: MemoryDB) {
  const applyFilters = (rows: Row[], filters: QueryState['filters']) =>
    rows.filter(r => filters.every(f => r[f.col] === f.val));

  function makeQuery(table: string): {
    state: QueryState;
    then: (resolve: (v: { data: Row[] | Row | null; error: null; count: number | null }) => unknown) => Promise<unknown>;
    [k: string]: unknown;
  } {
    const state: QueryState = { table, op: 'select', filters: [], headCount: false, single: false };
    if (!db[table]) db[table] = [];

    const run = () => {
      const rows = db[table];
      if (state.op === 'insert') {
        const items = Array.isArray(state.payload) ? state.payload : [state.payload as Row];
        const inserted = items.map(it => ({ id: genId(), ...it }));
        db[table] = [...rows, ...inserted];
        const data = state.single ? inserted[0] : inserted;
        return { data: data ?? null, error: null, count: null };
      }
      if (state.op === 'update') {
        const matched = applyFilters(rows, state.filters);
        for (const m of matched) Object.assign(m, state.payload);
        return { data: matched, error: null, count: null };
      }
      if (state.op === 'delete') {
        const keep = rows.filter(r => !state.filters.every(f => r[f.col] === f.val));
        db[table] = keep;
        return { data: null, error: null, count: null };
      }
      // select
      let out = applyFilters(rows, state.filters);
      if (state.orderCol) {
        const col = state.orderCol;
        out = [...out].sort((a, b) => {
          const av = a[col] as string | number, bv = b[col] as string | number;
          if (av < bv) return state.orderAsc ? -1 : 1;
          if (av > bv) return state.orderAsc ? 1 : -1;
          return 0;
        });
      }
      if (state.limitN != null) out = out.slice(0, state.limitN);
      if (state.headCount) return { data: null, error: null, count: out.length };
      if (state.single) return { data: out[0] ?? null, error: null, count: null };
      return { data: out, error: null, count: out.length };
    };

    const builder: Record<string, unknown> = {
      state,
      select: (_cols?: string, opts?: { count?: string; head?: boolean }) => {
        state.op = state.op === 'select' ? 'select' : state.op; // insert().select() mantiene op
        if (opts?.head) state.headCount = true;
        return builder;
      },
      insert: (payload: Row | Row[]) => { state.op = 'insert'; state.payload = payload; return builder; },
      update: (payload: Row) => { state.op = 'update'; state.payload = payload; return builder; },
      delete: () => { state.op = 'delete'; return builder; },
      eq: (col: string, val: unknown) => { state.filters.push({ col, val }); return builder; },
      gte: () => builder,
      lte: () => builder,
      not: () => builder,
      order: (col: string, opts?: { ascending?: boolean }) => {
        state.orderCol = col; state.orderAsc = opts?.ascending ?? true; return builder;
      },
      limit: (n: number) => { state.limitN = n; return builder; },
      single: () => { state.single = true; return Promise.resolve(run()); },
      maybeSingle: () => { state.single = true; return Promise.resolve(run()); },
      // Hacer el builder "thenable" para que `await query` funcione.
      then: (resolve: (v: unknown) => unknown) => Promise.resolve(run()).then(resolve),
    };
    return builder as never;
  }

  return {
    from: vi.fn((table: string) => makeQuery(table)),
    auth: {
      getSession: vi.fn(async () => ({ data: { session: null } })),
      signInWithPassword: vi.fn(async () => ({ error: null })),
      signOut: vi.fn(async () => ({ error: null })),
      onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
    },
    rpc: vi.fn(async () => ({ data: null, error: null })),
  };
}
