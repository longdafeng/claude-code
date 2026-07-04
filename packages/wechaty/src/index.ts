// @claude-code-best/wechaty-channel — WeChat channel integration via Wechaty

// Accounts / state
export {
  loadAccount,
  saveAccount,
  clearAccount,
  getStateDir,
} from './accounts.js'
export type { WechatyAccountData } from './accounts.js'

// Bot factory
export { createBot, renderQrTerminal, ScanStatusEnum } from './bot.js'
export type { BotHandle, CreateBotOptions } from './bot.js'

// MCP Server
export {
  createWechatyMcpServer,
  runWechatyMcpServer,
  setActivePermissionChat,
  getActivePermissionChat,
  savePendingPermission,
  consumePendingPermission,
  extractPermissionReply,
  clearPermissionStateForTests,
} from './server.js'
export type {
  WechatyServerDeps,
  ChannelPermissionRequestParams,
} from './server.js'

// CLI
export { handleWechatyCli } from './cli.js'

// Type shims (for downstream consumers)
export type {
  WechatyInterface,
  ContactSelf,
  Contact,
  Message,
  Room,
} from './wechaty-shim.js'
