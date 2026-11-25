import { resolveTxt } from 'node:dns/promises'

// Domain ownership checks. Each returns true only on positive proof; network errors and
// timeouts count as "not verified", never as success.

const TIMEOUT = 5000

async function fetchText(url: string) {
  const original = new URL(url)
  const canonical = (host: string) => host.replace(/^www\./, '')
  let current = original
  for (let redirects = 0; redirects <= 3; redirects++) {
    if (current.protocol !== 'https:' || current.port || current.username || current.password || canonical(current.hostname) !== canonical(original.hostname)) return null
    const res = await fetch(current.href, { redirect: 'manual', signal: AbortSignal.timeout(TIMEOUT), headers: { 'user-agent': 'StellarcopeVerifier/1.0' } })
    if ([301,302,303,307,308].includes(res.status)) {
      const location = res.headers.get('location')
      await res.body?.cancel()
      if (!location) return null
      current = new URL(location, current)
      continue
    }
    if (!res.ok || !res.body) return null
    const reader = res.body.getReader()
    const chunks: Uint8Array[] = []
    let size = 0
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > 200_000) { await reader.cancel(); return null }
      chunks.push(value)
    }
    return Buffer.concat(chunks).toString('utf8')
  }
  return null
}

/** SEP-1: the signing account must be listed in ACCOUNTS of the domain's stellar.toml */
export function tomlAccounts(toml: string) {
  const m = toml.match(/^\s*ACCOUNTS\s*=\s*\[([\s\S]*?)\]/m)
  return m ? [...m[1].matchAll(/"([GM][A-Z2-7]{55,68})"/g)].map((x) => x[1]) : []
}

export async function checkSep1(domain: string, account: string) {
  const toml = await fetchText(`https://${domain}/.well-known/stellar.toml`).catch(() => null)
  return !!toml && tomlAccounts(toml).includes(account)
}

export async function checkDns(domain: string, token: string) {
  try {
    const records = await resolveTxt(`_stellarcope.${domain}`)
    return records.some((chunks) => chunks.join('') === `stellarcope-verify=${token}`)
  } catch {
    return false
  }
}

export function metaToken(html: string) {
  const tag = html.match(/<meta[^>]+name=["']stellarcope-verify["'][^>]*>/i)?.[0]
  return tag?.match(/content=["']([^"']+)["']/i)?.[1] ?? null
}

export async function checkMeta(domain: string, token: string) {
  const html = await fetchText(`https://${domain}/`).catch(() => null)
  return !!html && metaToken(html) === token
}

export const DOMAIN_RE = /^(?=.{1,253}$)(?!-)[a-z0-9-]{1,63}(?<!-)(\.(?!-)[a-z0-9-]{1,63}(?<!-))+$/
