import type { Sql } from '../shared/db.ts'
import { transaction } from '../shared/db.ts'
import { randomBytes, randomUUID } from 'node:crypto'
import { codeHash, PILOT_SCOPE, pilotOrigin } from '../api/access.ts'
import { DOMAIN_RE } from '../verifier/verify.ts'
import { TRACKER } from '../../packages/tracker/release.ts'

const idValid = (id: string) => /^[a-z0-9][a-z0-9_-]{0,47}$/.test(id)
const newCode = () => `scp_${randomBytes(32).toString('base64url')}`
const audit = (sql: Sql, action: string, id: string) =>
  sql.query('insert into audit_log (actor,action,target) values ($1,$2,$3)', [
    'pilot-cli',
    action,
    id,
  ])

async function insertCode(sql: Sql, id: string) {
  const code = newCode()
  await sql.query('insert into api_keys (id,tenant_id,hash,scopes) values ($1,$2,$3,$4)', [
    randomUUID(),
    id,
    codeHash(code),
    [PILOT_SCOPE],
  ])
  return code
}

export function trackerSnippet(site: string, origin: string) {
  pilotOrigin(origin)
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(site)) throw new Error('Invalid snippet configuration')
  return `<script async src="${origin}${TRACKER.path}" integrity="${TRACKER.integrity}" crossorigin="anonymous" referrerpolicy="no-referrer" data-site="${site}"></script>`
}

export async function enrollPilot(
  sql: Sql,
  input: { id: string; name: string; domain: string; origin: string },
) {
  const { id, name, origin } = input
  const domain = input.domain.toLowerCase()
  if (
    !idValid(id) ||
    !name.trim() ||
    name.length > 100 ||
    /[\x00-\x1f\x7f]/.test(name) ||
    !DOMAIN_RE.test(domain)
  )
    throw new Error('Invalid enrollment')
  const siteId = `${id}_web`
  const snippet = trackerSnippet(siteId, origin)
  const verificationToken = randomBytes(24).toString('hex')
  const accessCode = await transaction(sql, async (q) => {
    await q.query('insert into tenants (id,name,public_card) values ($1,$2,false)', [
      id,
      name.trim(),
    ])
    await q.query('insert into sites (id,tenant_id) values ($1,$2)', [siteId, id])
    await q.query('insert into domains (tenant_id,domain,token) values ($1,$2,$3)', [
      id,
      domain,
      verificationToken,
    ])
    const code = await insertCode(q, id)
    await audit(q, 'enroll', id)
    return code
  })
  return { accessCode, verificationToken, siteId, snippet }
}

export async function verifyPilot(
  sql: Sql,
  id: string,
  method: string,
  check: (domain: string, token: string) => Promise<boolean>,
) {
  if (!idValid(id) || !['meta', 'dns', 'sep1'].includes(method))
    throw new Error('Invalid verification')
  const { rows } = await sql.query<{ domain: string; token: string }>(
    "select d.domain,d.token from domains d join tenants t on t.id=d.tenant_id where t.id=$1 and t.status='active' and not t.public_card",
    [id],
  )
  if (rows.length !== 1) throw new Error('Expected one active pilot domain')
  const { domain, token } = rows[0]
  const ok = await check(domain, token)
  await transaction(sql, async (q) => {
    await q.query(
      'update domains set method=$4,last_checked_at=now(),verified_at=case when $3 then now() else null end where tenant_id=$1 and token=$2',
      [id, token, ok, method],
    )
    await audit(q, ok ? 'verify-success' : 'verify-failed', id)
  })
  return ok
}

export async function revokePilotAccess(sql: Sql, id: string) {
  if (!idValid(id)) throw new Error('Invalid project')
  const { rows } = await sql.query('select id from tenants where id=$1 and not public_card', [id])
  if (!rows.length) throw new Error('Unknown private project')
  await sql.query(
    'update api_keys set revoked_at=now() where tenant_id=$1 and $2=any(scopes) and revoked_at is null',
    [id, PILOT_SCOPE],
  )
}

export async function rotatePilotAccess(sql: Sql, id: string) {
  if (!idValid(id)) throw new Error('Invalid project')
  return transaction(sql, async (q) => {
    const { rows } = await q.query(
      "select id from tenants where id=$1 and status='active' and not public_card for update",
      [id],
    )
    if (!rows.length) throw new Error('Unknown active project')
    await revokePilotAccess(q, id)
    const code = await insertCode(q, id)
    await audit(q, 'rotate-access', id)
    return code
  })
}

export async function suspendPilot(sql: Sql, id: string) {
  if (!idValid(id)) throw new Error('Invalid project')
  await transaction(sql, async (q) => {
    const { rows } = await q.query(
      "update tenants set status='suspended' where id=$1 and not public_card and status <> 'removed' returning id",
      [id],
    )
    if (!rows.length) throw new Error('Unknown private project')
    await revokePilotAccess(q, id)
    await audit(q, 'suspend', id)
  })
}
