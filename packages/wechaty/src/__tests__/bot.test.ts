import { afterEach, beforeEach, describe, expect, test, mock } from 'bun:test'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { WechatyInterface } from '../wechaty-shim.js'

const mockStartFn = mock(async () => {})
const mockStopFn = mock(async () => {})
const mockOnFn = mock(
  (_event: string, _handler: (...args: unknown[]) => void) => mockBotInstance,
)

const mockBotInstance = {
  start: mockStartFn,
  stop: mockStopFn,
  on: mockOnFn,
  name: 'test-bot',
} as unknown as WechatyInterface

const mockBuildFn = mock((_opts?: Record<string, unknown>) => mockBotInstance)

const MockWechatyBuilder = {
  build: mockBuildFn,
}

// Mock qrcode
mock.module('qrcode', () => ({
  toString: async () => 'mock-qr-output',
}))

const originalStderrWrite = process.stderr.write
let stderrOutput = ''
let tempDir = ''
let mockWechatyModulePath = ''

beforeEach(() => {
  mockBuildFn.mockClear()
  mockStartFn.mockClear()
  mockStopFn.mockClear()
  mockOnFn.mockClear()
  stderrOutput = ''
  tempDir = mkdtempSync(join(tmpdir(), 'wechaty-bot-test-'))
  mockWechatyModulePath = join(tempDir, 'mock-wechaty.mjs')
  ;(
    globalThis as unknown as { __mockWechatyBuilder: unknown }
  ).__mockWechatyBuilder = MockWechatyBuilder
  writeFileSync(
    mockWechatyModulePath,
    'export const WechatyBuilder = globalThis.__mockWechatyBuilder;\n',
    'utf-8',
  )
  process.stderr.write = ((chunk: string | Uint8Array) => {
    stderrOutput +=
      typeof chunk === 'string' ? chunk : new TextDecoder().decode(chunk)
    return true
  }) as typeof process.stderr.write
})

afterEach(() => {
  process.stderr.write = originalStderrWrite
  delete (globalThis as unknown as { __mockWechatyBuilder?: unknown })
    .__mockWechatyBuilder
  rmSync(tempDir, { recursive: true, force: true })
})

import { createBot, renderQrTerminal, ScanStatusEnum } from '../bot.js'

describe('ScanStatusEnum', () => {
  test('defines all scan statuses', () => {
    expect(ScanStatusEnum.Unknown).toBe(0)
    expect(ScanStatusEnum.Cancel).toBe(1)
    expect(ScanStatusEnum.Waiting).toBe(2)
    expect(ScanStatusEnum.Scanned).toBe(3)
  })
})

describe('createBot', () => {
  test('calls WechatyBuilder.build with correct puppet service options', async () => {
    await createBot({
      puppetToken: 'test-token',
      puppetEndpoint: 'https://puppet.example.com',
      name: 'my-bot',
      wechatyModulePath: mockWechatyModulePath,
    })

    expect(mockBuildFn).toHaveBeenCalledTimes(1)
    const opts = mockBuildFn.mock.calls[0][0]
    expect(opts?.name).toBe('my-bot')
    expect(opts?.puppet).toBe('wechaty-puppet-service')
    const puppetOpts = opts?.puppetOptions as Record<string, unknown>
    expect(puppetOpts?.token).toBe('test-token')
    expect(puppetOpts?.endpoint).toBe('https://puppet.example.com')
  })

  test('uses default name when not specified', async () => {
    await createBot({
      puppetToken: 'tok',
      wechatyModulePath: mockWechatyModulePath,
    })
    const opts = mockBuildFn.mock.calls[0][0]
    expect(opts?.name).toBe('claude-code-best')
  })

  test('returns bot handle with start/stop methods', async () => {
    const handle = await createBot({
      puppetToken: 'tok',
      wechatyModulePath: mockWechatyModulePath,
    })
    expect(handle.bot).toBe(mockBotInstance)

    await handle.start()
    expect(mockStartFn).toHaveBeenCalled()

    await handle.stop()
    expect(mockStopFn).toHaveBeenCalled()
  })

  test('omits puppetEndpoint when not provided', async () => {
    await createBot({
      puppetToken: 'tok',
      wechatyModulePath: mockWechatyModulePath,
    })
    const opts = mockBuildFn.mock.calls[0][0]
    const puppetOpts = opts?.puppetOptions as Record<string, unknown>
    expect(puppetOpts?.endpoint).toBeUndefined()
  })

  test('includes memoryCard when path provided', async () => {
    await createBot({
      puppetToken: 'tok',
      memoryCardPath: '/tmp/memory.json',
      wechatyModulePath: mockWechatyModulePath,
    })
    const opts = mockBuildFn.mock.calls[0][0]
    expect(opts?.memoryCard).toEqual({
      storageOptions: { path: '/tmp/memory.json' },
    })
  })

  test('omits memoryCard when path not provided', async () => {
    await createBot({
      puppetToken: 'tok',
      wechatyModulePath: mockWechatyModulePath,
    })
    const opts = mockBuildFn.mock.calls[0][0]
    expect(opts?.memoryCard).toBeUndefined()
  })
})

describe('renderQrTerminal', () => {
  test('writes QR code output to stderr', async () => {
    await renderQrTerminal('test-qr-data')
    expect(stderrOutput).toContain('mock-qr-output')
  })
})
