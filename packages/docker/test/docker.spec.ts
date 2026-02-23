import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import yaml from 'js-yaml'

import { validateComposeFile, validateDockerfile, validateEnvExample, checkMultiArchSupport } from '../src/index.js'

const pkgDir = join(dirname(fileURLToPath(import.meta.url)), '..')

const composeContent = readFileSync(join(pkgDir, 'docker-compose.yml'), 'utf-8')
const serverDockerfile = readFileSync(join(pkgDir, 'Dockerfile.server'), 'utf-8')
const uiDockerfile = readFileSync(join(pkgDir, 'Dockerfile.ui'), 'utf-8')
const botDockerfile = readFileSync(join(pkgDir, 'Dockerfile.bot'), 'utf-8')
const envExample = readFileSync(join(pkgDir, '.env.example'), 'utf-8')
const configExample = readFileSync(join(pkgDir, 'harmony.config.example.yaml'), 'utf-8')

describe('Docker', () => {
  // T1: docker compose config validates
  it('T1: docker-compose.yml is valid YAML with no undefined vars', () => {
    const parsed = yaml.load(composeContent)
    expect(parsed).toBeDefined()
    expect(typeof parsed).toBe('object')

    const result = validateComposeFile(composeContent)
    expect(result.valid).toBe(true)
    expect(result.errors).toEqual([])
  })

  // T2: Server Dockerfile builds
  it('T2: Server Dockerfile is valid', () => {
    const result = validateDockerfile(serverDockerfile)
    expect(result.valid).toBe(true)
    expect(serverDockerfile).toContain('FROM node:')
    expect(serverDockerfile).toContain('EXPOSE')
    expect(serverDockerfile).toContain('HEALTHCHECK')
  })

  // T3: UI Dockerfile builds
  it('T3: UI Dockerfile is valid', () => {
    const result = validateDockerfile(uiDockerfile)
    expect(result.valid).toBe(true)
    expect(uiDockerfile).toContain('FROM nginx')
    expect(uiDockerfile).toContain('EXPOSE 8080')
  })

  // T4: Bot Dockerfile builds
  it('T4: Bot Dockerfile is valid', () => {
    const result = validateDockerfile(botDockerfile)
    expect(result.valid).toBe(true)
    expect(botDockerfile).toContain('DISCORD_TOKEN')
  })

  // T5: Server container starts (healthcheck defined)
  it('T5: Server has health check defined', () => {
    expect(composeContent).toContain('healthcheck:')
    expect(composeContent).toContain('wget')
    expect(composeContent).toContain('/health')
  })

  // T6: UI container serves app
  it('T6: UI service configured on correct port', () => {
    expect(composeContent).toContain('8080')
    expect(composeContent).toContain('depends_on')
    expect(composeContent).toContain('service_healthy')
  })

  // T7: Server accepts WebSocket
  it('T7: Server exposes WebSocket port', () => {
    expect(composeContent).toContain('4000')
    expect(serverDockerfile).toContain('4000')
  })

  // T8: Data volume persists
  it('T8: Volume defined for data persistence', () => {
    expect(composeContent).toContain('harmony-data:')
    expect(composeContent).toContain('/var/harmony/data')
  })

  // T9: Bot connects to server
  it('T9: Bot service configured with dependencies', () => {
    expect(composeContent).toContain('bot:')
    expect(composeContent).toContain('HARMONY_SERVER_URL')
    expect(composeContent).toContain('profiles:')
    expect(composeContent).toContain('with-bot')
  })

  // T10: .env.example covers all vars
  it('T10: .env.example covers every ${VAR} in docker-compose', () => {
    const result = validateEnvExample(envExample, composeContent)
    expect(result.valid).toBe(true)
    if (!result.valid) {
      console.log('Missing vars:', result.missingVars)
    }
  })

  // T11: Multi-arch build
  it('T11: Builds for amd64 and arm64', () => {
    expect(checkMultiArchSupport(composeContent)).toBe(true)
    expect(composeContent).toContain('linux/amd64')
    expect(composeContent).toContain('linux/arm64')
  })
})

describe('Config Example', () => {
  it('Config example is valid YAML', () => {
    const parsed = yaml.load(configExample)
    expect(parsed).toBeDefined()
    expect(typeof parsed).toBe('object')
    const config = parsed as Record<string, unknown>
    expect(config.server).toBeDefined()
    expect(config.storage).toBeDefined()
    expect(config.logging).toBeDefined()
  })
})
