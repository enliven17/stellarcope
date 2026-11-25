import { test } from 'node:test'
import assert from 'node:assert/strict'
import { PGlite } from '@electric-sql/pglite'
import { migrate, type Sql } from '../shared/db.ts'
import { codeTenant } from '../api/access.ts'
import { dbSites } from '../shared/sites.ts'
import {
  enrollPilot,
  verifyPilot,
  rotatePilotAccess,
  revokePilotAccess,
  suspendPilot,
} from './onboarding.ts'

test('assisted onboarding is private, verified before collection and credentials are hashed and revocable', async () => {
  const db = new PGlite()
  const sql = db as unknown as Sql
  await migrate(sql)
  try {
    const enrolled = await enrollPilot(sql, {
      id: 'example',
      name: 'Example project',
      domain: 'example.test',
      origin: 'https://stellarcope.xyz',
    })
    assert.equal(
      (
        await sql.query<{ public_card: boolean }>(
          "select public_card from tenants where id='example'",
        )
      ).rows[0].public_card,
      false,
    )
    assert.equal((await codeTenant(sql, enrolled.accessCode))?.id, 'example')
    const keys = JSON.stringify((await sql.query('select * from api_keys')).rows)
    assert.ok(!keys.includes(enrolled.accessCode))
    assert.match(enrolled.snippet, /integrity="sha384-/)
    assert.ok(enrolled.snippet.includes(`data-site="${enrolled.siteId}"`))
    const sites = dbSites(sql, 0)
    assert.equal(await sites.lookup(enrolled.siteId), null)
    assert.equal(
      await verifyPilot(sql, 'example', 'meta', async (domain, token) => {
        assert.equal(domain, 'example.test')
        assert.equal(token, enrolled.verificationToken)
        return false
      }),
      false,
    )
    assert.equal(await sites.lookup(enrolled.siteId), null)
    assert.equal(await verifyPilot(sql, 'example', 'meta', async () => true), true)
    assert.deepEqual(await sites.lookup(enrolled.siteId), {
      tenantId: 'example',
      domains: ['example.test'],
    })
    const next = await rotatePilotAccess(sql, 'example')
    assert.equal(await codeTenant(sql, enrolled.accessCode), null)
    assert.equal((await codeTenant(sql, next))?.id, 'example')
    await revokePilotAccess(sql, 'example')
    assert.equal(await codeTenant(sql, next), null)
    const final = await rotatePilotAccess(sql, 'example')
    await suspendPilot(sql, 'example')
    assert.equal(await codeTenant(sql, final), null)
    assert.equal(await sites.lookup(enrolled.siteId), null)
    await assert.rejects(rotatePilotAccess(sql, 'example'))
    const audit = JSON.stringify((await sql.query('select * from audit_log')).rows)
    assert.ok(!audit.includes(enrolled.accessCode) && !audit.includes(enrolled.verificationToken))
  } finally {
    await db.close()
  }
})

test('invalid or duplicate enrollments do not overwrite projects or create partial records', async () => {
  const db = new PGlite()
  const sql = db as unknown as Sql
  await migrate(sql)
  try {
    await assert.rejects(
      enrollPilot(sql, {
        id: 'bad id',
        name: 'Bad',
        domain: 'example.test',
        origin: 'https://stellarcope.xyz',
      }),
    )
    assert.equal((await sql.query('select * from tenants')).rows.length, 0)
    await enrollPilot(sql, {
      id: 'example',
      name: 'Original',
      domain: 'example.test',
      origin: 'https://stellarcope.xyz',
    })
    await assert.rejects(
      enrollPilot(sql, {
        id: 'example',
        name: 'Overwrite',
        domain: 'other.test',
        origin: 'https://stellarcope.xyz',
      }),
    )
    assert.equal(
      (await sql.query<{ name: string }>("select name from tenants where id='example'")).rows[0]
        .name,
      'Original',
    )
    assert.equal((await sql.query('select * from sites')).rows.length, 1)
    assert.equal((await sql.query('select * from domains')).rows.length, 1)
    assert.equal((await sql.query('select * from api_keys')).rows.length, 1)
    await assert.rejects(revokePilotAccess(sql, 'missing'))
    await assert.rejects(suspendPilot(sql, 'missing'))
    await sql.query("insert into tenants(id,name,public_card) values ('public','Public',true)")
    await assert.rejects(rotatePilotAccess(sql, 'public'))
    await assert.rejects(verifyPilot(sql, 'public', 'meta', async () => true))
  } finally {
    await db.close()
  }
})
