import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Sql } from '../shared/db.ts'
import { json, days, isDay, query } from './http.ts'
import { authorizeTenant, codeTenant, PILOT_COOKIE, pilotOrigin, sessionTenant } from './access.ts'
import { apiStats, live, sitesOf, trust, walletStats, webStats } from './stats.ts'
import { proof } from './seal.ts'

function privateResponse(res: ServerResponse) {
  res.setHeader('cache-control', 'no-store')
  res.setHeader('vary', 'Cookie, Authorization')
  res.setHeader('referrer-policy', 'no-referrer')
}

async function loginBody(req: IncomingMessage): Promise<unknown> {
  const pre = (req as IncomingMessage & { body?: unknown }).body
  let body: string
  if (pre !== undefined)
    body =
      typeof pre === 'string'
        ? pre
        : Buffer.isBuffer(pre)
          ? pre.toString('utf8')
          : JSON.stringify(pre)
  else {
    const chunks: Buffer[] = []
    let length = 0
    for await (const chunk of req) {
      length += Buffer.byteLength(chunk)
      if (length > 4096) throw Object.assign(new Error(), { status: 413 })
      chunks.push(Buffer.from(chunk))
    }
    body = Buffer.concat(chunks).toString('utf8')
  }
  if (Buffer.byteLength(body) > 4096) throw Object.assign(new Error(), { status: 413 })
  return JSON.parse(body)
}

export function pilotSession(sql: Sql, origin: string) {
  const configured = pilotOrigin(origin)
  const cookie = (value: string, seconds: number) =>
    `${PILOT_COOKIE}=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${seconds}${configured.protocol === 'https:' ? '; Secure' : ''}`
  return async (req: IncomingMessage, res: ServerResponse) => {
    privateResponse(res)
    if (req.method === 'GET') {
      const tenant = await sessionTenant(sql, req)
      return json(
        res,
        tenant ? 200 : 401,
        tenant
          ? { tenant: { id: tenant.id, name: tenant.name } }
          : { error: 'Sign in with your project access code' },
      )
    }
    if (req.method !== 'POST' && req.method !== 'DELETE') {
      res.setHeader('allow', 'GET, POST, DELETE')
      return json(res, 405, { error: 'method not allowed' })
    }
    if (req.headers.origin !== origin) return json(res, 403, { error: 'origin not allowed' })
    if (req.method === 'DELETE') {
      res.setHeader('set-cookie', cookie('', 0))
      res.writeHead(204).end()
      return
    }
    if (
      req.headers['content-type']?.split(';')[0].trim().toLowerCase() !== 'application/json' ||
      req.headers['content-encoding']
    )
      return json(res, 415, { error: 'JSON required' })
    let body: unknown
    try {
      body = await loginBody(req)
    } catch (error) {
      return json(res, (error as { status?: number }).status === 413 ? 413 : 400, {
        error: 'invalid request',
      })
    }
    if (
      !body ||
      typeof body !== 'object' ||
      Array.isArray(body) ||
      Object.keys(body).length !== 1 ||
      !Object.hasOwn(body, 'code')
    )
      return json(res, 400, { error: 'invalid request' })
    const code = (body as { code: unknown }).code
    const tenant = await codeTenant(sql, code)
    if (!tenant) return json(res, 401, { error: 'Invalid or expired project access code' })
    res.setHeader('set-cookie', cookie(code as string, 7 * 86400))
    json(res, 200, { tenant: { id: tenant.id, name: tenant.name } })
  }
}

export async function tenantReport(
  sql: Sql,
  req: IncomingMessage,
  res: ServerResponse,
  resource: 'stats' | 'live' | 'seals' | 'proof',
) {
  privateResponse(res)
  if (req.method !== 'GET') {
    res.setHeader('allow', 'GET')
    return json(res, 405, { error: 'method not allowed' })
  }
  const q = query(req)
  const id = q.get('tenant') ?? 'stellarcope'
  const tenant = await authorizeTenant(sql, req, id)
  if (!tenant) return json(res, 404, { error: 'unknown tenant' })
  if (resource === 'stats') {
    const n = days(q)
    const sites = await sitesOf(sql, id)
    const [web, api, wallets, t, latest] = await Promise.all([
      webStats(sql, sites, n),
      apiStats(sql, id, n),
      walletStats(sql, sites, n),
      trust(sql, id, sites, n),
      sql.query<{ ts: Date | string | null }>(
        "select max(ts) as ts from events where site_id=any($1) and type='pageview'",
        [sites],
      ),
    ])
    return json(res, 200, {
      tenant,
      sites,
      days: n,
      web,
      api,
      wallets,
      trust: t,
      collection: {
        lastEventAt: latest.rows[0]?.ts ? new Date(latest.rows[0].ts).toISOString() : null,
      },
    })
  }
  if (resource === 'live') return json(res, 200, await live(sql, await sitesOf(sql, id)))
  if (resource === 'seals') {
    const { rows } = await sql.query(
      `select to_char(s.day,'YYYY-MM-DD') as day,s.root,s.tx_hash,s.leaves,l.leaf
         from seals s join seal_leaves l on l.day=s.day and l.tenant_id=$1
        order by s.day desc limit 14`,
      [id],
    )
    return json(res, 200, { seals: rows, account: process.env.ANCHOR_PUBLIC ?? null })
  }
  const day = q.get('day')
  const target = isDay(day)
    ? day
    : (
        await sql.query<{ day: string }>(
          "select to_char(max(day),'YYYY-MM-DD') as day from seal_leaves where tenant_id=$1",
          [id],
        )
      ).rows[0]?.day
  const p = target ? await proof(sql, id, target) : null
  return json(res, p ? 200 : 404, p ?? { error: 'not sealed yet' })
}
