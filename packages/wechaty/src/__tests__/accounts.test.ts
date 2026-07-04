import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

let testDir: string

beforeEach(() => {
  testDir = mkdtempSync(join(tmpdir(), 'wechaty-test-accounts-'))
  process.env.WECHATY_STATE_DIR = testDir
})

afterEach(() => {
  rmSync(testDir, { recursive: true, force: true })
})

import { clearAccount, loadAccount, saveAccount } from '../accounts.js'

describe('wechaty account storage', () => {
  test('loadAccount returns null when no account file exists', () => {
    expect(loadAccount()).toBeNull()
  })

  test('saveAccount and loadAccount round-trip', () => {
    const data = {
      puppetToken: 'test-puppet-token',
      puppetEndpoint: 'https://puppet.example.com',
      contactId: 'wxid_abc123',
      contactName: 'TestUser',
      savedAt: '2026-01-01T00:00:00.000Z',
    }
    saveAccount(data)
    expect(loadAccount()).toEqual(data)
  })

  test('saveAccount overwrites previous data', () => {
    saveAccount({
      puppetToken: 'token-1',
      savedAt: '2026-01-01T00:00:00.000Z',
    })
    saveAccount({
      puppetToken: 'token-2',
      contactId: 'wxid_xyz',
      savedAt: '2026-07-01T00:00:00.000Z',
    })
    const loaded = loadAccount()
    expect(loaded?.puppetToken).toBe('token-2')
    expect(loaded?.contactId).toBe('wxid_xyz')
  })

  test('clearAccount removes the file', () => {
    saveAccount({
      puppetToken: 'test',
      savedAt: new Date().toISOString(),
    })
    expect(loadAccount()).not.toBeNull()
    clearAccount()
    expect(loadAccount()).toBeNull()
  })

  test('clearAccount is safe when file does not exist', () => {
    expect(() => clearAccount()).not.toThrow()
    expect(loadAccount()).toBeNull()
  })

  test('loadAccount returns null for corrupted JSON', () => {
    writeFileSync(join(testDir, 'account.json'), 'not valid json{{{', 'utf-8')
    expect(loadAccount()).toBeNull()
  })

  test('saveAccount preserves all fields', () => {
    const full = {
      puppetToken: 'full-token',
      puppetEndpoint: 'https://full.example.com',
      contactId: 'wxid_full',
      contactName: 'Full Name',
      savedAt: '2026-07-04T12:00:00.000Z',
    }
    saveAccount(full)
    expect(loadAccount()).toEqual(full)
  })
})
