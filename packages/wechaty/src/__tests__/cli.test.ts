import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

let testDir: string

// Capture stderr/stdout
let stderrOutput = ''
let stdoutOutput = ''

const originalStderrWrite = process.stderr.write
const originalStdoutWrite = process.stdout.write
const originalExit = process.exit

beforeEach(() => {
  testDir = mkdtempSync(join(tmpdir(), 'wechaty-test-cli-'))

  // Override state directory for testing
  process.env.WECHATY_STATE_DIR = testDir

  stderrOutput = ''
  stdoutOutput = ''
  process.stderr.write = ((chunk: string | Uint8Array) => {
    stderrOutput +=
      typeof chunk === 'string' ? chunk : new TextDecoder().decode(chunk)
    return true
  }) as typeof process.stderr.write
  process.stdout.write = ((chunk: string | Uint8Array) => {
    stdoutOutput +=
      typeof chunk === 'string' ? chunk : new TextDecoder().decode(chunk)
    return true
  }) as typeof process.stdout.write
  process.exit = (() => {
    throw new Error('process.exit called')
  }) as typeof process.exit
})

afterEach(() => {
  rmSync(testDir, { recursive: true, force: true })
  delete process.env.WECHATY_STATE_DIR
  delete process.env.WECHATY_PUPPET_SERVICE_TOKEN
  delete process.env.WECHATY_PUPPET_SERVICE_ENDPOINT
  delete process.env.WECHATY_PUPPET_SERVICE_AUTHORITY
  delete process.env.WECHATY_PUPPET_SERVICE_NO_TLS_INSECURE_CLIENT
  process.stderr.write = originalStderrWrite
  process.stdout.write = originalStdoutWrite
  process.exit = originalExit
})

import { handleWechatyCli } from '../cli.js'
import { loadAccount } from '../accounts.js'

describe('handleWechatyCli', () => {
  test('shows usage for unknown subcommand', async () => {
    await handleWechatyCli(['unknown'])
    expect(stdoutOutput).toContain('Usage:')
    expect(stdoutOutput).toContain('ccb wechaty serve')
    expect(stdoutOutput).toContain('ccb wechaty login')
  })

  test('shows usage for empty args', async () => {
    await handleWechatyCli([])
    expect(stdoutOutput).toContain('Usage:')
  })

  test('login without token prints error and exits', async () => {
    try {
      await handleWechatyCli(['login'])
    } catch {
      // expected process.exit throw
    }
    expect(stderrOutput).toContain('puppet-service-token')
  })

  test('login with token saves account', async () => {
    await handleWechatyCli(['login', 'my-puppet-token'])
    const account = loadAccount()
    expect(account).not.toBeNull()
    expect(account?.puppetToken).toBe('my-puppet-token')
    expect(stdoutOutput).toContain('Token saved')
  })

  test('login with environment variables', async () => {
    process.env.WECHATY_PUPPET_SERVICE_ENDPOINT = 'http://localhost:8788'
    process.env.WECHATY_PUPPET_SERVICE_AUTHORITY = 'my-authority'
    process.env.WECHATY_PUPPET_SERVICE_NO_TLS_INSECURE_CLIENT = 'true'

    await handleWechatyCli(['login', 'my-token'])
    const account = loadAccount()
    expect(account?.puppetToken).toBe('my-token')
    expect(account?.puppetEndpoint).toBe('http://localhost:8788')
    expect(account?.puppetAuthority).toBe('my-authority')
    expect(account?.puppetNoTls).toBe(true)
  })

  test('login clear removes account', async () => {
    await handleWechatyCli(['login', 'my-token'])
    expect(loadAccount()).not.toBeNull()

    await handleWechatyCli(['login', 'clear'])
    expect(loadAccount()).toBeNull()
    expect(stdoutOutput).toContain('cleared')
  })

  test('login with same token shows "already connected"', async () => {
    await handleWechatyCli(['login', 'same-token'])
    stdoutOutput = ''

    await handleWechatyCli(['login', 'same-token'])
    expect(stdoutOutput).toContain('Already connected')
  })

  test('serve without serverDeps exits with error', async () => {
    try {
      await handleWechatyCli(['serve'])
    } catch {
      // expected process.exit throw
    }
    expect(stderrOutput).toContain('not available')
  })
})
