#!/usr/bin/env node
// @harmony/discord-bot — Discord bot entrypoint
// Starts the Harmony Discord bot with slash commands

import { HarmonyDiscordBot } from '../src/bot.ts'

const token = process.env.DISCORD_TOKEN ?? ''
const portalUrl = process.env.HARMONY_PORTAL_URL ?? 'http://localhost:3001'
const serverUrl = process.env.HARMONY_SERVER_URL ?? 'ws://localhost:4000'

if (!token) {
  console.warn('DISCORD_TOKEN not set — bot will start in offline mode')
  console.warn('Set DISCORD_TOKEN environment variable to connect to Discord')
}

const bot = new HarmonyDiscordBot({
  token,
  portalUrl,
  serverUrl
})

async function main() {
  try {
    await bot.start()
    console.log('Harmony Discord bot started')

    const commands = bot.getRegisteredCommands()
    console.log(`Registered ${commands.length} command group(s):`)
    for (const cmd of commands) {
      console.log(`  /${cmd.name}`)
      if (cmd.subcommands) {
        for (const sub of cmd.subcommands) {
          console.log(`    /${cmd.name} ${sub.name} — ${sub.description}`)
        }
      }
    }

    if (!token) {
      console.log('')
      console.log('Bot is running in offline mode (no Discord connection)')
      console.log('Set DISCORD_TOKEN to enable Discord gateway connection')
    }

    console.log(`Cloud URL: ${portalUrl}`)
    console.log(`Server URL: ${serverUrl}`)
  } catch (err) {
    console.error('Failed to start bot:', err)
    process.exit(1)
  }
}

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('Shutting down bot...')
  if (bot.isRunning()) {
    await bot.stop()
  }
  process.exit(0)
})

process.on('SIGINT', async () => {
  console.log('Shutting down bot...')
  if (bot.isRunning()) {
    await bot.stop()
  }
  process.exit(0)
})

main()
