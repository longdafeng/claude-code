import { clearAccount, loadAccount, saveAccount } from './accounts.js'
import { runWechatyMcpServer } from './server.js'
import type { WechatyServerDeps } from './server.js'

function printUsage(): void {
  process.stdout.write(
    [
      'Usage:',
      '  ccb wechaty serve',
      '  ccb wechaty login <puppet-service-token>',
      '  ccb wechaty login clear',
      '',
      'Environment variables:',
      '  WECHATY_PUPPET_SERVICE_TOKEN                    Puppet service token (required)',
      '  WECHATY_PUPPET_SERVICE_ENDPOINT                 Puppet service endpoint',
      '  WECHATY_PUPPET_SERVICE_AUTHORITY                gRPC authority',
      '  WECHATY_PUPPET_SERVICE_NO_TLS_INSECURE_CLIENT   Disable TLS (true/1)',
      '  WECHATY_MODULE_PATH                             Custom Wechaty module path',
      '',
      'Session enablement:',
      '  ccb --channels plugin:wechaty@builtin',
    ].join('\n') + '\n',
  )
}

async function runLogin(args: string[]): Promise<void> {
  if (args[0] === 'clear') {
    clearAccount()
    process.stdout.write('Wechaty account cleared.\n')
    return
  }

  const token = args[0]
  if (!token) {
    process.stderr.write('Usage: ccb wechaty login <puppet-service-token>\n')
    process.exit(1)
  }

  const existing = loadAccount()
  if (existing?.puppetToken === token) {
    process.stdout.write(
      [
        'Already connected with this token:',
        `  Contact: ${existing.contactName ?? 'unknown'} (${existing.contactId ?? 'unknown'})`,
        `  Saved at: ${existing.savedAt ?? 'unknown'}`,
        '',
        'Run `ccb wechaty login clear` to disconnect.',
      ].join('\n') + '\n',
    )
    return
  }

  const endpoint = process.env.WECHATY_PUPPET_SERVICE_ENDPOINT
  const authority = process.env.WECHATY_PUPPET_SERVICE_AUTHORITY
  const noTls =
    process.env.WECHATY_PUPPET_SERVICE_NO_TLS_INSECURE_CLIENT === 'true' ||
    process.env.WECHATY_PUPPET_SERVICE_NO_TLS_INSECURE_CLIENT === '1'

  saveAccount({
    puppetToken: token,
    puppetEndpoint: endpoint,
    puppetAuthority: authority,
    puppetNoTls: noTls || undefined,
    savedAt: new Date().toISOString(),
  })

  process.stdout.write(
    [
      'Token saved.',
      endpoint ? `  Endpoint: ${endpoint}` : '',
      authority ? `  Authority: ${authority}` : '',
      noTls ? '  No TLS: true' : '',
      '',
      'Start the server with:',
      '  ccb wechaty serve',
      '',
      'Or enable in a session:',
      '  ccb --channels plugin:wechaty@builtin',
    ]
      .filter(Boolean)
      .join('\n') + '\n',
  )
}

export async function handleWechatyCli(
  args: string[],
  serverDeps?: WechatyServerDeps,
  version?: string,
): Promise<void> {
  const [subcommand, ...rest] = args

  switch (subcommand) {
    case 'serve':
      if (!serverDeps) {
        process.stderr.write(
          '[wechaty] serve handler not available in this context.\n',
        )
        process.exit(1)
      }
      await runWechatyMcpServer(version ?? '0.0.0', serverDeps)
      return
    case 'login':
      await runLogin(rest)
      return
    default:
      printUsage()
  }
}
