import { describe, it, expect } from 'vitest'
import { toApiBase } from '../src/migration-client.js'

describe('toApiBase', () => {
  it('converts ws:// to http:// with port + 1', () => {
    expect(toApiBase('ws://localhost:4000')).toBe('http://localhost:4001')
  })

  it('converts wss:// to https:// with port + 1', () => {
    expect(toApiBase('wss://harmony.example.com:4000')).toBe('https://harmony.example.com:4001')
  })

  it('defaults to port 4000 when no port specified', () => {
    expect(toApiBase('ws://harmony.example.com')).toBe('http://harmony.example.com:4001')
  })

  it('handles http:// URLs directly', () => {
    expect(toApiBase('http://localhost:4000')).toBe('http://localhost:4001')
  })

  it('handles https:// URLs directly', () => {
    expect(toApiBase('https://harmony.example.com:4000')).toBe('https://harmony.example.com:4001')
  })

  it('adds ws:// protocol when none specified', () => {
    expect(toApiBase('localhost:4000')).toBe('http://localhost:4001')
  })

  it('adds ws:// protocol for bare hostname', () => {
    expect(toApiBase('harmony.example.com')).toBe('http://harmony.example.com:4001')
  })

  it('trims whitespace', () => {
    expect(toApiBase('  ws://localhost:4000  ')).toBe('http://localhost:4001')
  })

  it('throws on empty string', () => {
    expect(() => toApiBase('')).toThrow('No server URL configured')
  })

  it('throws on whitespace-only string', () => {
    expect(() => toApiBase('   ')).toThrow('No server URL configured')
  })

  it('handles IP addresses', () => {
    expect(toApiBase('ws://192.168.1.1:4000')).toBe('http://192.168.1.1:4001')
  })

  it('handles non-standard ports', () => {
    expect(toApiBase('ws://localhost:8080')).toBe('http://localhost:8081')
  })
})
