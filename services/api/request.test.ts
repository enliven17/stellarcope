import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { HttpFailure, requestJson } from '../../src/lib/request.ts'

test('report requests time out stalled responses and preserve HTTP denial status', async () => {
  const server = createServer((req, res) => {
    if (req.url === '/denied') {
      res.writeHead(403, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ error: 'Access denied' }))
    }
    if (req.url === '/ok') {
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ count: 2 }))
    }
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  try {
    await assert.rejects(
      requestJson(`${base}/stall`, new AbortController().signal, 20),
      /timed out/,
    )
    await assert.rejects(
      requestJson(`${base}/denied`, new AbortController().signal),
      (error) => error instanceof HttpFailure && error.status === 403,
    )
    assert.deepEqual(await requestJson(`${base}/ok`, new AbortController().signal), {
      data: { count: 2 },
      status: 200,
    })
  } finally {
    server.closeAllConnections()
    await new Promise<void>((resolve) => server.close(() => resolve()))
  }
})
