import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync, readdirSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { TRACKER } from './release.ts'
import { trackerSnippet } from '../../services/pilot/onboarding.ts'

const builds = new URL('./dist/', import.meta.url)
const bytes = () => readFileSync(new URL(`${TRACKER.version}/a.js`, builds), 'utf8')

test('published tracker integrity matches the immutable script bytes for every version', () => {
  for (const version of readdirSync(builds)) {
    const code = readFileSync(new URL(`${version}/a.js`, builds))
    assert.equal(
      readFileSync(new URL(`${version}/integrity.txt`, builds), 'utf8').trim(),
      `sha384-${createHash('sha384').update(code).digest('base64')}`,
      version,
    )
  }
})

test('the application snippet references an artifact with a matching integrity hash', () => {
  const html = readFileSync(new URL('../../index.html', import.meta.url), 'utf8')
  const tag = html.match(/<script[^>]+data-site="alb_main"[^>]*>/)?.[0]
  assert.ok(tag)
  const path = tag.match(/src="\/t\/([^"]+)"/)?.[1]
  assert.ok(path)
  const content = readFileSync(new URL(path, builds))
  assert.equal(
    tag.match(/integrity="([^"]+)"/)?.[1],
    `sha384-${createHash('sha384').update(content).digest('base64')}`,
  )
})

function browser(networkFails = false) {
  const requests: {
    url: string
    options: { body: string; credentials: string; referrerPolicy?: string }
  }[] = []
  const listeners = new Map<string, (() => void)[]>()
  const location = {
    href: 'https://project.example/start?private=hidden',
    pathname: '/start',
    hostname: 'project.example',
  }
  const history = { pushState: () => 'original-result', replaceState: () => 'replace-result' }
  const context = {
    document: {
      readyState: 'interactive',
      referrer: 'https://source.example/post?secret=hidden',
      currentScript: {
        src: `https://stellarcope.xyz${TRACKER.path}`,
        dataset: { site: 'project_web' } as Record<string, string>,
      },
    },
    location,
    history,
    navigator: { language: 'en', webdriver: false } as {
      language: string
      webdriver: boolean
      doNotTrack?: string
      globalPrivacyControl?: boolean
    },
    screen: { width: 1440, height: 900 },
    URL,
    Blob,
    queueMicrotask,
    addEventListener: (name: string, callback: () => void) =>
      listeners.set(name, [...(listeners.get(name) ?? []), callback]),
    fetch: (
      url: string,
      options: { body: string; credentials: string; referrerPolicy?: string },
    ) => {
      requests.push({ url, options })
      if (networkFails) throw new Error('offline')
      return Promise.reject(new Error('offline'))
    },
    window: {} as { stellarcope?: { track(name: string, props?: Record<string, unknown>): void } },
  }
  return { context, requests, listeners, location, history }
}

test('snippet collects initial and History API pageviews without device storage or credentials', async () => {
  const b = browser()
  runInNewContext(bytes(), b.context)
  b.listeners.get('DOMContentLoaded')?.forEach((fn) => fn())
  assert.equal(b.requests.length, 1)
  assert.equal(b.requests[0].url, 'https://stellarcope.xyz/e')
  assert.equal(b.requests[0].options.credentials, 'omit')
  const p = JSON.parse(b.requests[0].options.body)
  assert.equal(p.site, 'project_web')
  assert.equal(p.path, '/start')
  assert.equal(p.referrer, 'https://source.example')
  b.location.href = 'https://project.example/docs'
  b.location.pathname = '/docs'
  assert.equal(b.history.pushState(), 'original-result')
  await new Promise<void>((resolve) => setImmediate(resolve))
  assert.equal(b.requests.length, 2)
  assert.equal(JSON.parse(b.requests[1].options.body).path, '/docs')
  b.listeners.get('popstate')?.forEach((fn) => fn())
  assert.equal(b.requests.length, 2, 'same path is counted once')
})

