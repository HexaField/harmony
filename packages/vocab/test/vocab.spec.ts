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

  describe('Edge Cases & Completeness', () => {
    it('all HarmonyType values MUST start with HARMONY namespace', () => {
      for (const [key, value] of Object.entries(HarmonyType)) {
        expect(value).toMatch(
          new RegExp(`^${HARMONY.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`),
          `HarmonyType.${key} should start with HARMONY namespace`
        )
      }
    })

    it('all HarmonyPredicate values MUST start with HARMONY namespace', () => {
      for (const [key, value] of Object.entries(HarmonyPredicate)) {
        expect(value).toMatch(
          new RegExp(`^${HARMONY.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`),
          `HarmonyPredicate.${key}`
        )
      }
    })

    it('all HarmonyAction values MUST start with HARMONY namespace', () => {
      for (const [key, value] of Object.entries(HarmonyAction)) {
        expect(value).toMatch(new RegExp(`^${HARMONY.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`), `HarmonyAction.${key}`)
      }
    })

    it('all HarmonyCredentialType values MUST start with HARMONY namespace', () => {
      for (const [key, value] of Object.entries(HarmonyCredentialType)) {
        expect(value).toMatch(
          new RegExp(`^${HARMONY.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`),
          `HarmonyCredentialType.${key}`
        )
      }
    })

    it('RDFPredicate MUST define type and subClassOf', () => {
      expect(RDFPredicate.type).toBe(`${RDF}type`)
      expect(RDFPredicate.subClassOf).toBe(`${RDFS}subClassOf`)
    })

    it('XSDDatatype MUST define standard datatypes', () => {
      expect(XSDDatatype.string).toBe(`${XSD}string`)
      expect(XSDDatatype.dateTime).toBe(`${XSD}dateTime`)
      expect(XSDDatatype.integer).toBe(`${XSD}integer`)
      expect(XSDDatatype.boolean).toBe(`${XSD}boolean`)
    })

    it('HARMONY_JSONLD_CONTEXT MUST have all standard namespace prefixes', () => {
      const ctx = HARMONY_JSONLD_CONTEXT['@context']
      expect(ctx.vc).toBe('https://www.w3.org/2018/credentials#')
      expect(ctx.zcap).toBe('https://w3id.org/zcap#')
      expect(ctx.did).toBe('https://www.w3.org/ns/did#')
      expect(ctx.xsd).toBe('http://www.w3.org/2001/XMLSchema#')
      expect(ctx.rdf).toBe('http://www.w3.org/1999/02/22-rdf-syntax-ns#')
      expect(ctx.rdfs).toBe('http://www.w3.org/2000/01/rdf-schema#')
    })

    it('HARMONY_TURTLE MUST reference all core types', () => {
      expect(HARMONY_TURTLE).toContain('harmony:Channel')
      expect(HARMONY_TURTLE).toContain('harmony:Thread')
      expect(HARMONY_TURTLE).toContain('harmony:Role')
      expect(HARMONY_TURTLE).toContain('harmony:Member')
      expect(HARMONY_TURTLE).toContain('harmony:Reaction')
    })

    it('Context MUST define ed25519 and x25519 suite URLs', () => {
      expect(Context.ED25519_2020).toBe('https://w3id.org/security/suites/ed25519-2020/v1')
      expect(Context.X25519_2020).toBe('https://w3id.org/security/suites/x25519-2020/v1')
      expect(Context.HARMONY).toBe('https://harmony.example/context/v1')
    })

    it('Phase 2 types MUST be defined', () => {
      expect(HarmonyType.EncryptedMessage).toBe(`${HARMONY}EncryptedMessage`)
      expect(HarmonyType.DirectMessage).toBe(`${HARMONY}DirectMessage`)
      expect(HarmonyType.ThreadMessage).toBe(`${HARMONY}ThreadMessage`)
      expect(HarmonyType.Presence).toBe(`${HARMONY}Presence`)
      expect(HarmonyType.FederationPeer).toBe(`${HARMONY}FederationPeer`)
      expect(HarmonyType.ModerationAction).toBe(`${HARMONY}ModerationAction`)
    })

    it('Phase 2 predicates MUST be defined', () => {
      expect(HarmonyPredicate.clock).toBe(`${HARMONY}clock`)
      expect(HarmonyPredicate.nonce).toBe(`${HARMONY}nonce`)
      expect(HarmonyPredicate.epoch).toBe(`${HARMONY}epoch`)
      expect(HarmonyPredicate.editedAt).toBe(`${HARMONY}editedAt`)
      expect(HarmonyPredicate.deletedAt).toBe(`${HARMONY}deletedAt`)
      expect(HarmonyPredicate.presenceStatus).toBe(`${HARMONY}presenceStatus`)
      expect(HarmonyPredicate.peerEndpoint).toBe(`${HARMONY}peerEndpoint`)
      expect(HarmonyPredicate.moderator).toBe(`${HARMONY}moderator`)
    })

    it('Phase 2 actions MUST be defined', () => {
      expect(HarmonyAction.ReadChannel).toBe(`${HARMONY}ReadChannel`)
      expect(HarmonyAction.CreateThread).toBe(`${HARMONY}CreateThread`)
      expect(HarmonyAction.SendDM).toBe(`${HARMONY}SendDM`)
      expect(HarmonyAction.ManageMembers).toBe(`${HARMONY}ManageMembers`)
      expect(HarmonyAction.FederateRelay).toBe(`${HARMONY}FederateRelay`)
      expect(HarmonyAction.ModerateContent).toBe(`${HARMONY}ModerateContent`)
    })

    it('Phase 3 mobile predicates MUST be defined', () => {
      expect(HarmonyPredicate.pushToken).toBe(`${HARMONY}pushToken`)
      expect(HarmonyPredicate.pushPlatform).toBe(`${HARMONY}pushPlatform`)
    })

    it('Phase 3 types MUST include InboundWebhook and PushSubscription', () => {
      expect(HarmonyType.InboundWebhook).toBe(`${HARMONY}InboundWebhook`)
      expect(HarmonyType.PushSubscription).toBe(`${HARMONY}PushSubscription`)
      expect(HarmonyType.SearchIndex).toBe(`${HARMONY}SearchIndex`)
      expect(HarmonyType.MetadataIndex).toBe(`${HARMONY}MetadataIndex`)
    })

    it('Phase 3 bot predicates MUST be defined', () => {
      expect(HarmonyPredicate.botDID).toBe(`${HARMONY}botDID`)
      expect(HarmonyPredicate.botStatus).toBe(`${HARMONY}botStatus`)
      expect(HarmonyPredicate.installedBy).toBe(`${HARMONY}installedBy`)
    })

    it('Phase 3 credential predicates MUST be defined', () => {
      expect(HarmonyPredicate.issuerPolicy).toBe(`${HARMONY}issuerPolicy`)
      expect(HarmonyPredicate.transferable).toBe(`${HARMONY}transferable`)
      expect(HarmonyPredicate.aggregateScore).toBe(`${HARMONY}aggregateScore`)
      expect(HarmonyPredicate.contributionScore).toBe(`${HARMONY}contributionScore`)
    })

    it('Phase 3 media actions MUST be defined', () => {
      expect(HarmonyAction.UploadMedia).toBe(`${HARMONY}UploadMedia`)
      expect(HarmonyAction.DeleteMedia).toBe(`${HARMONY}DeleteMedia`)
      expect(HarmonyAction.ManageVoice).toBe(`${HARMONY}ManageVoice`)
      expect(HarmonyAction.ManageWebhooks).toBe(`${HARMONY}ManageWebhooks`)
      expect(HarmonyAction.VoteGovernance).toBe(`${HARMONY}VoteGovernance`)
      expect(HarmonyAction.AuthorizeAgent).toBe(`${HARMONY}AuthorizeAgent`)
    })
  })
})
