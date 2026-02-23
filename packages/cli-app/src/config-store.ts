// Persistent config at ~/.harmony/config.json
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'

export interface CLIConfig {
  identity?: {
    did: string
    encryptedMnemonic?: string
    createdAt: string
  }
  serverUrl?: string
  cloudUrl?: string
  [key: string]: unknown
}

function configDir(): string {
  return join(homedir(), '.harmony')
}

function configPath(): string {
  return join(configDir(), 'config.json')
}

export function loadCLIConfig(): CLIConfig | null {
  const path = configPath()
  if (!existsSync(path)) return null
  try {
    return JSON.parse(readFileSync(path, 'utf-8'))
  } catch {
    return null
  }
}

export function saveCLIConfig(config: CLIConfig): void {
  const dir = configDir()
  mkdirSync(dir, { recursive: true })
  writeFileSync(configPath(), JSON.stringify(config, null, 2))
}

export function getConfigValue(key: string): unknown {
  const config = loadCLIConfig()
  if (!config) return undefined
  const parts = key.split('.')
  let current: unknown = config
  for (const part of parts) {
    if (current === null || current === undefined || typeof current !== 'object') return undefined
    current = (current as Record<string, unknown>)[part]
  }
  return current
}

export function setConfigValue(key: string, value: string): void {
  const config = loadCLIConfig() ?? {}
  const parts = key.split('.')
  let current: Record<string, unknown> = config
  for (let i = 0; i < parts.length - 1; i++) {
    if (!(parts[i] in current) || typeof current[parts[i]] !== 'object') {
      current[parts[i]] = {}
    }
    current = current[parts[i]] as Record<string, unknown>
  }
  // Try to parse as number/boolean
  let parsed: unknown = value
  if (value === 'true') parsed = true
  else if (value === 'false') parsed = false
  else if (!isNaN(Number(value)) && value.trim() !== '') parsed = Number(value)

  current[parts[parts.length - 1]] = parsed
  saveCLIConfig(config)
}

export function hasConfig(): boolean {
  return existsSync(configPath())
}
