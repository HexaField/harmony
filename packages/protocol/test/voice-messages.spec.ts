import { describe, it, expect } from 'vitest'
import { CLIENT_TO_SERVER_TYPES, SERVER_TO_CLIENT_TYPES, serialise, deserialise } from '../src/index.js'

describe('Voice message types', () => {
  describe('CLIENT_TO_SERVER_TYPES', () => {
    it('includes voice.tracks.close', () => {
      expect(CLIENT_TO_SERVER_TYPES).toContain('voice.tracks.close')
    })
  })

  describe('SERVER_TO_CLIENT_TYPES', () => {
    it('includes voice.tracks.closed', () => {
      expect(SERVER_TO_CLIENT_TYPES).toContain('voice.tracks.closed')
    })

    it('includes voice.track.published', () => {
      expect(SERVER_TO_CLIENT_TYPES).toContain('voice.track.published')
    })

    it('includes voice.track.removed', () => {
      expect(SERVER_TO_CLIENT_TYPES).toContain('voice.track.removed')
    })
  })

  describe('all voice message types exist', () => {
    const allTypes = [...CLIENT_TO_SERVER_TYPES, ...SERVER_TO_CLIENT_TYPES]

    const expectedVoiceTypes = [
      'voice.join',
      'voice.leave',
      'voice.state',
      'voice.session.create',
      'voice.session.created',
      'voice.tracks.push',
      'voice.tracks.pushed',
      'voice.tracks.pull',
      'voice.tracks.pulled',
      'voice.tracks.close',
      'voice.tracks.closed',
      'voice.renegotiate',
      'voice.renegotiated',
      'voice.track.published',
      'voice.track.removed'
    ]

    for (const type of expectedVoiceTypes) {
      it(`includes ${type}`, () => {
        expect(allTypes).toContain(type)
      })
    }
  })

  describe('serialise/deserialise round-trip', () => {
    it('round-trips a voice.tracks.close message', () => {
      const message = {
        type: 'voice.tracks.close',
        channelId: 'ch-123',
        sessionId: 'sess-456',
        tracks: [{ trackName: 'audio-0', mid: '0' }],
        force: false
      }

      const json = serialise(message)
      const restored = deserialise(json)

      expect(restored).toEqual(message)
    })
  })
})
