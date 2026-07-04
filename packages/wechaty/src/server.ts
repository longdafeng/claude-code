import { existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js'
import { createBot, renderQrTerminal, ScanStatusEnum } from './bot.js'
import type { WechatyInterface, Message } from './bot.js'
import { loadAccount, saveAccount, getStateDir } from './accounts.js'

// ------------------------------------------------------------------
// Permission reply detection (mirrors channelPermissions.ts)
// ------------------------------------------------------------------
const PERMISSION_REPLY_RE = /^\s*(y|yes|n|no)\s+([a-km-z]{5})\s*$/i

export interface WechatyServerDeps {
  enableConfigs(): void
  initializeAnalyticsSink(): void
  shutdownDatadog(): Promise<void>
  shutdown1PEventLogging(): Promise<void>
  logForDebugging(message: string): void
  registerPermissionHandler(
    server: Server,
    handler: (request: ChannelPermissionRequestParams) => Promise<void>,
  ): void
}

export interface ChannelPermissionRequestParams {
  request_id: string
  tool_name: string
  description: string
  input_preview: string
  channel_context?: { chat_id?: string }
}

interface PendingPermission {
  request_id: string
  chatId: string
}

// ------------------------------------------------------------------
// Shared state
// ------------------------------------------------------------------
const contextTokens = new Map<string, string>()
const pendingPermissions = new Map<string, PendingPermission>()
let activePermissionChat: { chatId: string; contextToken?: string } | null =
  null

export function setActivePermissionChat(
  chatId: string,
  contextToken?: string,
): void {
  activePermissionChat = { chatId, contextToken }
}

export function getActivePermissionChat(): {
  chatId: string
  contextToken?: string
} | null {
  return activePermissionChat
}

export function savePendingPermission(requestId: string, chatId: string): void {
  pendingPermissions.set(requestId, { request_id: requestId, chatId })
}

export function consumePendingPermission(
  requestId: string,
  fromUserId: string,
): PendingPermission | null {
  const pending = pendingPermissions.get(requestId)
  if (!pending) return null
  if (pending.chatId !== fromUserId) return null
  pendingPermissions.delete(requestId)
  return pending
}

export function extractPermissionReply(
  text: string,
): { requestId: string; behavior: 'allow' | 'deny' } | null {
  const match = text.match(PERMISSION_REPLY_RE)
  if (!match) return null
  const behavior = match[1]?.toLowerCase().startsWith('y') ? 'allow' : 'deny'
  const requestId = match[2]?.toLowerCase()
  if (!requestId) return null
  return { requestId, behavior }
}

/** Reset in-memory permission state (for tests only). */
export function clearPermissionStateForTests(): void {
  contextTokens.clear()
  pendingPermissions.clear()
  activePermissionChat = null
}

// ------------------------------------------------------------------
// Message type helpers
// ------------------------------------------------------------------
function messageTypeLabel(type: number): string {
  const labels: Record<number, string> = {
    0: 'Unknown',
    1: 'Attachment',
    2: 'Audio',
    3: 'Contact',
    4: 'ChatHistory',
    5: 'Emoticon',
    6: 'Image',
    7: 'Text',
    8: 'Location',
    9: 'MiniProgram',
    10: 'GroupNote',
    11: 'Transfer',
    12: 'RedEnvelope',
    13: 'Recalled',
    14: 'Url',
    15: 'Video',
  }
  return labels[type] ?? `Type(${type})`
}

// ------------------------------------------------------------------
// MCP Server
// ------------------------------------------------------------------
export function createWechatyMcpServer(
  version: string,
  bot: WechatyInterface,
): Server {
  const server = new Server(
    { name: 'wechaty', version },
    {
      capabilities: {
        experimental: {
          'claude/channel': {},
          'claude/channel/permission': {},
        },
        tools: {},
      },
      instructions:
        'Messages from WeChat (via Wechaty) arrive as <channel source="plugin:wechaty:wechaty" chat_id="..." sender_id="...">. ' +
        'Reply using the reply tool with the chat_id from the channel tag. Use absolute paths for file attachments.',
    },
  )

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
      {
        name: 'reply',
        description:
          'Reply to a WeChat message. Pass the chat_id from the channel tag.',
        inputSchema: {
          type: 'object' as const,
          properties: {
            chat_id: {
              type: 'string',
              description: 'The chat_id from the channel notification',
            },
            text: { type: 'string', description: 'The reply text' },
            files: {
              type: 'array',
              items: { type: 'string' },
              description: 'Optional absolute file paths to attach',
            },
          },
          required: ['chat_id', 'text'],
        },
      },
      {
        name: 'send_typing',
        description: 'Send a typing indicator to a WeChat user.',
        inputSchema: {
          type: 'object' as const,
          properties: {
            chat_id: {
              type: 'string',
              description: 'The chat_id (contact ID)',
            },
          },
          required: ['chat_id'],
        },
      },
    ],
  }))

  server.setRequestHandler(CallToolRequestSchema, async request => {
    const { name, arguments: args } = request.params

    switch (name) {
      case 'reply': {
        const chatId = typeof args?.chat_id === 'string' ? args.chat_id : ''
        const text = typeof args?.text === 'string' ? args.text : ''
        const files = Array.isArray(args?.files)
          ? args.files.filter((v): v is string => typeof v === 'string')
          : undefined

        if (!chatId || !text) {
          return {
            content: [{ type: 'text', text: 'Missing chat_id or text.' }],
            isError: true,
          }
        }

        try {
          const contact = await bot.Contact.find({ id: chatId })
          if (!contact) {
            return {
              content: [{ type: 'text', text: `Contact not found: ${chatId}` }],
              isError: true,
            }
          }

          await contact.say(text)

          if (files && files.length > 0) {
            const missing = files.find(filePath => !existsSync(filePath))
            if (missing) {
              return {
                content: [{ type: 'text', text: `File not found: ${missing}` }],
                isError: true,
              }
            }
            return {
              content: [
                {
                  type: 'text',
                  text: 'Text sent. File attachments are not supported by this Wechaty channel build.',
                },
              ],
            }
          }

          return { content: [{ type: 'text', text: 'Message sent.' }] }
        } catch (error) {
          return {
            content: [{ type: 'text', text: `Failed to send: ${error}` }],
            isError: true,
          }
        }
      }

      case 'send_typing': {
        const chatId = typeof args?.chat_id === 'string' ? args.chat_id : ''
        if (!chatId) {
          return {
            content: [{ type: 'text', text: 'Missing chat_id.' }],
            isError: true,
          }
        }
        // Wechaty doesn't have a native typing indicator for WeChat.
        // Return success but this is a no-op.
        return {
          content: [{ type: 'text', text: 'Not supported by Wechaty.' }],
        }
      }

      default:
        return {
          content: [{ type: 'text', text: `Unknown tool: ${name}` }],
          isError: true,
        }
    }
  })

  return server
}

