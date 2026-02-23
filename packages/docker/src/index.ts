// Docker package — validation and utilities
import { join, dirname } from 'node:path'

export interface DockerConfig {
  composeFile: string
  envExampleFile: string
  configExampleFile: string
  serverDockerfile: string
  uiDockerfile: string
  botDockerfile: string
}

export function getDockerPackagePath(): string {
  return dirname(new URL(import.meta.url).pathname).replace('/src', '')
}

export function getDockerFiles(): DockerConfig {
  const base = getDockerPackagePath()
  return {
    composeFile: join(base, 'docker-compose.yml'),
    envExampleFile: join(base, '.env.example'),
    configExampleFile: join(base, 'harmony.config.example.yaml'),
    serverDockerfile: join(base, 'Dockerfile.server'),
    uiDockerfile: join(base, 'Dockerfile.ui'),
    botDockerfile: join(base, 'Dockerfile.bot')
  }
}

export function validateComposeFile(content: string): { valid: boolean; errors: string[] } {
  const errors: string[] = []

  // Check for required services
  if (!content.includes('services:')) errors.push('Missing services section')
  if (!content.includes('server:')) errors.push('Missing server service')
  if (!content.includes('ui:')) errors.push('Missing ui service')

  // Check for required config
  if (!content.includes('healthcheck:')) errors.push('Missing healthcheck')
  if (!content.includes('volumes:')) errors.push('Missing volumes')
  if (!content.includes('restart:')) errors.push('Missing restart policy')

  return { valid: errors.length === 0, errors }
}

export function validateDockerfile(content: string): { valid: boolean; errors: string[] } {
  const errors: string[] = []

  if (!content.includes('FROM ')) errors.push('Missing FROM instruction')
  if (!content.includes('WORKDIR')) errors.push('Missing WORKDIR instruction')

  return { valid: errors.length === 0, errors }
}

export function validateEnvExample(content: string, composeContent: string): { valid: boolean; missingVars: string[] } {
  // Extract ${VAR} references from compose file
  const varRegex = /\$\{(\w+)(?::-[^}]*)?\}/g
  const requiredVars = new Set<string>()
  let match
  while ((match = varRegex.exec(composeContent)) !== null) {
    requiredVars.add(match[1])
  }

  // Check which are covered in .env.example
  const missingVars: string[] = []
  for (const v of requiredVars) {
    if (!content.includes(v)) {
      missingVars.push(v)
    }
  }

  return { valid: missingVars.length === 0, missingVars }
}

export function checkMultiArchSupport(composeContent: string): boolean {
  return composeContent.includes('linux/amd64') && composeContent.includes('linux/arm64')
}
