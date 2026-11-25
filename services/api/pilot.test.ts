import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { PGlite } from '@electric-sql/pglite'
import { migrate, type Sql } from '../shared/db.ts'
import { pilotSession, tenantReport } from './pilot.ts'
import { webStats } from './stats.ts'

const codeA = `scp_${'a'.repeat(43)}`
const codeB = `scp_${'b'.repeat(43)}`
const hash = (s: string) => createHash('sha256').update(s).digest('hex')

test('pilot HTTP access isolates private reports, preserves public reads and revokes sessions', async () => {
  const db = new PGlite()
  const sql = db as unknown as Sql
  await migrate(sql)
  await sql.query(
    "insert into tenants (id,name,public_card) values ('a','Private A',false),('b','Private B',false),('public','Public',true)",
  )
  await sql.query("insert into sites (id,tenant_id) values ('site-a','a'),('site-b','b')")
  await sql.query(
    "insert into api_keys (id,tenant_id,hash,scopes) values ('key-a','a',$1,ARRAY['pilot:read']),('key-b','b',$2,ARRAY['pilot:read'])",
    [hash(codeA), hash(codeB)],
  )
  await sql.query(
    "insert into events (site_id,ts,type,path,visitor) values ('site-a',now(),'pageview','/private-a','visitor-a'),('site-b',now(),'pageview','/private-b','visitor-b')",
  )
  let origin = ''
  const server = createServer((req, res) => {
    const path = new URL(req.url ?? '/', 'http://test').pathname.slice(1)
    const handler =
      path === 'session'
        ? pilotSession(sql, origin)
        : (req: Parameters<typeof tenantReport>[1], res: Parameters<typeof tenantReport>[2]) =>
            tenantReport(sql, req, res, path as 'stats')
    void Promise.resolve(handler(req, res)).catch(() => {
      res.statusCode = 500
      res.end()
    })
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  const get = (path: string, headers: Record<string, string> = {}) =>
    fetch(`${origin}${path}`, { headers })
  try {
    for (const resource of ['stats', 'live', 'seals', 'proof']) {
      assert.equal((await get(`/${resource}?tenant=a`)).status, 404, resource)
      assert.equal(
        (await get(`/${resource}?tenant=b`, { authorization: `Bearer ${codeA}` })).status,
        404,
        resource,
      )
    }
    const publicRead = await get('/stats?tenant=public')
    assert.equal(publicRead.status, 200)
    assert.equal(publicRead.headers.get('cache-control'), 'no-store')
    const login = await fetch(`${origin}/session`, {
      method: 'POST',
      headers: { origin, 'content-type': 'application/json' },
      body: JSON.stringify({ code: codeA }),
    })
    assert.equal(login.status, 200)
    assert.deepEqual(await login.json(), { tenant: { id: 'a', name: 'Private A' } })
    const setCookie = login.headers.get('set-cookie')!
    assert.match(setCookie, /HttpOnly/)
    assert.match(setCookie, /SameSite=Strict/)
    assert.doesNotMatch(setCookie, /Domain=/i)
    const cookie = setCookie.split(';')[0]
    const session = await get('/session', { cookie })
    assert.deepEqual(await session.json(), { tenant: { id: 'a', name: 'Private A' } })
    const a = await get('/stats?tenant=a&days=7', { cookie })
    assert.equal(a.status, 200)
    assert.equal(a.headers.get('cache-control'), 'no-store')
    const stats = (await a.json()) as { web: { pageviews: number; pages: { label: string }[] } }
    assert.equal(stats.web.pageviews, 1)
    assert.deepEqual(
      stats.web.pages.map((p: { label: string }) => p.label),
      ['/private-a'],
    )
    assert.equal((await get('/stats?tenant=b', { cookie })).status, 404)
    const live = await get('/live?tenant=a', { cookie })
    assert.equal(live.status, 200)
    assert.equal(
      ((await live.json()) as { events: { path: string }[] }).events[0].path,
      '/private-a',
    )
    assert.equal((await get('/seals?tenant=a', { cookie })).status, 200)
    assert.equal((await get('/stats?tenant=b', { authorization: `Bearer ${codeB}` })).status, 200)
    await sql.query("update api_keys set revoked_at=now() where id='key-a'")
    assert.equal((await get('/session', { cookie })).status, 401)
    assert.equal((await get('/stats?tenant=a', { cookie })).status, 404)
    await sql.query("update tenants set status='suspended' where id='b'")
    assert.equal((await get('/stats?tenant=b', { authorization: `Bearer ${codeB}` })).status, 404)
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()))
    await db.close()
  }
})

test('pilot credentials enforce age, scope, origin, body limits and HTTPS cookie protection', async () => {
  const db = new PGlite()
  const sql = db as unknown as Sql
  await migrate(sql)
  assert.throws(() => pilotSession(sql, 'http://public.example'))
  await sql.query("insert into tenants (id,name) values ('a','A')")
  await sql.query(
    "insert into api_keys (id,tenant_id,hash,scopes,created_at) values ('key','a',$1,ARRAY['pilot:read'], now()-interval '31 days')",
    [hash(codeA)],
  )
  const handler = pilotSession(sql, 'https://pilot.example')
  const server = createServer((req, res) => {
    void handler(req, res).catch(() => {
      res.statusCode = 500
      res.end()
    })
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  const login = (body: string, origin = 'https://pilot.example', type = 'application/json') =>
    fetch(base, { method: 'POST', headers: { origin, 'content-type': type }, body })
  try {
    assert.equal((await login(JSON.stringify({ code: codeA }))).status, 401)
    await sql.query("update api_keys set created_at=now(),scopes=ARRAY['unrelated']")
    assert.equal((await login(JSON.stringify({ code: codeA }))).status, 401)
    await sql.query("update api_keys set scopes=ARRAY['pilot:read']")
    assert.equal(
      (await login(JSON.stringify({ code: codeA }), 'https://attacker.example')).status,
      403,
    )
    assert.equal(
      (await login(JSON.stringify({ code: codeA }), 'https://pilot.example', 'text/plain')).status,
      415,
    )
    assert.equal((await login('x'.repeat(4097))).status, 413)
    assert.equal((await login('{')).status, 400)
    assert.equal((await login(JSON.stringify({ code: codeA, tenant: 'b' }))).status, 400)
    const valid = await login(JSON.stringify({ code: codeA }))
    assert.equal(valid.status, 200)
    assert.match(valid.headers.get('set-cookie')!, /; Secure/)
    const rejectedLogout = await fetch(base, {
      method: 'DELETE',
      headers: { origin: 'https://attacker.example' },
    })
    assert.equal(rejectedLogout.status, 403)
    const logout = await fetch(base, {
      method: 'DELETE',
      headers: { origin: 'https://pilot.example' },
    })
    assert.equal(logout.status, 204)
    assert.match(logout.headers.get('set-cookie')!, /Max-Age=0/)
    assert.equal((await fetch(base, { method: 'PUT' })).status, 405)
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()))
    await db.close()
  }
})

test('top-page percentages use all pageviews rather than only the truncated list', async () => {
  const db = new PGlite()
  const sql = db as unknown as Sql
  await migrate(sql)
  try {
    for (let i = 0; i < 10; i++)
      await sql.query(
        "insert into events(site_id,ts,type,path,visitor) values ('site',now(),'pageview',$1,'visitor')",
        [`/page-${i}`],
      )
    const stats = await webStats(sql, ['site'], 7)
    assert.equal(stats.pageviews, 10)
    assert.equal(stats.pages.length, 8)
    assert.ok(stats.pages.every((page) => page.share === 0.1))
  } finally {
    await db.close()
  }
})
