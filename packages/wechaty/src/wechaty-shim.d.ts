// Type shims for @juzi/wechaty runtime types.
// These let us type-check against the wechaty API without requiring
// wechaty's dist build to exist at type-check time.

export interface Sayable {
  say(text: string): Promise<void>
  say(file: FileBox): Promise<void>
}

export interface FileBoxInterface {
  name: string
  toJSON(): unknown
}

export interface ContactSelf extends Sayable {
  id: string
  name(): string
  alias(): Promise<string | null>
  gender(): number
}

export interface Contact extends Sayable {
  id: string
  name(): string
  alias(): Promise<string | null>
}

export interface Room extends Sayable {
  id: string
  topic(): Promise<string>
}

export interface Message {
  id: string
  text(): string
  type(): number
  self(): boolean
  talker(): Contact
  room(): Room | null
  date(): Date
  age(): number
  say(text: string): Promise<void>
  say(file: FileBoxInterface): Promise<void>
}

export interface ContactFindOptions {
  id?: string
  name?: string | RegExp
}

export interface ContactConstructor {
  find(options: ContactFindOptions): Promise<Contact | null>
  findAll(options?: ContactFindOptions): Promise<Contact[]>
}

export interface WechatyInterface {
  name: string
  start(): Promise<void>
  stop(): Promise<void>
  isLoggedIn: boolean
  currentUser: ContactSelf | null
  version(): string
  Message: {
    Type: Record<string, number>
  }
  ScanStatus: Record<string, number>
  Contact: ContactConstructor
  on(
    event: 'login',
    handler: (contact: ContactSelf) => void | Promise<void>,
  ): this
  on(
    event: 'logout',
    handler: (contact: ContactSelf, reason?: string) => void | Promise<void>,
  ): this
  on(
    event: 'scan',
    handler: (qrcode: string, status: number) => void | Promise<void>,
  ): this
  on(
    event: 'message',
    handler: (message: Message) => void | Promise<void>,
  ): this
  on(event: 'error', handler: (error: Error) => void | Promise<void>): this
}

export interface WechatyBuilder {
  build(options?: Record<string, unknown>): WechatyInterface
}

// FileBox type used in say()
export interface FileBox {
  name: string
}

// Re-exports for convenience
export type ScanStatusValue = number
