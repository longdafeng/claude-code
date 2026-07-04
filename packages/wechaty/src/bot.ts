import { toString as qrToString } from 'qrcode'
import { pathToFileURL } from 'node:url'
import type { WechatyInterface, ContactSelf, Message } from './wechaty-shim.js'

export type ScanStatus = 0 | 1 | 2 | 3

export const ScanStatusEnum = {
  Unknown: 0,
  Cancel: 1,
  Waiting: 2,
  Scanned: 3,
} as const

export interface BotHandle {
  bot: WechatyInterface
  start(): Promise<void>
  stop(): Promise<void>
}

export interface CreateBotOptions {
  name?: string
  puppetToken: string
  puppetEndpoint?: string
  puppetAuthority?: string
  puppetNoTls?: boolean
  memoryCardPath?: string
  wechatyModulePath?: string
}

type WechatyModule = {
  WechatyBuilder: {
    build(options?: Record<string, unknown>): WechatyInterface
  }
}

const runtimeImport = new Function('specifier', 'return import(specifier)') as (
  specifier: string,
) => Promise<unknown>

async function renderQrTerminal(qrcode: string): Promise<void> {
  try {
    const output = await qrToString(qrcode, {
      type: 'terminal',
      errorCorrectionLevel: 'L',
      small: true,
    })
    process.stderr.write(`${output}\n`)
  } catch {
    process.stderr.write(
      `[wechaty] QR code URL: https://wechaty.js.org/qrcode/${encodeURIComponent(qrcode)}\n`,
    )
  }
}

/**
 * Build a Wechaty bot instance using puppet-service.
 *
 * The puppet-service connects to a remote puppet host (e.g. padlocal,
 * worktool) using the provided token.
 */
export async function createBot(opts: CreateBotOptions): Promise<BotHandle> {
  const modulePath = opts.wechatyModulePath ?? process.env.WECHATY_MODULE_PATH
  const mod = modulePath
    ? ((await import(pathToFileURL(modulePath).href)) as WechatyModule)
    : ((await runtimeImport('@juzi/wechaty')) as WechatyModule)
  const { WechatyBuilder } = mod

  const puppetOptions: Record<string, unknown> = {
    token: opts.puppetToken,
  }
  if (opts.puppetEndpoint) {
    puppetOptions.endpoint = opts.puppetEndpoint
  }
  if (opts.puppetAuthority) {
    puppetOptions.authority = opts.puppetAuthority
  }
  if (opts.puppetNoTls) {
    // For self-hosted puppet service without TLS
    puppetOptions.tls = { disabled: true }
  }

  const bot = WechatyBuilder.build({
    name: opts.name ?? 'claude-code-best',
    puppet: 'wechaty-puppet-service',
    puppetOptions,
    ...(opts.memoryCardPath
      ? { memoryCard: { storageOptions: { path: opts.memoryCardPath } } }
      : {}),
  })

  return {
    bot,
    start: () => bot.start(),
    stop: () => bot.stop(),
  }
}

export { renderQrTerminal }
export type { WechatyInterface, ContactSelf, Message }
