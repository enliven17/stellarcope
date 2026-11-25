// Disposable integration check. Never reads DATABASE_URL or uses an existing database.
import assert from 'node:assert/strict'
import { execFile, spawn } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { createServer } from 'node:net'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { setTimeout as delay } from 'node:timers/promises'
import pg from 'pg'
import { connect, transaction } from '../services/shared/db.ts'
import { verifyPilot } from '../services/pilot/onboarding.ts'
import { seal } from '../services/api/seal.ts'
import { rootFromProof, sha256 } from '../packages/core/merkle.ts'

const run = promisify(execFile)
const root = fileURLToPath(new URL('../', import.meta.url))
const image = 'postgres:17.12-alpine'
const name = `stellarcope-pilot-smoke-${process.pid}-${randomBytes(4).toString('hex')}`
const database = 'pilot_smoke'
const password = randomBytes(24).toString('hex')
const runtimePassword = randomBytes(24).toString('hex')
const checks = []
const restartRecovery = { milliseconds: 0, responses: [] }
let created = false
let backend
let admin
let sql
let backendLog = ''
let cleanupPromise
const docker = async (...args) =>
  (await run('docker', args, { timeout: 90000, maxBuffer: 4 * 1024 * 1024 })).stdout.trim()
const poolEnd = async (pool) => {
  if (pool && !pool.ended) await pool.end()
}
const check = async (label, action) => {
  await action()
  checks.push(label)
  console.log(`PASS ${label}`)
}
async function until(action, timeout = 30000) {
  const deadline = Date.now() + timeout
  let last
  while (Date.now() < deadline) {
    try {
      const result = await action()
      if (result) return result
    } catch (error) {
      last = error
    }
    await delay(100)
  }
  throw last ?? new Error('Smoke condition timed out')
}
async function freePort() {
  const server = createServer()
  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  const port = server.address().port
  await new Promise((resolve) => server.close(resolve))
  return port
}
const cleanup = () => (cleanupPromise ??= cleanupResources())
async function cleanupResources() {
  if (backend && backend.exitCode === null) {
    backend.kill('SIGTERM')
    await until(() => backend.exitCode !== null || backend.signalCode !== null, 15000).catch(() =>
      backend.kill('SIGKILL'),
    )
  }
  // Start closing pools before stopping PostgreSQL, so idle admin connections
  // are detached. Removing the container also unblocks any in-flight queries.
  const closing = Promise.allSettled([poolEnd(sql), poolEnd(admin)])
  try {
    if (created) {
      await docker('rm', '-f', '-v', name)
      created = false
    }
  } finally {
    await closing
  }
}

