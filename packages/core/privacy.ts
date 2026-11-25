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
