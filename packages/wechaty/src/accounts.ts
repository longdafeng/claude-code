import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

export interface WechatyAccountData {
  /** Wechaty puppet service token */
  puppetToken?: string
  /** Puppet service endpoint (optional) */
  puppetEndpoint?: string
  /** gRPC authority (optional) */
  puppetAuthority?: string
  /** Disable TLS for insecure connections (optional) */
  puppetNoTls?: boolean
  /** Contact ID after login */
  contactId?: string
  /** Contact name after login */
  contactName?: string
  /** ISO timestamp when the account was saved */
  savedAt?: string
}

const STATE_DIR_NAME = '.claude-wechaty'
const ACCOUNT_FILE = 'account.json'

export function getStateDir(): string {
  const override = process.env.WECHATY_STATE_DIR
  const dir = override ?? join(homedir(), STATE_DIR_NAME)
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }
  return dir
}

export function loadAccount(): WechatyAccountData | null {
  const path = join(getStateDir(), ACCOUNT_FILE)
  if (!existsSync(path)) return null
  try {
    const raw = readFileSync(path, 'utf-8')
    return JSON.parse(raw) as WechatyAccountData
  } catch {
    return null
  }
}

export function saveAccount(data: WechatyAccountData): void {
  const path = join(getStateDir(), ACCOUNT_FILE)
  writeFileSync(path, JSON.stringify(data, null, 2), 'utf-8')
  chmodSync(path, 0o600)
}

export function clearAccount(): void {
  const path = join(getStateDir(), ACCOUNT_FILE)
  if (existsSync(path)) {
    unlinkSync(path)
  }
}