// ------------------------------------------------------------------
// Main entry — runs the MCP server with wechaty bot
// ------------------------------------------------------------------
export async function runWechatyMcpServer(
  version: string,
  deps: WechatyServerDeps,
): Promise<void> {
  deps.enableConfigs()
  deps.initializeAnalyticsSink()

  // Load config from account file or environment variables
  const account = loadAccount()
  const puppetToken =
    process.env.WECHATY_PUPPET_SERVICE_TOKEN || account?.puppetToken

  if (!puppetToken) {
    process.stderr.write(
      '[wechaty] No puppet token. Set WECHATY_PUPPET_SERVICE_TOKEN or run `ccb wechaty login <token>`.\n',
    )
    await Promise.all([deps.shutdown1PEventLogging(), deps.shutdownDatadog()])
    process.exit(1)
  }

  const puppetEndpoint =
    process.env.WECHATY_PUPPET_SERVICE_ENDPOINT || account?.puppetEndpoint
  const puppetAuthority =
    process.env.WECHATY_PUPPET_SERVICE_AUTHORITY || account?.puppetAuthority
  const puppetNoTls =
    process.env.WECHATY_PUPPET_SERVICE_NO_TLS_INSECURE_CLIENT === 'true' ||
    process.env.WECHATY_PUPPET_SERVICE_NO_TLS_INSECURE_CLIENT === '1' ||
    account?.puppetNoTls

  const { bot, start, stop } = await createBot({
    name: 'claude-code-best',
    puppetToken,
    puppetEndpoint,
    puppetAuthority,
    puppetNoTls: puppetNoTls || undefined,
    memoryCardPath: join(getStateDir(), 'memory-card.json'),
  })

  const server = createWechatyMcpServer(version, bot)
  const transport = new StdioServerTransport()

  // -- Register permission handler ------------------------------------------
  deps.registerPermissionHandler(server, async request => {
    const targetChatId = request.channel_context?.chat_id
    const targetChat = targetChatId
      ? { chatId: targetChatId }
      : getActivePermissionChat()

    if (!targetChat) {
      deps.logForDebugging(
        `[Wechaty MCP] No active chat for permission request ${request.request_id}`,
      )
      return
    }

    try {
      savePendingPermission(request.request_id, targetChat.chatId)
      const contact = await bot.Contact.find({ id: targetChat.chatId })
      if (contact) {
        const msg = [
          'Claude Code needs your approval.',
          '',
          `Tool: ${request.tool_name}`,
          `Reason: ${request.description}`,
          `Input: ${request.input_preview}`,
          '',
          `Reply with: yes ${request.request_id}`,
          `Or deny with: no ${request.request_id}`,
        ].join('\n')
        await contact.say(msg)
      }
    } catch (error) {
      process.stderr.write(
        `[wechaty] Failed to relay permission ${request.request_id}: ${error}\n`,
      )
    }
  })

  // -- Bot event handlers ---------------------------------------------------
  bot.on('scan', async (qrcode: string, status: number) => {
    if (
      status === ScanStatusEnum.Waiting ||
      status === ScanStatusEnum.Unknown
    ) {
      await renderQrTerminal(qrcode)
      process.stderr.write(
        `[wechaty] Scan QR code to login (status=${status})\n`,
      )
    }
  })

  bot.on('login', async (user: { id: string; name(): string }) => {
    process.stderr.write(`[wechaty] Logged in as ${user.name()} (${user.id})\n`)
    saveAccount({
      puppetToken,
      puppetEndpoint,
      puppetAuthority,
      puppetNoTls: puppetNoTls || undefined,
      contactId: user.id,
      contactName: user.name(),
      savedAt: new Date().toISOString(),
    })
  })

  bot.on('logout', async (user: { name(): string }, reason?: string) => {
    process.stderr.write(
      `[wechaty] ${user.name()} logged out${reason ? `: ${reason}` : ''}\n`,
    )
  })

  bot.on('error', async (error: Error) => {
    process.stderr.write(`[wechaty] Bot error: ${error.message}\n`)
  })

  bot.on('message', async (msg: Message) => {
    try {
      if (msg.self()) return

      const talker = msg.talker()
      const fromUserId = talker.id
      const fromName = talker.name()
      const msgType = msg.type()
      const text = msg.text()
      const msgId = msg.id

      process.stderr.write(
        `[wechaty] Message from ${fromName}(${fromUserId}): type=${messageTypeLabel(msgType)} text=${text.slice(0, 80)}\n`,
      )

      setActivePermissionChat(fromUserId)

      // Only handle text messages for now
      if (msgType !== 7) {
        process.stderr.write(
          `[wechaty] Skipping non-text message type=${messageTypeLabel(msgType)}\n`,
        )
        return
      }

      if (!text) return

      // Check for permission reply
      const permReply = extractPermissionReply(text)
      if (permReply) {
        const pending = consumePendingPermission(
          permReply.requestId,
          fromUserId,
        )
        if (pending) {
          await server.notification({
            method: 'notifications/claude/channel/permission',
            params: {
              request_id: pending.request_id,
              behavior: permReply.behavior,
            },
          })
          return
        }
      }

      // Forward message as channel notification
      await server.notification({
        method: 'notifications/claude/channel',
        params: {
          content: text,
          meta: {
            chat_id: fromUserId,
            sender_id: fromUserId,
            sender_name: fromName,
            message_id: msgId,
          },
        },
      })
    } catch (error) {
      process.stderr.write(
        `[wechaty] Message handler error: ${error instanceof Error ? error.message : String(error)}\n`,
      )
    }
  })

  // -- Connect MCP transport -----------------------------------------------
  await server.connect(transport)

  // -- Graceful shutdown ----------------------------------------------------
  const controller = new AbortController()

  let exiting = false
  const shutdownAndExit = async (): Promise<void> => {
    if (exiting) return
    exiting = true
    if (!controller.signal.aborted) controller.abort()
    try {
      await stop()
    } catch {
      // ignore stop errors during shutdown
    }
    await Promise.all([deps.shutdown1PEventLogging(), deps.shutdownDatadog()])
    process.exit(0)
  }

  process.stdin.on('end', () => void shutdownAndExit())
  process.stdin.on('error', () => void shutdownAndExit())
  process.on('SIGINT', () => void shutdownAndExit())
  process.on('SIGTERM', () => void shutdownAndExit())
  process.on('SIGHUP', () => void shutdownAndExit())

  // Parent process watchdog
  const ppid = process.ppid
  const parentCheck = setInterval(() => {
    try {
      process.kill(ppid, 0)
    } catch {
      process.stderr.write(
        '[wechaty] Parent process exited, shutting down...\n',
      )
      clearInterval(parentCheck)
      void shutdownAndExit()
    }
  }, 5000)

  process.stderr.write('[wechaty] Starting bot...\n')
  await start()

  // Keep process alive until shutdown
  await new Promise<void>(() => {})
  clearInterval(parentCheck)
}
