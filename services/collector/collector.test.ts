import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { AddressInfo } from 'node:net'
import { PGlite } from '@electric-sql/pglite'
import { collector, parsePayload, scrubProps } from './server.ts'
import { staticSites } from '../shared/sites.ts'
import { Spool } from '../shared/spool.ts'
import { migrate, type Sql } from '../shared/db.ts'
import { drain } from '../writer/writer.ts'

const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'
const view = (over: Record<string, unknown> = {}) => JSON.stringify({ site: 'hx_7f3a', type: 'pageview', path: '/swap', hostname: 'halcyon.exchange', screen: { w: 390, h: 844 }, ...over })

test('payload validation rejects malformed and oversized fields', () => {
  assert.ok(parsePayload(view()))
  assert.equal(parsePayload('not json'), null)
  assert.equal(parsePayload(view({ path: 'swap' })), null)
  assert.equal(parsePayload(view({ type: 'click' })), null)
  assert.equal(parsePayload(view({ type: 'event' })), null)
  assert.equal(parsePayload(view({ site: 'x'.repeat(65) })), null)
})

test('event props are flattened and personal values masked', () => {
  const p = scrubProps({ pair: 'XLM/USDC', amount: 12, ok: true, email: 'a@b.co', who: 'GBX7HQ6KH7UQ3RPZT2Y4Q5C4WJ6LVQZPJ2Q4QG4D2NWZK3F5Y3EQQ4ZD', nested: { a: 1 } })
  assert.deepEqual(p, { pair: 'XLM/USDC', amount: 12, ok: true, email: '[masked]', who: '[masked]' })
})

test('collector to spool to postgres, with filtering counted', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'stellarcope-spool-'))
  const spool = new Spool(dir)
  const t0 = Date.UTC(2026, 10, 14, 12, 0, 5)
  const { handle, stats } = collector({ sites: staticSites({ hx_7f3a: { tenantId: 'halcyon', domains: ['halcyon.exchange'] } }), spool, now: () => t0 })
  const server = createServer((req, res) => void handle(req, res)).listen(0)
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  const post = (body: string, headers: Record<string, string> = {}) =>
    fetch(`${base}/e`, { method: 'POST', body, headers: { 'user-agent': UA, origin: 'https://halcyon.exchange', 'content-type': 'text/plain', 'x-forwarded-for': '203.0.113.7', 'cf-ipcountry': 'NG', ...headers } })

  try {
    const codes = await Promise.all([
      post(view()),
      post(view({ path: '/pools' })),
      post(view({ type: 'event', name: 'quote_requested', props: { pair: 'XLM/USDC' } })),
      post(view(), { origin: 'https://copycat.io' }),
      post(view(), { 'user-agent': 'Googlebot/2.1' }),
      post(view({ webdriver: true })),
      post(view({ site: 'unknown' })),
      post('garbage'),
    ]).then((rs) => rs.map((r) => r.status))
    assert.deepEqual(codes, [202, 202, 202, 403, 403, 403, 400, 400])
    assert.deepEqual({ ...stats }, { accepted: 3, dropped: 3, invalid: 2 })

    const js = await fetch(`${base}/t/1.0.0/a.js`)
    assert.equal(js.status, 200)
    assert.match(js.headers.get('cache-control') ?? '', /immutable/)
    assert.equal((await fetch(`${base}/t/../a.js`)).status, 404)
  } finally {
    server.close()
  }

  await spool.flush(t0)
  const db = new PGlite()
  const sql = db as unknown as Sql
  await migrate(sql)
  const r = await drain(sql, spool, t0 + 60_000)
  assert.deepEqual(r, { files: 1, events: 3, drops: 3 })
  assert.deepEqual(await spool.closed(t0 + 120_000), [], 'drained files are removed')

  const { rows } = await sql.query<{ type: string; path: string; country: string; device: string; browser: string; visitor: string }>('select type, path, country, device, browser, visitor from events order by path')
  assert.equal(rows.length, 3)
  assert.deepEqual(rows.map((x) => x.path), ['/pools', '/swap', '/swap'])
  assert.ok(rows.every((x) => x.country === 'NG' && x.device === 'Mobile' && x.browser === 'Safari'))
  assert.equal(new Set(rows.map((x) => x.visitor)).size, 1, 'one visitor, same day')
  assert.ok(!JSON.stringify(rows).includes('203.0.113.7'), 'ip never stored')

  const drops = await sql.query<{ reason: string; count: number }>('select reason, count::int as count from drops order by reason')
  assert.deepEqual(drops.rows, [{ reason: 'bot', count: 1 }, { reason: 'headless', count: 1 }, { reason: 'origin', count: 1 }])
  await db.close()
})

