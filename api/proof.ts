import { db, measured } from '../services/api/http.ts'
import { tenantReport } from '../services/api/pilot.ts'

export default measured(async (req, res) => tenantReport(await db(), req, res, 'proof'))
