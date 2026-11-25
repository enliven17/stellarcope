import { test } from 'node:test'
import assert from 'node:assert/strict'
import { transaction, type Sql } from './db.ts'

test('transaction startup and rollback failures release or discard checked-out connections', async () => {
  for (const failure of ['begin', 'rollback', 'none']) {
    let inUse = 0
    let discarded = 0
    let effects = 0
    const original = new Error('operation failed')
    const pool = {
      totalCount: 1,
      query: async () => {
        throw new Error('transaction escaped the checked-out connection')
      },
      connect: async () => {
        inUse++
        return {
          query: async (statement: string) => {
            if (statement === failure) throw original
            return { rows: [] }
          },
          release: (broken?: boolean) => {
            inUse--
            if (broken) discarded++
          },
        }
      },
    } as unknown as Sql
    const work = async () => {
      effects++
      if (failure === 'rollback') throw original
      return 42
    }
    if (failure === 'none') assert.equal(await transaction(pool, work), 42)
    else await assert.rejects(transaction(pool, work), (error) => error === original)
    assert.equal(inUse, 0, `${failure} must not leak a connection`)
    assert.equal(discarded, failure === 'none' ? 0 : 1)
    assert.equal(effects, failure === 'begin' ? 0 : 1)
  }
})