test('collection waits for storage and returns a retryable error on storage failure', async () => {
  let enter!: () => void
  let commit!: () => void
  const entered = new Promise<void>((resolve) => { enter = resolve })
  const committed = new Promise<void>((resolve) => { commit = resolve })
  let finished = false
  let fail = false
  const { handle, stats } = collector({ sites: staticSites({ hx_7f3a: { tenantId: 'halcyon', domains: ['halcyon.exchange'] } }), spool: { push: async () => { enter(); if (fail) throw new Error('secret payload must not be reflected'); await committed } } })
  const server = createServer((req, res) => { res.on('finish', () => { finished = true }); void handle(req, res) })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  const post = () => fetch(`${base}/e`, { method: 'POST', body: view(), headers: { 'user-agent': UA, origin: 'https://halcyon.exchange' } })
  try {
    const response = post()
    await entered
    await new Promise<void>((resolve) => setImmediate(resolve))
    assert.equal(finished, false, '202 must wait for storage')
    assert.equal(stats.accepted, 0)
    commit()
    assert.equal((await response).status, 202)
    assert.equal(stats.accepted, 1)
    fail = true
    const failure = await post()
    assert.equal(failure.status, 503)
    assert.equal(failure.headers.get('retry-after'), '60')
    assert.doesNotMatch(await failure.text(), /secret|payload/)
    assert.equal(stats.accepted, 1, 'failed storage is not counted as accepted')
    const huge = await fetch(`${base}/e`, { method: 'POST', body: 'é'.repeat(5000) })
    assert.equal(huge.status, 413)
  } finally { commit(); await new Promise<void>((resolve) => server.close(() => resolve())) }
})

test('web paths and campaign fields discard queries, credentials and personal-looking values', () => {
  const p = parsePayload(view({ path: '/account/GBX7HQ6KH7UQ3RPZT2Y4Q5C4WJ6LVQZPJ2Q4QG4D2NWZK3F5Y3EQQ4ZD/person%40example.test?token=secret#fragment', utm: { source: 'person@example.test', medium: 'social', campaign: 'release-v1' } }))!
  assert.equal(p.path, '/account/:account/:redacted')
  assert.deepEqual(p.utm, { medium: 'social', campaign: 'release-v1' })
  assert.equal(parsePayload(view({ path: '//evil.test/x' })), null)
  assert.equal(parsePayload(view({ path: '/x/%0aheader' })), null)
  assert.equal(parsePayload(view({ tenantId: 'forged' })), null)
  assert.deepEqual(scrubProps({ email: 'person@example.test', 'person@example.test': 'bad', ratio: Infinity }), { email: '[masked]' })
})

test('encoded delimiters and credential-shaped metadata never enter collection records', () => {
  for (const path of ['/x%2f550e8400-e29b-41d4-a716-446655440000','/x%3ftoken=hidden','/person%2540example.test','/x%23hidden']) assert.equal(parsePayload(view({ path })), null, path)
  const code = `scp_${'a'.repeat(43)}`
  const p = parsePayload(view({ name: 'person@example.test', props: { token: code }, utm: { source: code } }))!
  assert.equal(p.name, undefined, 'pageviews discard unused event metadata')
  assert.equal(p.props, undefined)
  assert.deepEqual(p.utm, {})
  assert.equal(parsePayload(view({ type: 'event', name: 'person@example.test' })), null)
  assert.equal(parsePayload(view({ type: 'event', name: code })), null)
  assert.deepEqual(scrubProps({ token: code, phone: 905551234567, network: 'testnet' }), { token: '[masked]', phone: '[masked]', network: 'testnet' })
})

test('concurrent collection responses follow their own commits without mixing records', async () => {
  const release: Record<string, () => void> = {}
  const entered: Record<string, () => void> = {}
  const ready = Object.fromEntries(['/a','/b'].map((path) => [path, new Promise<void>((resolve) => { entered[path] = resolve })]))
  const commits: string[] = []
  const { handle } = collector({ sites: staticSites({ hx_7f3a: { tenantId: 'halcyon', domains: ['halcyon.exchange'] } }), spool: { push: async (record) => {
    if (record.kind !== 'event') throw new Error('unexpected record')
    const path = (record.data as { path: string }).path
    await new Promise<void>((resolve) => { release[path] = resolve; entered[path]() })
    commits.push(path)
  } } })
  const server = createServer((req,res) => { void handle(req,res) })
  await new Promise<void>((resolve) => server.listen(0,'127.0.0.1',resolve))
  const base=`http://127.0.0.1:${(server.address() as AddressInfo).port}`
  const post=(path:string)=>fetch(`${base}/e`,{method:'POST',body:view({path}),headers:{'user-agent':UA,origin:'https://halcyon.exchange'}})
  try {
    const a=post('/a'); const b=post('/b')
    await Promise.all(Object.values(ready))
    release['/b']()
    assert.equal((await b).status,202)
    assert.deepEqual(commits,['/b'])
    release['/a']()
    assert.equal((await a).status,202)
    assert.deepEqual(commits,['/b','/a'])
  } finally { Object.values(release).forEach((done)=>done()); await new Promise<void>((resolve)=>server.close(()=>resolve())) }
})
