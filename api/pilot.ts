import { db, measured } from '../services/api/http.ts'
import { pilotSession } from '../services/api/pilot.ts'

export default measured(async (req, res) => pilotSession(await db(), process.env.PILOT_ORIGIN ?? 'https://stellarcope.xyz')(req, res))
