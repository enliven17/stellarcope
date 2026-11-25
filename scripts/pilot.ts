import { parseArgs } from 'node:util'
import { connect, migrate } from '../services/shared/db.ts'
import {
  enrollPilot,
  revokePilotAccess,
  rotatePilotAccess,
  suspendPilot,
  verifyPilot,
} from '../services/pilot/onboarding.ts'
import { checkDns, checkMeta, checkSep1 } from '../services/verifier/verify.ts'
import { sitesOf, webStats } from '../services/api/stats.ts'

// Operator-only CLI. It never opens a public administration endpoint.
const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: {
    id: { type: 'string' },
    name: { type: 'string' },
    domain: { type: 'string' },
    method: { type: 'string', default: 'meta' },
    account: { type: 'string' },
  },
})
const [command] = positionals
if (
  !command ||
  !['init', 'enroll', 'verify', 'rotate', 'revoke', 'suspend', 'export'].includes(command) ||
  (command !== 'init' && !values.id)
) {
  console.error(
    'Usage: npm run pilot -- init | enroll --id ID --name NAME --domain DOMAIN | verify --id ID [--method meta|dns|sep1] [--account PUBLIC_KEY] | rotate|revoke|suspend|export --id ID',
  )
  process.exitCode = 1
} else {
  let sql: Awaited<ReturnType<typeof connect>> | undefined
  try {
    sql = await connect()
    const id = values.id ?? ''
    if (command === 'init') {
      await migrate(sql)
      console.log('Pilot schema ready')
    }
    if (command === 'enroll') {
      const enrolled = await enrollPilot(sql, {
        id,
        name: values.name ?? '',
        domain: values.domain ?? '',
        origin: process.env.PILOT_ORIGIN ?? 'https://stellarcope.xyz',
      })
      console.log(
        JSON.stringify(
          {
            project: id,
            dashboard: `${process.env.PILOT_ORIGIN ?? 'https://stellarcope.xyz'}/pilot`,
            ...enrolled,
            verificationTag: `<meta name="stellarcope-verify" content="${enrolled.verificationToken}" />`,
            accessExpiresInDays: 30,
          },
          null,
          2,
        ),
      )
    }
    if (command === 'verify') {
      const method = values.method ?? 'meta'
      if (method === 'sep1' && !/^G[A-Z2-7]{55}$/.test(values.account ?? ''))
        throw new Error('Public account required')
      const ok = await verifyPilot(sql, id, method, (domain, token) =>
        method === 'dns'
          ? checkDns(domain, token)
          : method === 'sep1'
            ? checkSep1(domain, values.account!)
            : checkMeta(domain, token),
      )
      console.log(
        ok
          ? 'Domain verified; collection enabled'
          : 'Domain verification failed; collection disabled',
      )
      if (!ok) process.exitCode = 1
    }
    if (command === 'rotate')
      console.log(
        JSON.stringify(
          { project: id, accessCode: await rotatePilotAccess(sql, id), accessExpiresInDays: 30 },
          null,
          2,
        ),
      )
    if (command === 'revoke') {
      await revokePilotAccess(sql, id)
      console.log('Project access revoked')
    }
    if (command === 'suspend') {
      await suspendPilot(sql, id)
      console.log('Project suspended; access and collection disabled')
    }
    if (command === 'export') {
      const { rows } = await sql.query(
        'select id,name from tenants where id=$1 and not public_card',
        [id],
      )
      if (!rows.length) throw new Error('Unknown pilot')
      console.log(
        JSON.stringify(
          { tenant: rows[0], days: 90, web: await webStats(sql, await sitesOf(sql, id), 90) },
          null,
          2,
        ),
      )
    }
  } catch {
    console.error(
      'Pilot command failed. Check arguments, database configuration and project state.',
    )
    process.exitCode = 1
  } finally {
    await (sql as unknown as { end?(): Promise<void> } | undefined)?.end?.()
  }
}
