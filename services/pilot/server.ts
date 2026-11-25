import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Sql } from '../shared/db.ts'
import { databaseCollector } from '../collector/database.ts'
import { pilotSession, tenantReport } from '../api/pilot.ts'
import { json } from '../api/http.ts'

/** Local pilot backend; shares the same handlers as the deployed functions. */
export function pilotHandler(sql: Sql, origin: string) {
  const collection = databaseCollector(sql)
  const session = pilotSession(sql, origin)
  return async (req: IncomingMessage, res: ServerResponse) => {
    try {
      const path = new URL(req.url ?? '/', 'http://pilot').pathname
      if (path === '/e' || path.startsWith('/t/')) return await collection.handle(req, res)
      if (path === '/api/pilot') return await session(req, res)
      const resource = path.slice('/api/'.length)
      if (path.startsWith('/api/') && ['stats', 'live', 'seals', 'proof'].includes(resource))
        return await tenantReport(sql, req, res, resource as 'stats' | 'live' | 'seals' | 'proof')
      if (path === '/api/health') return json(res, 200, { ok: true })
      json(res, 404, { error: 'not found' })
    } catch {
      if (!res.headersSent) json(res, 503, { error: 'Service temporarily unavailable' })
      else res.end()
    }
  }
}
