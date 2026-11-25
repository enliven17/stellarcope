import type { Sql } from '../shared/db.ts'
import { dbSites } from '../shared/sites.ts'
import { dbSalt } from '../shared/salt.ts'
import { persist } from '../writer/writer.ts'
import { collector } from './server.ts'

/** No shared pending batch: each request awaits its own database transaction. */
export function databaseCollector(sql: Sql) {
  return collector({
    sites: dbSites(sql, 0),
    salt: dbSalt(sql),
    spool: { push: (record) => persist(sql, [record]) },
  })
}
