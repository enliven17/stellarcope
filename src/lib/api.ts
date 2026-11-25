import { useEffect, useState } from 'react'
import { HttpFailure, requestJson } from './request'

// Types mirror services/api/*. Every screen reads these live endpoints; there is no mock data.
export type Point = { date: string; value: number }
export type Share = { label: string; value: number; share: number }
export type Checks = { sep1: boolean; dns: boolean; meta: boolean; origin: boolean; sealed: boolean }

export type Stats = {
  sites: string[]
  collection: { lastEventAt: string | null }
  tenant: { id: string; name: string; category: string | null; scf_round: number | null }
  days: number
  web: {
    visitors: Point[]; pageviewSeries: Point[]; total: number; pageviews: number; delta: number | null
    bounce: number | null; session: number; pages: Share[]; referrers: Share[]; countries: Share[]
    devices: Share[]; browsers: Share[]; events: Share[]; heatmap: number[][]
  }
  api: {
    requests: Point[]; latency: Point[]; total: number; errorRate: number | null; p50: number | null; p95: number | null
    status: Share[]; routes: (Share & { errors: number; p50: number | null; p95: number | null })[]
  }
  wallets: { funnel: { label: string; value: number }[]; share: Share[] }
  trust: { score: number; formula: string; checks: Checks; domains: { domain: string; method: string | null; verified: boolean }[]; filtered: number; drops: Share[] }
}

export type Live = { active: number; events: { ts: string; type: string; name: string | null; path: string; country: string | null; device: string; browser: string }[] }

export type Project = {
  id: string; name: string; category: string | null; scf_round: number | null
  visitors: number; pageviews: number; visitorSeries: Point[]; requests: number; p95: number | null; errorRate: number | null
  trust: number; checks: Checks; filtered: number
}

export type Proof = {
  day: string; summary: string; leaf: string; path: { hash: string; side: 'left' | 'right' }[]
  root: string; stored_root: string; tx_hash: string | null; account: string | null; horizon: string; data_key: string
}

export type Seal = { day: string; root: string; tx_hash: string | null; leaves: number; leaf: string }

/** fetches JSON, optionally polling; keeps the last good value while refreshing */
export function useApi<T>(url: string | null, refreshMs = 0) {
  const [state, setState] = useState<{ url: string | null; data: T | null; error: string | null; loading: boolean; status: number | null; updatedAt: number | null }>({ url, data: null, error: null, loading: true, status: null, updatedAt: null })

  useEffect(() => {
    if (!url) return
    let alive = true
    let timer = 0
    const controller = new AbortController()
    setState((previous) => ({ url, data: previous.url === url ? previous.data : null, error: null, loading: true, status: null, updatedAt: previous.url === url ? previous.updatedAt : null }))
    const load = async () => {
      let status: number | null = null
      try {
        const result = await requestJson<T>(url, controller.signal)
        status = result.status
        if (alive) setState({ url, data: result.data, error: null, loading: false, status, updatedAt: Date.now() })
      } catch (err) {
        if (err instanceof HttpFailure) status = err.status
        if (alive && [401,403,404].includes(status ?? 0) && /^\/api\/(stats|live|seals|proof)(?:\?|$)/.test(url)) window.dispatchEvent(new Event('stellarcope:pilot-access-denied'))
        if (alive) setState((previous) => ({ url, data: [401,403,404].includes(status ?? 0) ? null : previous.url === url ? previous.data : null, error: (err as Error).message, loading: false, status, updatedAt: previous.url === url ? previous.updatedAt : null }))
      } finally {
        if (alive && refreshMs) timer = window.setTimeout(load, refreshMs)
      }
    }
    void load()
    return () => { alive = false; controller.abort(); clearTimeout(timer) }
  }, [url, refreshMs])

  return state.url === url ? state : { data: null, error: null, loading: true, status: null, updatedAt: null }
}
