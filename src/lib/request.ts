export class HttpFailure extends Error {
  readonly status: number
  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}

export async function requestJson<T>(
  url: string,
  signal: AbortSignal,
  timeoutMs = 10000,
): Promise<{ data: T; status: number }> {
  const deadline = new AbortController()
  const timer = setTimeout(() => deadline.abort(), timeoutMs)
  try {
    const response = await fetch(url, {
      signal: AbortSignal.any([signal, deadline.signal]),
      credentials: 'same-origin',
      cache: 'no-store',
    })
    if (!response.ok)
      throw new HttpFailure(
        ((await response.json().catch(() => ({}))) as { error?: string }).error ??
          `HTTP ${response.status}`,
        response.status,
      )
    return { data: (await response.json()) as T, status: response.status }
  } catch (error) {
    if (deadline.signal.aborted && !signal.aborted)
      throw new Error('Request timed out. Please try again.')
    throw error
  } finally {
    clearTimeout(timer)
  }
}
