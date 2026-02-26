import { describe, it } from 'vitest'

describe('Feature Coverage — Social Features', () => {
  it.todo('MUST share profile via QR code')
  it.todo('MUST persist contact list locally')
  it.todo('MUST add friend by DID string')
})

describe('Feature Coverage — Internationalisation', () => {
  it.todo('MUST support multiple languages via string table')
  it.todo('SHOULD detect browser locale and apply matching language')
  it.todo('MAY support community-level language preferences')
})

describe('Feature Coverage — Revenue & Cloud Tiers', () => {
  it.todo('MUST integrate Stripe billing for cloud tiers')
  it.todo('MUST gate features by subscription tier')
  it.todo('MUST support custom domains for Pro tier')
  it.todo('MUST support SSO for enterprise tier')
  it.todo('MUST provide admin dashboard for cloud management')
})

describe('Feature Coverage — Infrastructure', () => {
  it.todo('MUST support PWA manifest with installable icons')
  it.todo('MUST reconnect WebSocket with exponential backoff')
  it.todo('MUST buffer messages in offline queue')
})