test('a failed analytics request never throws into the host page or navigation', async () => {
  const b = browser(true)
  assert.doesNotThrow(() => runInNewContext(bytes(), b.context))
  assert.doesNotThrow(() => b.listeners.get('DOMContentLoaded')?.forEach((fn) => fn()))
  b.location.pathname = '/other'
  b.location.href = 'https://project.example/other'
  assert.equal(b.history.replaceState(), 'replace-result')
  await new Promise<void>((resolve) => setImmediate(resolve))
})

test('generated install tags load asynchronously and omit referrer headers', () => {
  const snippet = trackerSnippet('project_web', 'https://stellarcope.xyz')
  assert.match(snippet, /<script async\s/)
  assert.match(snippet, /referrerpolicy="no-referrer"/)
  assert.doesNotMatch(snippet, /\bdefer\b/)
})

test('paths, campaigns and custom properties are sanitized before fetch', () => {
  const b = browser()
  b.location.pathname = '/people/alice%40example.test/123'
  b.location.href = `https://project.example${b.location.pathname}?utm_source=newsletter&utm_campaign=alice%40example.test&secret=hidden`
  runInNewContext(bytes(), b.context)
  const first = JSON.parse(b.requests[0].options.body)
  assert.equal(first.path, '/people/:redacted/:id')
  assert.deepEqual(first.utm, { source: 'newsletter' })
  assert.equal(b.requests[0].options.referrerPolicy, 'no-referrer')
  b.context.window.stellarcope!.track('signup', {
    email: 'alice@example.test',
    encodedEmail: 'alice%40example.test',
    wallet: `G${'A'.repeat(55)}`,
    plan: 'basic',
  })
  const event = JSON.parse(b.requests[1].options.body)
  assert.equal(event.props.email, '[masked]')
  assert.equal(event.props.encodedEmail, '[masked]')
  assert.equal(event.props.wallet, '[masked]')
  assert.equal(event.props.plan, 'basic')
  for (const { options } of b.requests) assert.doesNotMatch(options.body, /alice|hidden|GAAAA/)
  b.context.window.stellarcope!.track('alice@example.test')
  assert.equal(b.requests.length, 2, 'personal-looking event names never leave the browser')
})

test('ambiguous encoded paths never leave the browser', () => {
  for (const path of ['/account/alice%2540example.test', '/account%2fsecret', '/bad%escape']) {
    const b = browser()
    b.location.pathname = path
    b.location.href = `https://project.example${path}`
    runInNewContext(bytes(), b.context)
    b.context.window.stellarcope!.track('action')
    assert.equal(b.requests.length, 0, path)
  }
})

test('excluded route prefixes block pageviews and custom events, then allow public reentry', async () => {
  const b = browser()
  b.context.document.currentScript.dataset.excludePaths = '/private, /checkout'
  runInNewContext(bytes(), b.context)
  b.location.pathname = '/%70rivate/settings'
  b.location.href = `https://project.example${b.location.pathname}`
  b.history.pushState()
  await new Promise<void>((resolve) => setImmediate(resolve))
  b.context.window.stellarcope!.track('purchase')
  assert.equal(b.requests.length, 1)
  b.location.pathname = '/start'
  b.location.href = 'https://project.example/start'
  b.history.pushState()
  await new Promise<void>((resolve) => setImmediate(resolve))
  assert.equal(b.requests.length, 2, 'returning from an excluded page is a fresh public visit')
  b.location.pathname = '/privateer'
  b.location.href = 'https://project.example/privateer'
  b.history.pushState()
  await new Promise<void>((resolve) => setImmediate(resolve))
  assert.equal(b.requests.length, 3, 'prefix matching respects path-segment boundaries')
})

test('invalid exclusions fail closed without interrupting the host page', () => {
  const b = browser()
  b.context.document.currentScript.dataset.excludePaths = 'private'
  assert.doesNotThrow(() => runInNewContext(bytes(), b.context))
  assert.equal(b.requests.length, 0)
})

