import { readFile } from 'node:fs/promises'

// The one interface every service talks to. node-postgres pools and PGlite (used in tests)
// both satisfy it, so the same queries run against either.
export type Sql = { query<R = Record<string, unknown>>(text: string, params?: unknown[]): Promise<{ rows: R[] }> }

export async function migrate(sql: Sql) {
  const ddl = await readFile(new URL('../../db/schema.sql', import.meta.url), 'utf8')
  for (const stmt of ddl.split(/;\s*$/m).map((s) => s.trim()).filter(Boolean)) await sql.query(stmt)
}

export async function connect(url = process.env.DATABASE_URL): Promise<Sql> {
  if (!url) throw new Error('DATABASE_URL is not set')
  const { default: pg } = await import('pg')
  pg.types.setTypeParser(1082, (v: string) => v) // keep date columns as YYYY-MM-DD, no timezone shift
  return new pg.Pool({ connectionString: url, max: 10, connectionTimeoutMillis: 5000, query_timeout: 5000 })
}

/** runs fn inside one transaction on one connection (a pool would spread statements across clients) */
export async function transaction<T>(sql: Sql, fn: (q: Sql) => Promise<T>): Promise<T> {
  const pool = sql as unknown as { connect?: () => Promise<Sql & { release(discard?: boolean): void }>; totalCount?: number }
  const client = typeof pool.totalCount === 'number' && pool.connect ? await pool.connect() : null
  const q = client ?? sql
  let started = false
  let discard = false
  try {
    await q.query('begin')
    started = true
    const result = await fn(q)
    await q.query('commit')
    return result
  } catch (err) {
    if (started) {
      try { await q.query('rollback') } catch { discard = true }
    } else discard = true
    throw err
  } finally {
    client?.release(discard)
  }
}
