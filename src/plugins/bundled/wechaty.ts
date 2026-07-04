import { registerBuiltinPlugin } from '../builtinPlugins.js'
import { buildCliLaunch } from '../../utils/cliLaunch.js'

export function registerWechatyBuiltinPlugin(): void {
  const launch = buildCliLaunch(['wechaty', 'serve'])

  registerBuiltinPlugin({
    name: 'wechaty',
    description:
      'WeChat channel via Wechaty (puppet-service). Auto-enabled when configured: run `ccb wechaty login <token>` or set pluginConfigs in settings.json. Can also be enabled manually with `--channels plugin:wechaty@builtin`.',
    version: MACRO.VERSION,
    defaultEnabled: false,
    mcpServers: {
      wechaty: {
        type: 'stdio',
        command: launch.execPath,
        args: launch.args,
      },
    },
  })
}