test('navigation works without queueMicrotask and when a scheduler throws', async () => {
  for (const missing of [true, false]) {
    const b = browser()
    if (missing) Reflect.deleteProperty(b.context, 'queueMicrotask')
    else
      b.context.queueMicrotask = () => {
        throw new Error('scheduler unavailable')
      }
    runInNewContext(bytes(), b.context)
    b.location.pathname = '/next'
    b.location.href = 'https://project.example/next'
    assert.equal(b.history.pushState(), 'original-result')
    await new Promise<void>((resolve) => setImmediate(resolve))
    assert.equal(b.requests.length, 2)
  }
})

test('duplicate snippets preserve the first tracker and install only one navigation hook', async () => {
  const b = browser()
  runInNewContext(bytes(), b.context)
  const api = b.context.window.stellarcope
  const push = b.history.pushState
  runInNewContext(bytes(), b.context)
  assert.equal(b.requests.length, 1)
  assert.equal(b.history.pushState, push)
  assert.equal(b.context.window.stellarcope, api)
  b.location.pathname = '/next'
  b.location.href = 'https://project.example/next'
  b.history.pushState()
  await new Promise<void>((resolve) => setImmediate(resolve))
  assert.equal(b.requests.length, 2)
  b.context.window.stellarcope!.track('clicked')
  assert.equal(b.requests.length, 3)
})

test('privacy preferences apply to both pageviews and custom events', () => {
  for (const preference of ['doNotTrack', 'globalPrivacyControl'] as const) {
    const b = browser()
    if (preference === 'doNotTrack') b.context.navigator.doNotTrack = '1'
    else b.context.navigator.globalPrivacyControl = true
    runInNewContext(bytes(), b.context)
    b.context.window.stellarcope!.track('clicked')
    assert.equal(b.requests.length, 0)
  }
})

test('an async snippet arriving before DOM ready still collects only once', () => {
  const b = browser()
  b.context.document.readyState = 'loading'
  runInNewContext(bytes(), b.context)
  runInNewContext(bytes(), b.context)
  assert.equal(b.requests.length, 0)
  b.listeners.get('DOMContentLoaded')?.forEach((fn) => fn())
  assert.equal(b.requests.length, 1)
})

test('analytics preserves native History API failures and tolerates locked methods', () => {
  const failing = browser()
  const nativeError = new Error('native routing failure')
  failing.history.pushState = () => {
    throw nativeError
  }
  runInNewContext(bytes(), failing.context)
  assert.throws(
    () => failing.history.pushState(),
    (error) => error === nativeError,
  )
  const locked = browser()
  const original = locked.history.pushState
  Object.defineProperty(locked.history, 'pushState', { writable: false })
  assert.doesNotThrow(() => runInNewContext(bytes(), locked.context))
  assert.equal(locked.history.pushState, original)
  assert.equal(locked.requests.length, 1, 'a locked method does not prevent the initial visit')
})

test('custom payload limits are enforced before a request leaves the browser', () => {
  const b = browser()
  runInNewContext(bytes(), b.context)
  b.context.window.stellarcope!.track(
    'bounded',
    Object.fromEntries(Array.from({ length: 30 }, (_, i) => [`field${i}`, 'a'.repeat(300)])),
  )
  const event = JSON.parse(b.requests[1].options.body)
  assert.equal(Object.keys(event.props).length, 20)
  assert.equal(event.props.field0, '[masked]', 'oversized strings are masked before inspection')
  b.context.window.stellarcope!.track(
    'oversized',
    Object.fromEntries(Array.from({ length: 20 }, (_, i) => [`field${i}`, '界'.repeat(200)])),
  )
  assert.equal(b.requests.length, 2, 'the UTF-8 body must fit the collector limit')
})
