import { createServer } from 'node:http'
import { connect } from '../shared/db.ts'
import { pilotHandler } from './server.ts'

const port = Number(process.env.PILOT_PORT ?? 8787)
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid PILOT_PORT')
const sql = await connect()
const handler = pilotHandler(sql, process.env.PILOT_ORIGIN ?? 'http://localhost:5173')
const server = createServer({ requestTimeout: 10000, headersTimeout: 10000 }, (req, res) => {
  void handler(req, res)
})
server.listen(port, '127.0.0.1', () =>
  console.log(`Pilot backend listening on http://127.0.0.1:${port}`),
)
for (const signal of ['SIGINT', 'SIGTERM'])
  process.once(signal, () => {
    const timeout = setTimeout(() => process.exit(1), 10000)
    timeout.unref()
    server.close(() => {
      void (sql as unknown as { end(): Promise<void> }).end().then(() => process.exit(0))
    })
  })
