import { createHash } from 'node:crypto'
import type { IncomingMessage } from 'node:http'
import type { Sql } from '../shared/db.ts'

export const PILOT_COOKIE = 'stellarcope_pilot'
export const PILOT_SCOPE = 'pilot:read'
export type Tenant = {
  id: string
  name: string
  category: string | null
  scf_round: number | null
  public_card: boolean
}
export const validCode = (code: unknown): code is string =>
  typeof code === 'string' && /^scp_[A-Za-z0-9_-]{43}$/.test(code)
export const codeHash = (code: string) => createHash('sha256').update(code).digest('hex')

export function pilotOrigin(origin: string) {
  const url = new URL(origin)
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
  if (url.origin !== origin || (url.protocol !== 'https:' && !(url.protocol === 'http:' && local)))
    throw new Error('Invalid PILOT_ORIGIN')
  return url
}

function credential(req: IncomingMessage) {
  const authorization = req.headers.authorization
  if (authorization !== undefined)
    return authorization.startsWith('Bearer ') ? authorization.slice(7) : null
  const cookies = (req.headers.cookie ?? '')
    .split(';')
    .map((v) => v.trim())
    .filter((v) => v.startsWith(`${PILOT_COOKIE}=`))
  return cookies.length === 1 ? cookies[0].slice(PILOT_COOKIE.length + 1) : null
}

export async function codeTenant(sql: Sql, code: unknown): Promise<Tenant | null> {
  if (!validCode(code)) return null
  const { rows } = await sql.query<Tenant>(
    `select t.id,t.name,t.category,t.scf_round,t.public_card from api_keys k
       join tenants t on t.id=k.tenant_id
      where k.hash=$1 and k.revoked_at is null and $2=any(k.scopes)
        and k.created_at > now()-interval '30 days' and t.status='active'`,
    [codeHash(code), PILOT_SCOPE],
  )
  return rows[0] ?? null
}

export const sessionTenant = (sql: Sql, req: IncomingMessage) => codeTenant(sql, credential(req))

export async function authorizeTenant(
  sql: Sql,
  req: IncomingMessage,
  id: string,
): Promise<Tenant | null> {
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(id)) return null
  const { rows } = await sql.query<Tenant>(
    "select id,name,category,scf_round,public_card from tenants where id=$1 and status='active'",
    [id],
  )
  const tenant = rows[0]
  if (!tenant) return null
  if (tenant.public_card) return tenant
  return (await sessionTenant(sql, req))?.id === id ? tenant : null
}
