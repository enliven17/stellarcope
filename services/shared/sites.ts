import type { Sql } from './db.ts'

export type Site = { tenantId: string; domains: string[] }
export type SiteRegistry = { lookup(siteId: string): Promise<Site | null> }

/** site id to verified domains, cached briefly so the hot path rarely hits the database */
export function dbSites(sql: Sql, ttlMs = 60_000): SiteRegistry {
  const cache = new Map<string, { at: number; site: Site | null }>()
  return {
    async lookup(siteId) {
      const hit = cache.get(siteId)
      if (ttlMs > 0 && hit && Date.now() - hit.at < ttlMs) return hit.site
      const { rows } = await sql.query<{ tenant_id: string; domain: string | null }>(
        `select s.tenant_id, d.domain from sites s
           join tenants t on t.id = s.tenant_id and t.status = 'active'
           left join domains d on d.tenant_id = s.tenant_id and d.verified_at is not null
          where s.id = $1`,
        [siteId],
      )
      const domains = rows.map((r) => r.domain).filter((d): d is string => !!d)
      const site = rows.length && domains.length ? { tenantId: rows[0].tenant_id, domains } : null
      if (ttlMs > 0) cache.set(siteId, { at: Date.now(), site })
      return site
    },
  }
}

export const staticSites = (map: Record<string, Site>): SiteRegistry => ({ lookup: async (id) => map[id] ?? null })
