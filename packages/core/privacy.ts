import { normalizePath } from './normalize.ts'

export const PERSONAL = [
  /scp_[A-Za-z0-9_-]{43}/,
  /[^\s@]+@[^\s@]+\.[^\s@]+/,
  /\b[GMCS][A-Z2-7]{55,68}\b/,
  /\+?\d[\d\s().-]{8,}\d/,
]

/** Public-page reporting only: no queries, fragments or identifier-shaped segments. */
export function webPath(raw: string): string | null {
  if (!raw.startsWith('/') || raw.startsWith('//')) return null
  let path = raw.split(/[?#]/, 1)[0]
  try {
    if (/%(?:2f|5c|3f|23|25)/i.test(path)) return null
    const decoded = decodeURIComponent(path)
    if (/[\s\x00-\x1f\x7f-\x9f\\]/.test(decoded)) return null
    path = decoded
      .split('/')
      .map((value) => {
        return PERSONAL.some((pattern) => pattern.test(value)) &&
          !/^[GMCS][A-Z2-7]{55,68}$/.test(value)
          ? ':redacted'
          : value
      })
      .join('/')
  } catch {
    return null
  }
  return normalizePath(path).route.slice(0, 256)
}

export function campaign(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /^[A-Za-z][A-Za-z0-9_-]{0,63}$/.test(value) &&
    !PERSONAL.some((pattern) => pattern.test(value))
  )
}

export const eventName = (value: unknown): value is string =>
  typeof value === 'string' &&
  /^[A-Za-z][A-Za-z0-9_.:-]{0,63}$/.test(value) &&
  !PERSONAL.some((pattern) => pattern.test(value))

function personalValue(value: string): boolean {
  // Bounded decoding catches common encoded copies without unbounded work on
  // caller-provided metadata. Malformed/deep encodings are masked conservatively.
  for (let depth = 0; depth < 4; depth++) {
    if (PERSONAL.some((pattern) => pattern.test(value))) return true
    if (!/%[0-9a-f]{2}/i.test(value)) return false
    try {
      const decoded = decodeURIComponent(value.replace(/%(?![0-9a-f]{2})/gi, '%25'))
      if (decoded === value) return false
      value = decoded
    } catch {
      return true
    }
  }
  return true
}

/** Shared browser/collector policy: bound flat properties before serialization. */
export function scrubProps(props: unknown): Record<string, string | number | boolean> | undefined {
  if (!props || typeof props !== 'object' || Array.isArray(props)) return undefined
  const out: Record<string, string | number | boolean> = {}
  let seen = 0
  for (const k in props) {
    if (!Object.prototype.hasOwnProperty.call(props, k)) continue
    if (seen++ >= 20) break
    if (!/^[A-Za-z][A-Za-z0-9_.:-]{0,39}$/.test(k)) continue
    const v = (props as Record<string, unknown>)[k]
    if (typeof v === 'number' && Number.isFinite(v))
      out[k] = PERSONAL.some((pattern) => pattern.test(String(v))) ? '[masked]' : v
    else if (typeof v === 'boolean') out[k] = v
    else if (typeof v === 'string') out[k] = v.length > 200 || personalValue(v) ? '[masked]' : v
  }
  return Object.keys(out).length ? out : undefined
}
