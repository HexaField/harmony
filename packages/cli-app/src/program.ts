// CLI program definition using commander
import { Command } from 'commander'
import {
  cmdIdentityCreate,
  cmdIdentityRecover,
  cmdIdentityShow,
  cmdIdentityExport,
  cmdIdentityImport,
  cmdCommunityCreate,
  cmdCommunityList,
  cmdCommunityJoin,
  cmdCommunityInvite,
  cmdCommunityExport,
  cmdCommunityImport,
  cmdChannelCreate,
  cmdChannelList,
  cmdChannelDelete,
  cmdSend,
  cmdHistory,
  cmdServerStart,
  cmdServerStop,
  cmdServerStatus,
  cmdMigrateDiscord,
  cmdMigrateImport,
  cmdConfigShow,
  cmdConfigSet,
  cmdFriendsList,
  cmdFriendsFind,
  formatOutput,
  type OutputFormat
} from './commands.js'

export function createProgram(): Command {
  const program = new Command()
    .name('harmony')
    .description('Harmony — sovereign community platform')
    .version('0.1.0')
    .option('--output <format>', 'output format (text|json)', 'text')

  const getFormat = (): OutputFormat => {
    const opts = program.opts()
    return opts.output === 'json' ? 'json' : 'text'
  }

  // Init
  program
    .command('init')
    .description('Interactive first-run setup')
    .action(async () => {
      const format = getFormat()
      const result = await cmdIdentityCreate(format)
      console.log(formatOutput(result, format))
    })

  // Identity
  const identity = program.command('identity').description('Identity management')

  identity
    .command('create')
    .description('Create a new sovereign identity')
    .action(async () => {
      const format = getFormat()
      const result = await cmdIdentityCreate(format)
      console.log(formatOutput(result, format))
    })

  identity
    .command('recover')
    .description('Recover identity from mnemonic')
    .argument('<mnemonic...>', '12-word mnemonic phrase')
    .action(async (words: string[]) => {
      const format = getFormat()
      const mnemonic = words.join(' ')
      const result = await cmdIdentityRecover(mnemonic, format)
      console.log(formatOutput(result, format))
    })

  identity
    .command('show')
    .description('Show current identity details')
    .action(async () => {
      const format = getFormat()
      const result = await cmdIdentityShow(format)
      console.log(formatOutput(result, format))
    })

  identity
    .command('export')
    .description('Export identity (encrypted)')
    .argument('<file>', 'output file path')
    .action(async (file: string) => {
      const format = getFormat()
      const result = await cmdIdentityExport(file, format)
      console.log(formatOutput(result, format))
    })

  identity
    .command('import')
    .description('Import identity')
    .argument('<file>', 'input file path')
    .action(async (file: string) => {
      const format = getFormat()
      const result = await cmdIdentityImport(file, format)
      console.log(formatOutput(result, format))
    })

  identity
    .command('link')
    .description('Link Discord account')
    .argument('<provider>', 'Provider to link (discord)')
    .action(async (_provider: string) => {
      console.log('Discord OAuth linking flow...')
    })

  identity
    .command('recovery')
    .description('Set up social recovery shards')
    .argument('<action>', 'Action (setup)')
    .action(async (_action: string) => {
      console.log('Setting up social recovery...')
    })

  // Community
  const community = program.command('community').description('Community management')

  community
    .command('create')
    .description('Create a community')
    .argument('<name>', 'community name')
    .action(async (name: string) => {
      const format = getFormat()
      const result = await cmdCommunityCreate(name, format)
      console.log(formatOutput(result, format))
    })

  community
    .command('list')
    .description('List your communities')
    .action(async () => {
      const format = getFormat()
      const result = await cmdCommunityList(format)
      console.log(formatOutput(result, format))
    })

  community
    .command('join')
    .description('Join via invite')
    .argument('<invite>', 'invite code or URL')
    .action(async (invite: string) => {
      const format = getFormat()
      const result = await cmdCommunityJoin(invite, format)
      console.log(formatOutput(result, format))
    })

  community
    .command('invite')
    .description('Generate invite link')
    .action(async () => {
      const format = getFormat()
      const result = await cmdCommunityInvite(format)
      console.log(formatOutput(result, format))
    })

  community
    .command('export')
    .description('Export community data')
    .argument('<file>', 'output file path')
    .action(async (file: string) => {
      const format = getFormat()
      const result = await cmdCommunityExport(file, format)
      console.log(formatOutput(result, format))
    })

  community
    .command('import')
    .description('Import community data')
    .argument('<file>', 'input file path')
    .action(async (file: string) => {
      const format = getFormat()
      const result = await cmdCommunityImport(file, format)
      console.log(formatOutput(result, format))
    })

  // Channel
  const channel = program.command('channel').description('Channel management')

  channel
    .command('create')
    .description('Create a channel')
    .argument('<name>', 'channel name')
    .action(async (name: string) => {
      const format = getFormat()
      const result = await cmdChannelCreate(name, format)
      console.log(formatOutput(result, format))
    })

  channel
    .command('list')
    .description('List channels')
    .action(async () => {
      const format = getFormat()
      const result = await cmdChannelList(format)
      console.log(formatOutput(result, format))
    })

  channel
    .command('delete')
    .description('Delete a channel')
    .argument('<name>', 'channel name')
    .action(async (name: string) => {
      const format = getFormat()
      const result = await cmdChannelDelete(name, format)
      console.log(formatOutput(result, format))
    })

  // Send
  program
    .command('send')
    .description('Send a message')
    .argument('<channel>', 'channel name')
    .argument('<message>', 'message content')
    .action(async (channel: string, message: string) => {
      const format = getFormat()
      const result = await cmdSend(channel, message, format)
      console.log(formatOutput(result, format))
    })

  // History
  program
    .command('history')
    .description('View message history')
    .argument('<channel>', 'channel name')
    .action(async (channel: string) => {
      const format = getFormat()
      const result = await cmdHistory(channel, format)
      console.log(formatOutput(result, format))
    })

  // Server
  const server = program.command('server').description('Server management')

  server
    .command('start')
    .description('Start the server daemon')
    .option('--foreground', 'Run in foreground')
    .action(async (opts: { foreground?: boolean }) => {
      const format = getFormat()
      const result = await cmdServerStart(format, opts.foreground)
      console.log(formatOutput(result, format))
    })

  server
    .command('stop')
    .description('Stop the server')
    .action(async () => {
      const format = getFormat()
      const result = await cmdServerStop(format)
      console.log(formatOutput(result, format))
    })

  server
    .command('status')
    .description('Show server status')
    .action(async () => {
      const format = getFormat()
      const result = await cmdServerStatus(format)
      console.log(formatOutput(result, format))
    })

  // Migrate
  const migrate = program.command('migrate').description('Discord migration')

  migrate
    .command('discord')
    .description('Run Discord migration')
    .argument('<guild-id>', 'Discord guild ID')
    .action(async (guildId: string) => {
      const format = getFormat()
      const result = await cmdMigrateDiscord(guildId, format)
      console.log(formatOutput(result, format))
    })

  migrate
    .command('import')
    .description('Import migration bundle')
    .argument('<file>', 'bundle file path')
    .action(async (file: string) => {
      const format = getFormat()
      const result = await cmdMigrateImport(file, format)
      console.log(formatOutput(result, format))
    })

  // Config
  const config = program.command('config').description('Configuration')

  config
    .command('show')
    .description('Show config')
    .action(async () => {
      const format = getFormat()
      const result = await cmdConfigShow(format)
      console.log(formatOutput(result, format))
    })

  config
    .command('set')
    .description('Set config value')
    .argument('<key>', 'config key')
    .argument('<value>', 'config value')
    .action(async (key: string, value: string) => {
      const format = getFormat()
      const result = await cmdConfigSet(key, value, format)
      console.log(formatOutput(result, format))
    })

  // Friends
  const friends = program.command('friends').description('Friend management')

  friends
    .command('list')
    .description('List friends')
    .action(async () => {
      const format = getFormat()
      const result = await cmdFriendsList(format)
      console.log(formatOutput(result, format))
    })

  friends
    .command('find')
    .description('Find Discord friends on Harmony')
    .option('--discord', 'search by Discord', false)
    .action(async (opts: { discord?: boolean }) => {
      const format = getFormat()
      const result = await cmdFriendsFind(!!opts.discord, format)
      console.log(formatOutput(result, format))
    })

  return program
}
