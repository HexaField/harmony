import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import yaml from 'js-yaml'

import {
  validateComposeFile,
  validateDockerfile,
  validateEnvExample,
  checkMultiArchSupport,
  getDockerFiles
} from '../src/index.js'

const pkgDir = join(dirname(fileURLToPath(import.meta.url)), '..')

const composeContent = readFileSync(join(pkgDir, 'docker-compose.yml'), 'utf-8')
const serverDockerfile = readFileSync(join(pkgDir, 'Dockerfile.server'), 'utf-8')
const uiDockerfile = readFileSync(join(pkgDir, 'Dockerfile.ui'), 'utf-8')
const botDockerfile = readFileSync(join(pkgDir, 'Dockerfile.bot'), 'utf-8')
const envExample = readFileSync(join(pkgDir, '.env.example'), 'utf-8')
const configExample = readFileSync(join(pkgDir, 'harmony.config.example.yaml'), 'utf-8')

describe('Docker', () => {
  it('T1: docker-compose.yml is valid YAML with no undefined vars', () => {
    const parsed = yaml.load(composeContent)
    expect(parsed).toBeDefined()
    expect(typeof parsed).toBe('object')
    const result = validateComposeFile(composeContent)
    expect(result.valid).toBe(true)
    expect(result.errors).toEqual([])
  })

  it('T2: Server Dockerfile is valid', () => {
    const result = validateDockerfile(serverDockerfile)
    expect(result.valid).toBe(true)
    expect(serverDockerfile).toContain('FROM node:')
    expect(serverDockerfile).toContain('EXPOSE')
    expect(serverDockerfile).toContain('HEALTHCHECK')
  })

  it('T3: UI Dockerfile is valid', () => {
    const result = validateDockerfile(uiDockerfile)
    expect(result.valid).toBe(true)
    expect(uiDockerfile).toContain('FROM nginx')
    expect(uiDockerfile).toContain('EXPOSE 8080')
  })

  it('T4: Bot Dockerfile is valid', () => {
    const result = validateDockerfile(botDockerfile)
    expect(result.valid).toBe(true)
    expect(botDockerfile).toContain('DISCORD_TOKEN')
  })

  it('T5: Server has health check defined', () => {
    expect(composeContent).toContain('healthcheck:')
    expect(composeContent).toContain('/health')
  })

  it('T6: UI service configured on correct port', () => {
    expect(composeContent).toContain('8080')
    expect(composeContent).toContain('service_healthy')
  })

  it('T7: Server exposes WebSocket port', () => {
    expect(composeContent).toContain('4000')
  })

  it('T8: Volume defined for data persistence', () => {
    expect(composeContent).toContain('harmony-data:')
    expect(composeContent).toContain('/var/harmony/data')
  })

  it('T9: Bot service configured with dependencies', () => {
    expect(composeContent).toContain('bot:')
    expect(composeContent).toContain('with-bot')
  })

  it('T10: .env.example covers all vars', () => {
    const result = validateEnvExample(envExample, composeContent)
    expect(result.valid).toBe(true)
  })

  it('T11: Builds for amd64 and arm64', () => {
    expect(checkMultiArchSupport(composeContent)).toBe(true)
  })

  // New tests
  it('T12: getDockerFiles returns all paths', () => {
    const files = getDockerFiles()
    expect(files.composeFile).toContain('docker-compose.yml')
    expect(files.envExampleFile).toContain('.env.example')
    expect(files.serverDockerfile).toContain('Dockerfile.server')
    expect(files.uiDockerfile).toContain('Dockerfile.ui')
    expect(files.botDockerfile).toContain('Dockerfile.bot')
    expect(files.configExampleFile).toContain('harmony.config.example.yaml')
  })

  it('T13: validateComposeFile detects missing services section', () => {
    const result = validateComposeFile('foo: bar')
    expect(result.valid).toBe(false)
    expect(result.errors).toContain('Missing services section')
  })

  it('T14: validateDockerfile detects missing FROM', () => {
    const result = validateDockerfile('WORKDIR /app\nRUN echo hi')
    expect(result.valid).toBe(false)
    expect(result.errors).toContain('Missing FROM instruction')
  })

  it('T15: validateDockerfile detects missing WORKDIR', () => {
    const result = validateDockerfile('FROM node:22\nRUN echo hi')
    expect(result.valid).toBe(false)
    expect(result.errors).toContain('Missing WORKDIR instruction')
  })

  it('T16: validateEnvExample detects missing vars', () => {
    const compose = 'image: ${MY_VAR:-default}\nport: ${OTHER_VAR}'
    const result = validateEnvExample('# empty', compose)
    expect(result.valid).toBe(false)
    expect(result.missingVars).toContain('MY_VAR')
    expect(result.missingVars).toContain('OTHER_VAR')
  })

  it('T17: checkMultiArchSupport returns false without both arches', () => {
    expect(checkMultiArchSupport('linux/amd64')).toBe(false)
    expect(checkMultiArchSupport('linux/arm64')).toBe(false)
    expect(checkMultiArchSupport('')).toBe(false)
  })

  it('T18: Server Dockerfile uses multi-stage build', () => {
    expect(serverDockerfile).toContain('AS builder')
    expect((serverDockerfile.match(/FROM /g) || []).length).toBeGreaterThanOrEqual(2)
  })

  it('T19: UI Dockerfile uses multi-stage build', () => {
    expect(uiDockerfile).toContain('AS builder')
  })

  it('T20: Server Dockerfile installs pnpm', () => {
    expect(serverDockerfile).toContain('corepack enable')
    expect(serverDockerfile).toContain('pnpm install')
  })

  it('T21: Compose uses restart policy', () => {
    expect(composeContent).toContain('unless-stopped')
  })

  it('T22: Bot data volume exists', () => {
    expect(composeContent).toContain('bot-data:')
  })

  it('T23: Server config mounted read-only', () => {
    expect(composeContent).toContain(':ro')
  })

  it('T24: Environment variable for server URL in UI', () => {
    expect(composeContent).toContain('HARMONY_SERVER_URL')
  })
})

describe('Config Example', () => {
  it('config example is valid YAML with all sections', () => {
    const parsed = yaml.load(configExample) as Record<string, unknown>
    expect(parsed).toBeDefined()
    expect(parsed.server).toBeDefined()
    expect(parsed.storage).toBeDefined()
    expect(parsed.logging).toBeDefined()
    expect(parsed.moderation).toBeDefined()
    expect(parsed.relay).toBeDefined()
    expect(parsed.federation).toBeDefined()
    expect(parsed.voice).toBeDefined()
    expect(parsed.limits).toBeDefined()
  })
})