try {
  await docker('info', '--format', '{{.ServerVersion}}')
  // An automatically assigned Docker host port can change on container restart.
  const databasePort = await freePort()
  await docker(
    'run',
    '--detach',
    '--rm',
    '--name',
    name,
    '--label',
    'stellarcope.test=pilot-smoke',
    '--publish',
    `127.0.0.1:${databasePort}:5432`,
    '--env',
    `POSTGRES_PASSWORD=${password}`,
    '--env',
    `POSTGRES_DB=${database}`,
    image,
  )
  created = true
  for (const [signal, code] of [
    ['SIGINT', 130],
    ['SIGTERM', 143],
  ]) {
    process.once(signal, () => {
      void cleanup().then(
        () => process.exit(code),
        () => process.exit(1),
      )
    })
  }
  await until(async () => {
    await docker('exec', name, 'pg_isready', '-h', '127.0.0.1', '-U', 'postgres', '-d', database)
    return true
  })
  const address = await docker('port', name, '5432/tcp')
  assert.match(address, /^127\.0\.0\.1:\d+$/)
  const adminUrl = `postgresql://postgres:${password}@${address}/${database}`
  const runtimeUrl = `postgresql://pilot_runtime:${runtimePassword}@${address}/${database}?application_name=stellarcope-pilot-smoke`
  admin = new pg.Pool({ connectionString: adminUrl, max: 3, connectionTimeoutMillis: 5000 })
  const version = await until(
    async () => (await admin.query('show server_version')).rows[0].server_version,
  )
  assert.match(version, /^17\.12(?:\D|$)/)
  const port = await freePort()
  const origin = `http://127.0.0.1:${port}`
  const env = (url) => ({
    ...process.env,
    DATABASE_URL: url,
    PILOT_ORIGIN: origin,
    PILOT_PORT: String(port),
    PATH: `${dirname(process.execPath)}:${process.env.PATH}`,
  })
  const cli = async (args, url = runtimeUrl) =>
    (
      await run(process.execPath, ['scripts/pilot.ts', ...args], {
        cwd: root,
        env: env(url),
        timeout: 20000,
      })
    ).stdout

  await check('schema initialization and repeat initialization', async () => {
    await cli(['init'], adminUrl)
    await cli(['init'], adminUrl)
    assert.deepEqual((await admin.query('select id from tenants')).rows, [])
  })
  await admin.query(`create role pilot_runtime login password '${runtimePassword}'`)
  await admin.query('grant usage on schema public to pilot_runtime')
  await admin.query(
    'grant select,insert,update,delete on all tables in schema public to pilot_runtime',
  )
  sql = await connect(runtimeUrl)
  await check('application role has DML access without table ownership or superuser', async () => {
    const row = (
      await sql.query(
        'select current_user as role, usesuper from pg_user where usename=current_user',
      )
    ).rows[0]
    assert.equal(row.role, 'pilot_runtime')
    assert.equal(row.usesuper, false)
    assert.equal(
      Number(
        (
          await sql.query(
            "select count(*) from pg_tables where schemaname='public' and tableowner=current_user",
          )
        ).rows[0].count,
      ),
      0,
    )
    await assert.rejects(sql.query('create table must_not_create(id int)'), { code: '42501' })
  })
  let a, b
  await check(
    'real CLI enrollment is private and rejects duplicate projects atomically',
    async () => {
      a = JSON.parse(
        await cli([
          'enroll',
          '--id',
          'project-a',
          '--name',
          'Project A',
          '--domain',
          'a.example.test',
        ]),
      )
      b = JSON.parse(
        await cli([
          'enroll',
          '--id',
          'project-b',
          '--name',
          'Project B',
          '--domain',
          'b.example.test',
        ]),
      )
      await assert.rejects(
        cli([
          'enroll',
          '--id',
          'project-a',
          '--name',
          'Overwrite',
          '--domain',
          'other.example.test',
        ]),
      )
      assert.equal(Number((await sql.query('select count(*) from tenants')).rows[0].count), 2)
      assert.ok(
        (await sql.query('select public_card from tenants')).rows.every((row) => !row.public_card),
      )
      assert.ok(
        !(await sql.query('select hash from api_keys')).rows.some(
          (row) => row.hash === a.accessCode || row.hash === b.accessCode,
        ),
      )
    },
  )
  backend = spawn(process.execPath, ['--env-file-if-exists=.env.local', 'services/pilot/main.ts'], {
    cwd: root,
    env: env(runtimeUrl),
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  for (const stream of [backend.stdout, backend.stderr])
    stream.on('data', (chunk) => {
      backendLog = (backendLog + chunk).slice(-16000)
    })
  const request = (path, options = {}) =>
    fetch(`${origin}${path}`, { ...options, signal: AbortSignal.timeout(15000) })
  await until(async () => {
    assert.equal(backend.exitCode, null, 'pilot process exited during startup')
    return (await request('/api/health')).status === 200
  })
  const ua =
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 Chrome/130.0.0.0 Safari/537.36'
  const post = (project, path, extras = {}) =>
    request('/e', {
      method: 'POST',
      headers: {
        'content-type': 'text/plain',
        origin: `https://${project === a ? 'a' : 'b'}.example.test`,
        'user-agent': ua,
      },
      body: JSON.stringify({
        site: project.siteId,
        hostname: `${project === a ? 'a' : 'b'}.example.test`,
        type: 'pageview',
        path,
        ...extras,
      }),
    })
  const bearer = (code) => ({ authorization: `Bearer ${code}` })
  const stats = async (project, code) => {
    const response = await request(`/api/stats?tenant=${project.project}&days=7`, {
      headers: bearer(code),
    })
    assert.equal(response.status, 200)
    return response.json()
  }

  await check(
    'unverified sites reject collection and verified sites persist before 202',
    async () => {
      assert.equal((await post(a, '/before-verification')).status, 400)
      assert.equal(await verifyPilot(sql, a.project, 'meta', async () => true), true)
      assert.equal(await verifyPilot(sql, b.project, 'meta', async () => true), true)
      assert.equal((await post(a, '/welcome?secret=discard')).status, 202)
      assert.deepEqual((await sql.query('select path from events')).rows, [{ path: '/welcome' }])
    },
  )
  await check(
    'concurrent pooled collection preserves exact accepted counts and tenant attribution',
    async () => {
      const responses = await Promise.all(
        Array.from({ length: 40 }, (_, i) => post(i % 2 ? a : b, `/page/item-${i}`)),
      )
      assert.ok(
        responses.every((response) => response.status === 202),
        responses.map((r) => r.status).join(','),
      )
      assert.equal((await stats(a, a.accessCode)).web.pageviews, 21)
      assert.equal((await stats(b, b.accessCode)).web.pageviews, 20)
      assert.equal((await sql.query('select count(distinct salt) as n from salts')).rows[0].n, '1')
    },
  )
  await check('cookie login and every private report deny cross-project access', async () => {
    const response = await request('/api/pilot', {
      method: 'POST',
      headers: { origin, 'content-type': 'application/json' },
      body: JSON.stringify({ code: a.accessCode }),
    })
    assert.equal(response.status, 200)
    const cookie = response.headers.get('set-cookie').split(';')[0]
    for (const resource of ['stats', 'live', 'seals', 'proof']) {
      assert.equal(
        (await request(`/api/${resource}?tenant=${b.project}`, { headers: { cookie } })).status,
        404,
      )
      assert.equal((await request(`/api/${resource}?tenant=${a.project}`)).status, 404)
    }
    const own = await request(`/api/stats?tenant=${a.project}`, { headers: { cookie } })
    assert.equal(own.status, 200)
    assert.equal(own.headers.get('cache-control'), 'no-store')
  })
  await check('a database lock prevents premature success acknowledgment', async () => {
    const lock = await admin.connect()
    let pending
    try {
      await lock.query('begin')
      await lock.query('lock table events in exclusive mode')
      let finished = false
      pending = post(a, '/commit-boundary').then((response) => {
        finished = true
        return response
      })
      await until(
        async () =>
          Number(
            (
              await admin.query(
                "select count(*) from pg_stat_activity where application_name='stellarcope-pilot-smoke' and wait_event_type='Lock'",
              )
            ).rows[0].count,
          ) > 0,
      )
      assert.equal(finished, false)
      await lock.query('commit')
      assert.equal((await pending).status, 202)
      assert.equal(
        Number(
          (await sql.query("select count(*) from events where path='/commit-boundary'")).rows[0]
            .count,
        ),
        1,
      )
    } finally {
      await lock.query('rollback').catch(() => {})
      lock.release()
      await pending
    }
  })
  await check('failed writes roll back and the pool serves later requests', async () => {
    await admin.query(
      "create function smoke_reject() returns trigger language plpgsql as $$begin if NEW.path='/forced-failure' then raise exception 'smoke injected failure'; end if; return NEW; end$$",
    )
    await admin.query(
      'create trigger smoke_reject before insert on events for each row execute function smoke_reject()',
    )
    const response = await post(a, '/forced-failure')
    assert.equal(response.status, 503)
    assert.equal(response.headers.get('retry-after'), '60')
    assert.equal(
      Number(
        (await sql.query("select count(*) from events where path='/forced-failure'")).rows[0].count,
      ),
      0,
    )
    await admin.query('drop trigger smoke_reject on events')
    await admin.query('drop function smoke_reject()')
    assert.equal((await post(a, '/after-write-failure')).status, 202)
    await assert.rejects(
      transaction(sql, async (q) => {
        await q.query(
          "insert into audit_log(actor,action,target) values ('smoke','rollback','must-not-exist')",
        )
        throw new Error('rollback requested')
      }),
      /rollback requested/,
    )
    assert.equal(
      Number(
        (await sql.query("select count(*) from audit_log where target='must-not-exist'")).rows[0]
          .count,
      ),
      0,
    )
  })
  await check(
    'daily Merkle summaries and protected inclusion proofs use real PostgreSQL rows',
    async () => {
      const day = new Date().toISOString().slice(0, 10)
      await seal(sql, day)
      const response = await request(`/api/proof?tenant=${a.project}&day=${day}`, {
        headers: bearer(a.accessCode),
      })
      assert.equal(response.status, 200)
      const proof = await response.json()
      assert.equal(sha256(proof.summary), proof.leaf)
      assert.equal(rootFromProof(proof.leaf, proof.path), proof.stored_root)
    },
  )
  await check('documented npm export produces parseable JSON without credentials', async () => {
    const output = (
      await run('npm', ['run', '--silent', 'pilot', '--', 'export', '--id', a.project], {
        cwd: root,
        env: env(runtimeUrl),
        timeout: 20000,
      })
    ).stdout
    const report = JSON.parse(output)
    assert.equal(report.tenant.id, a.project)
    assert.equal(report.web.pageviews, 23)
    assert.ok(!output.includes(a.accessCode))
  })
  await check('concurrent access rotation leaves one usable credential', async () => {
    const codes = await Promise.all(
      Array.from(
        { length: 4 },
        async () => JSON.parse(await cli(['rotate', '--id', a.project])).accessCode,
      ),
    )
    const responses = await Promise.all(
      codes.map((code) => request('/api/pilot', { headers: bearer(code) })),
    )
    assert.equal(responses.filter((response) => response.status === 200).length, 1)
    assert.equal((await request('/api/pilot', { headers: bearer(a.accessCode) })).status, 401)
    a.accessCode = codes[responses.findIndex((response) => response.status === 200)]
  })
  await check('a blocked write times out without committing after its rejection', async () => {
    const lock = await admin.connect()
    let pending
    try {
      await lock.query('begin')
      await lock.query('lock table events in exclusive mode')
      pending = post(b, '/timed-out-write')
      await until(
        async () =>
          Number(
            (
              await admin.query(
                "select count(*) from pg_stat_activity where application_name='stellarcope-pilot-smoke' and wait_event_type='Lock'",
              )
            ).rows[0].count,
          ) > 0,
      )
      const response = await pending
      assert.equal(response.status, 503)
      assert.equal(response.headers.get('retry-after'), '60')
      await lock.query('commit')
    } finally {
      await lock.query('rollback').catch(() => {})
      lock.release()
      await pending
    }
    assert.equal(
      Number(
        (await sql.query("select count(*) from events where path='/timed-out-write'")).rows[0]
          .count,
      ),
      0,
    )
  })
  await check('database unavailability rejects admission and recovers', async () => {
    await docker('pause', name)
    try {
      const response = await post(b, '/during-database-pause')
      assert.equal(response.status, 503)
      assert.equal(response.headers.get('retry-after'), '60')
    } finally {
      await docker('unpause', name)
    }
    assert.equal((await post(b, '/after-database-pause')).status, 202)
    assert.equal(
      Number(
        (await sql.query("select count(*) from events where path='/during-database-pause'")).rows[0]
          .count,
      ),
      0,
    )
    assert.equal((await stats(b, b.accessCode)).web.pageviews, 21)
  })
  await check('pilot survives database restart and keeps committed data', async () => {
    await poolEnd(sql)
    sql = undefined
    await poolEnd(admin)
    admin = undefined
    await docker('restart', '--timeout', '1', name)
    assert.equal(await docker('port', name, '5432/tcp'), address)
    await until(async () => {
      await docker('exec', name, 'pg_isready', '-h', '127.0.0.1', '-U', 'postgres', '-d', database)
      return true
    })
    assert.equal(backend.exitCode, null, 'pilot crashed when PostgreSQL disconnected idle clients')
    const started = Date.now()
    const response = await until(async () => {
      assert.equal(backend.exitCode, null, 'pilot exited while reconnecting')
      const response = await request(`/api/stats?tenant=${a.project}`, {
        headers: bearer(a.accessCode),
      })
      restartRecovery.responses.push(response.status)
      assert.ok([200, 503].includes(response.status), 'unexpected recovery response')
      if (response.status === 200) return response
      await response.arrayBuffer()
      return false
    }, 15000)
    restartRecovery.milliseconds = Date.now() - started
    assert.equal((await response.json()).web.pageviews, 23)
    assert.equal((await post(a, '/after-database-restart')).status, 202)
    sql = await connect(runtimeUrl)
  })
  await check('revocation and suspension immediately disable access and admission', async () => {
    await cli(['revoke', '--id', a.project])
    assert.equal((await request('/api/pilot', { headers: bearer(a.accessCode) })).status, 401)
    await cli(['suspend', '--id', b.project])
    assert.equal((await post(b, '/after-suspension')).status, 400)
    assert.equal((await request('/api/pilot', { headers: bearer(b.accessCode) })).status, 401)
    assert.equal(
      Number(
        (await sql.query("select count(*) from events where path='/after-suspension'")).rows[0]
          .count,
      ),
      0,
    )
  })
  const identity = JSON.parse(await docker('image', 'inspect', image, '--format', '{{json .}}'))
  console.log(
    JSON.stringify(
      {
        timestamp: new Date().toISOString(),
        node: process.version,
        postgres: version,
        image,
        imageId: identity.Id,
        repoDigests: identity.RepoDigests,
        architecture: identity.Architecture,
        checks: checks.length,
        results: checks,
        restartRecovery,
        externalTransactions: 0,
      },
      null,
      2,
    ),
  )
} catch (error) {
  console.error(
    `FAIL ${String(error.stack ?? error)
      .replaceAll(password, '[redacted]')
      .replaceAll(runtimePassword, '[redacted]')}`,
  )
  if (backendLog)
    console.error(
      backendLog
        .replaceAll(password, '[redacted]')
        .replaceAll(runtimePassword, '[redacted]')
        .split('\n')
        .slice(0, 28)
        .join('\n'),
    )
  process.exitCode = 1
} finally {
  await cleanup()
  console.log('Disposable PostgreSQL container and application processes cleaned up')
}
