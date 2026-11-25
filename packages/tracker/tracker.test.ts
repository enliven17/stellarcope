import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync, readdirSync } from 'node:fs'
import { runInNewContext } from 'node:vm'

const builds = new URL('./dist/', import.meta.url)
const bytes = () => readFileSync(new URL('1.0.1/a.js', builds), 'utf8')

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
  assert.equal(tag.match(/integrity="([^"]+)"/)?.[1], `sha384-${createHash('sha384').update(content).digest('base64')}`)
})

function browser(networkFails = false) {
  const requests: { url: string; options: { body: string; credentials: string } }[] = []
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
        src: 'https://stellarcope.xyz/t/1.0.1/a.js',
        dataset: { site: 'project_web' },
      },
    },
    location,
    history,
    navigator: { language: 'en', webdriver: false },
    screen: { width: 1440, height: 900 },
    URL,
    Blob,
    queueMicrotask,
    addEventListener: (name: string, callback: () => void) =>
      listeners.set(name, [...(listeners.get(name) ?? []), callback]),
    fetch: (url: string, options: { body: string; credentials: string }) => {
      requests.push({ url, options })
      if (networkFails) throw new Error('offline')
      return Promise.reject(new Error('offline'))
    },
    window: {},
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
