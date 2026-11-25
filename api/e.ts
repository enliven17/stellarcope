import { databaseCollector } from '../services/collector/database.ts'
import { db, measured } from '../services/api/http.ts'

let instance: ReturnType<typeof databaseCollector> | null = null

export default measured(async (req, res) => {
  instance ??= databaseCollector(await db())
  await instance.handle(req, res)
})
