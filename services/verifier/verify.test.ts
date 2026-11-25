import { test } from 'node:test'
import assert from 'node:assert/strict'
import { checkMeta, checkSep1, DOMAIN_RE, metaToken, tomlAccounts } from './verify.ts'

const G = 'GDHDZ57XLMH3JGZJETKLT3JDMBEPU2HYB3YH7FRLJGXREZVVV4TEBKIS'

test('reads ACCOUNTS from stellar.toml, single and multi line', () => {
  assert.deepEqual(tomlAccounts(`VERSION="2.0.0"\nACCOUNTS=["${G}"]\n`), [G])
  assert.deepEqual(tomlAccounts(`ACCOUNTS = [\n  "${G}",\n  "bogus"\n]`), [G])
  assert.deepEqual(tomlAccounts('NETWORK_PASSPHRASE="x"'), [])
})

test('reads the stellarcope meta tag in either attribute order', () => {
  assert.equal(
    metaToken('<head><meta name="stellarcope-verify" content="abc123"></head>'),
    'abc123',
  )
  assert.equal(metaToken("<meta content='xyz' name='stellarcope-verify' />"), 'xyz')
  assert.equal(metaToken('<meta name="description" content="x">'), null)
})

test('domain validation', () => {
  assert.ok(DOMAIN_RE.test('stellarcope.xyz'))
  assert.ok(!DOMAIN_RE.test('localhost'))
  assert.ok(!DOMAIN_RE.test('-bad.com'))
  assert.ok(!DOMAIN_RE.test('http://x.com'))
})

test('ownership verification follows only same-domain HTTPS redirects', async (context) => {
  let destination = 'https://unrelated.test/proof'
  context.mock.method(globalThis, 'fetch', async (url: string | URL, options: RequestInit) => {
    if (String(url).includes('example.test')) {
      if (options.redirect === 'manual' && String(url).includes('/proof'))
        return new Response(`<meta name="stellarcope-verify" content="token" />\nACCOUNTS=["${G}"]`)
      if (options.redirect === 'manual')
        return new Response(null, { status: 302, headers: { location: destination } })
    }
    return new Response(`<meta name="stellarcope-verify" content="token" />\nACCOUNTS=["${G}"]`)
  })
  assert.equal(await checkMeta('example.test', 'token'), false)
  assert.equal(await checkSep1('example.test', G), false)
  destination = 'http://example.test/proof'
  assert.equal(await checkMeta('example.test', 'token'), false)
  destination = 'https://www.example.test/proof'
  assert.equal(await checkMeta('example.test', 'token'), true)
  assert.equal(await checkSep1('example.test', G), true)
})
