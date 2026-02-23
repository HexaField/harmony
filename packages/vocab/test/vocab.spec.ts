import { describe, it, expect } from 'vitest'
import {
  HARMONY,
  VC,
  ZCAP,
  DID,
  XSD,
  RDF,
  RDFS,
  HarmonyType,
  HarmonyPredicate,
  HarmonyCredentialType,
  HarmonyAction,
  RDFPredicate,
  XSDDatatype,
  Context,
  HARMONY_TURTLE,
  HARMONY_JSONLD_CONTEXT
} from '../src/index.js'

describe('@harmony/vocab', () => {
  describe('Namespace URIs', () => {
    it('MUST define all namespace URIs', () => {
      expect(HARMONY).toBe('https://harmony.example/vocab#')
      expect(VC).toBe('https://www.w3.org/2018/credentials#')
      expect(ZCAP).toBe('https://w3id.org/zcap#')
      expect(DID).toBe('https://www.w3.org/ns/did#')
      expect(XSD).toBe('http://www.w3.org/2001/XMLSchema#')
      expect(RDF).toBe('http://www.w3.org/1999/02/22-rdf-syntax-ns#')
      expect(RDFS).toBe('http://www.w3.org/2000/01/rdf-schema#')
    })
  })

  describe('Harmony types', () => {
    it('MUST define all core types with correct namespace', () => {
      expect(HarmonyType.Community).toBe(`${HARMONY}Community`)
      expect(HarmonyType.Channel).toBe(`${HARMONY}Channel`)
      expect(HarmonyType.Category).toBe(`${HARMONY}Category`)
      expect(HarmonyType.Thread).toBe(`${HARMONY}Thread`)
      expect(HarmonyType.Message).toBe(`${HARMONY}Message`)
      expect(HarmonyType.Role).toBe(`${HARMONY}Role`)
      expect(HarmonyType.Member).toBe(`${HARMONY}Member`)
      expect(HarmonyType.Reaction).toBe(`${HARMONY}Reaction`)
    })
  })

  describe('Harmony predicates', () => {
    it('MUST define all predicates', () => {
      expect(HarmonyPredicate.author).toBe(`${HARMONY}author`)
      expect(HarmonyPredicate.content).toBe(`${HARMONY}content`)
      expect(HarmonyPredicate.timestamp).toBe(`${HARMONY}timestamp`)
      expect(HarmonyPredicate.replyTo).toBe(`${HARMONY}replyTo`)
      expect(HarmonyPredicate.inChannel).toBe(`${HARMONY}inChannel`)
      expect(HarmonyPredicate.inCategory).toBe(`${HARMONY}inCategory`)
      expect(HarmonyPredicate.parentThread).toBe(`${HARMONY}parentThread`)
      expect(HarmonyPredicate.role).toBe(`${HARMONY}role`)
      expect(HarmonyPredicate.community).toBe(`${HARMONY}community`)
      expect(HarmonyPredicate.joinedAt).toBe(`${HARMONY}joinedAt`)
      expect(HarmonyPredicate.permission).toBe(`${HARMONY}permission`)
    })
  })

  describe('Harmony VC types', () => {
    it('MUST define credential types', () => {
      expect(HarmonyCredentialType.DiscordIdentityCredential).toContain(HARMONY)
      expect(HarmonyCredentialType.CommunityMembershipCredential).toContain(HARMONY)
      expect(HarmonyCredentialType.EmailVerificationCredential).toContain(HARMONY)
      expect(HarmonyCredentialType.OAuthIdentityCredential).toContain(HARMONY)
    })
  })

  describe('Harmony ZCAP actions', () => {
    it('MUST define all actions', () => {
      expect(HarmonyAction.SendMessage).toContain(HARMONY)
      expect(HarmonyAction.DeleteMessage).toContain(HARMONY)
      expect(HarmonyAction.ManageChannel).toContain(HARMONY)
      expect(HarmonyAction.ManageRoles).toContain(HARMONY)
      expect(HarmonyAction.BanUser).toContain(HARMONY)
    })
  })

  describe('W3C Context URLs', () => {
    it('MUST define standard context URLs', () => {
      expect(Context.VC).toBe('https://www.w3.org/2018/credentials/v1')
      expect(Context.DID).toBe('https://www.w3.org/ns/did/v1')
      expect(Context.ZCAP).toBe('https://w3id.org/zcap/v1')
    })
  })

  describe('Ontology Files', () => {
    it('MUST export harmony Turtle ontology as string constant', () => {
      expect(HARMONY_TURTLE).toContain('@prefix harmony:')
      expect(HARMONY_TURTLE).toContain('harmony:Community')
      expect(HARMONY_TURTLE).toContain('harmony:Message')
      expect(HARMONY_TURTLE).toContain('harmony:SendMessage')
    })

    it('MUST export harmony JSON-LD context as object constant', () => {
      expect(HARMONY_JSONLD_CONTEXT['@context']).toBeDefined()
      expect(HARMONY_JSONLD_CONTEXT['@context'].harmony).toBe('https://harmony.example/vocab#')
      expect(HARMONY_JSONLD_CONTEXT['@context'].Community).toBe('harmony:Community')
      expect(HARMONY_JSONLD_CONTEXT['@context'].author).toBeDefined()
    })
  })

  describe('Phase 3 Types', () => {
    it('MUST define voice types', () => {
      expect(HarmonyType.VoiceRoom).toBe(`${HARMONY}VoiceRoom`)
      expect(HarmonyType.VoiceParticipant).toBe(`${HARMONY}VoiceParticipant`)
    })

    it('MUST define media types', () => {
      expect(HarmonyType.MediaFile).toBe(`${HARMONY}MediaFile`)
      expect(HarmonyType.LinkPreview).toBe(`${HARMONY}LinkPreview`)
    })

    it('MUST define bot types', () => {
      expect(HarmonyType.Bot).toBe(`${HARMONY}Bot`)
      expect(HarmonyType.Webhook).toBe(`${HARMONY}Webhook`)
    })

    it('MUST define governance types', () => {
      expect(HarmonyType.Proposal).toBe(`${HARMONY}Proposal`)
      expect(HarmonyType.Constitution).toBe(`${HARMONY}Constitution`)
      expect(HarmonyType.UserDelegation).toBe(`${HARMONY}UserDelegation`)
      expect(HarmonyType.AgentAuth).toBe(`${HARMONY}AgentAuth`)
    })

    it('MUST define credential types', () => {
      expect(HarmonyType.CredentialType).toBe(`${HARMONY}CredentialType`)
      expect(HarmonyType.Reputation).toBe(`${HARMONY}Reputation`)
    })
  })

  describe('Phase 3 Predicates', () => {
    it('MUST define voice predicates', () => {
      expect(HarmonyPredicate.maxParticipants).toBe(`${HARMONY}maxParticipants`)
      expect(HarmonyPredicate.quality).toBe(`${HARMONY}quality`)
      expect(HarmonyPredicate.speaking).toBe(`${HARMONY}speaking`)
    })

    it('MUST define media predicates', () => {
      expect(HarmonyPredicate.filename).toBe(`${HARMONY}filename`)
      expect(HarmonyPredicate.contentType).toBe(`${HARMONY}contentType`)
      expect(HarmonyPredicate.encryptedSize).toBe(`${HARMONY}encryptedSize`)
      expect(HarmonyPredicate.checksum).toBe(`${HARMONY}checksum`)
    })

    it('MUST define governance predicates', () => {
      expect(HarmonyPredicate.proposalStatus).toBe(`${HARMONY}proposalStatus`)
      expect(HarmonyPredicate.quorumKind).toBe(`${HARMONY}quorumKind`)
      expect(HarmonyPredicate.votingPeriod).toBe(`${HARMONY}votingPeriod`)
    })
  })

  describe('Phase 3 Actions', () => {
    it('MUST define Phase 3 ZCAP actions', () => {
      expect(HarmonyAction.JoinVoice).toBe(`${HARMONY}JoinVoice`)
      expect(HarmonyAction.InstallBot).toBe(`${HARMONY}InstallBot`)
      expect(HarmonyAction.ProposeGovernance).toBe(`${HARMONY}ProposeGovernance`)
      expect(HarmonyAction.DelegateUser).toBe(`${HARMONY}DelegateUser`)
      expect(HarmonyAction.IssueCustomCredential).toBe(`${HARMONY}IssueCustomCredential`)
    })
  })
})
