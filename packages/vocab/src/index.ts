// Namespace URIs
export const HARMONY = 'https://harmony.example/vocab#'
export const VC = 'https://www.w3.org/2018/credentials#'
export const ZCAP = 'https://w3id.org/zcap#'
export const DID = 'https://www.w3.org/ns/did#'
export const XSD = 'http://www.w3.org/2001/XMLSchema#'
export const RDF = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#'
export const RDFS = 'http://www.w3.org/2000/01/rdf-schema#'

// Harmony types
export const HarmonyType = {
  Community: `${HARMONY}Community`,
  Channel: `${HARMONY}Channel`,
  Category: `${HARMONY}Category`,
  Thread: `${HARMONY}Thread`,
  Message: `${HARMONY}Message`,
  Role: `${HARMONY}Role`,
  Member: `${HARMONY}Member`,
  Reaction: `${HARMONY}Reaction`,
  // Phase 2 additions
  EncryptedMessage: `${HARMONY}EncryptedMessage`,
  DirectMessage: `${HARMONY}DirectMessage`,
  ThreadMessage: `${HARMONY}ThreadMessage`,
  Presence: `${HARMONY}Presence`,
  FederationPeer: `${HARMONY}FederationPeer`,
  ModerationAction: `${HARMONY}ModerationAction`,
  // Phase 3 additions
  VoiceRoom: `${HARMONY}VoiceRoom`,
  VoiceParticipant: `${HARMONY}VoiceParticipant`,
  MediaFile: `${HARMONY}MediaFile`,
  LinkPreview: `${HARMONY}LinkPreview`,
  Bot: `${HARMONY}Bot`,
  Webhook: `${HARMONY}Webhook`,
  InboundWebhook: `${HARMONY}InboundWebhook`,
  Proposal: `${HARMONY}Proposal`,
  Constitution: `${HARMONY}Constitution`,
  UserDelegation: `${HARMONY}UserDelegation`,
  AgentAuth: `${HARMONY}AgentAuth`,
  CredentialType: `${HARMONY}CredentialType`,
  Reputation: `${HARMONY}Reputation`,
  SearchIndex: `${HARMONY}SearchIndex`,
  MetadataIndex: `${HARMONY}MetadataIndex`,
  PushSubscription: `${HARMONY}PushSubscription`
} as const

// Harmony predicates
export const HarmonyPredicate = {
  author: `${HARMONY}author`,
  content: `${HARMONY}content`,
  timestamp: `${HARMONY}timestamp`,
  replyTo: `${HARMONY}replyTo`,
  inChannel: `${HARMONY}inChannel`,
  inCategory: `${HARMONY}inCategory`,
  parentThread: `${HARMONY}parentThread`,
  role: `${HARMONY}role`,
  community: `${HARMONY}community`,
  joinedAt: `${HARMONY}joinedAt`,
  permission: `${HARMONY}permission`,
  name: `${HARMONY}name`,
  emoji: `${HARMONY}emoji`,
  reactor: `${HARMONY}reactor`,
  onMessage: `${HARMONY}onMessage`,
  // Phase 2 additions
  clock: `${HARMONY}clock`,
  nonce: `${HARMONY}nonce`,
  epoch: `${HARMONY}epoch`,
  ciphertextRef: `${HARMONY}ciphertextRef`,
  editedAt: `${HARMONY}editedAt`,
  deletedAt: `${HARMONY}deletedAt`,
  presenceStatus: `${HARMONY}presenceStatus`,
  customStatus: `${HARMONY}customStatus`,
  lastSeen: `${HARMONY}lastSeen`,
  peerEndpoint: `${HARMONY}peerEndpoint`,
  peerDID: `${HARMONY}peerDID`,
  federatedWith: `${HARMONY}federatedWith`,
  moderator: `${HARMONY}moderator`,
  moderationTarget: `${HARMONY}moderationTarget`,
  moderationReason: `${HARMONY}moderationReason`,
  moderationExpiry: `${HARMONY}moderationExpiry`,
  // Phase 3 additions — Voice
  maxParticipants: `${HARMONY}maxParticipants`,
  quality: `${HARMONY}quality`,
  speaking: `${HARMONY}speaking`,
  screenSharing: `${HARMONY}screenSharing`,
  e2eeEnabled: `${HARMONY}e2eeEnabled`,
  channelId: `${HARMONY}channelId`,
  // Phase 3 additions — Media
  filename: `${HARMONY}filename`,
  contentType: `${HARMONY}contentType`,
  encryptedSize: `${HARMONY}encryptedSize`,
  checksum: `${HARMONY}checksum`,
  thumbnailId: `${HARMONY}thumbnailId`,
  uploadedBy: `${HARMONY}uploadedBy`,
  // Phase 3 additions — Bot
  botDID: `${HARMONY}botDID`,
  botStatus: `${HARMONY}botStatus`,
  installedBy: `${HARMONY}installedBy`,
  // Phase 3 additions — Governance
  proposalStatus: `${HARMONY}proposalStatus`,
  quorumKind: `${HARMONY}quorumKind`,
  quorumThreshold: `${HARMONY}quorumThreshold`,
  votingPeriod: `${HARMONY}votingPeriod`,
  executionDelay: `${HARMONY}executionDelay`,
  contestPeriod: `${HARMONY}contestPeriod`,
  fromDID: `${HARMONY}fromDID`,
  toDID: `${HARMONY}toDID`,
  reason: `${HARMONY}reason`,
  agentDID: `${HARMONY}agentDID`,
  auditLevel: `${HARMONY}auditLevel`,
  maxActionsPerHour: `${HARMONY}maxActionsPerHour`,
  version: `${HARMONY}version`,
  // Phase 3 additions — Credentials
  issuerPolicy: `${HARMONY}issuerPolicy`,
  transferable: `${HARMONY}transferable`,
  badgeEmoji: `${HARMONY}badgeEmoji`,
  badgeColor: `${HARMONY}badgeColor`,
  aggregateScore: `${HARMONY}aggregateScore`,
  contributionScore: `${HARMONY}contributionScore`,
  messageCount: `${HARMONY}messageCount`,
  subject: `${HARMONY}subject`,
  score: `${HARMONY}score`,
  // Phase 3 additions — Mobile
  pushToken: `${HARMONY}pushToken`,
  pushPlatform: `${HARMONY}pushPlatform`,
  // Discord reconciliation
  discordId: `${HARMONY}discordId`,
  discordUsername: `${HARMONY}discordUsername`,
  did: `${HARMONY}did`
} as const

// Harmony VC types
export const HarmonyCredentialType = {
  DiscordIdentityCredential: `${HARMONY}DiscordIdentityCredential`,
  CommunityMembershipCredential: `${HARMONY}CommunityMembershipCredential`,
  EmailVerificationCredential: `${HARMONY}EmailVerificationCredential`,
  OAuthIdentityCredential: `${HARMONY}OAuthIdentityCredential`
} as const

// Harmony ZCAP actions
export const HarmonyAction = {
  SendMessage: `${HARMONY}SendMessage`,
  DeleteMessage: `${HARMONY}DeleteMessage`,
  AddReaction: `${HARMONY}AddReaction`,
  ManageChannel: `${HARMONY}ManageChannel`,
  ManageRoles: `${HARMONY}ManageRoles`,
  MuteUser: `${HARMONY}MuteUser`,
  BanUser: `${HARMONY}BanUser`,
  InviteMember: `${HARMONY}InviteMember`,
  RelayMessage: `${HARMONY}RelayMessage`,
  VerifyMembership: `${HARMONY}VerifyMembership`,
  // Phase 2 additions
  ReadChannel: `${HARMONY}ReadChannel`,
  CreateThread: `${HARMONY}CreateThread`,
  SendDM: `${HARMONY}SendDM`,
  ManageMembers: `${HARMONY}ManageMembers`,
  FederateRelay: `${HARMONY}FederateRelay`,
  FederateVerify: `${HARMONY}FederateVerify`,
  ModerateContent: `${HARMONY}ModerateContent`,
  // Phase 3 additions
  JoinVoice: `${HARMONY}JoinVoice`,
  ManageVoice: `${HARMONY}ManageVoice`,
  UploadMedia: `${HARMONY}UploadMedia`,
  DeleteMedia: `${HARMONY}DeleteMedia`,
  InstallBot: `${HARMONY}InstallBot`,
  ManageWebhooks: `${HARMONY}ManageWebhooks`,
  ProposeGovernance: `${HARMONY}ProposeGovernance`,
  VoteGovernance: `${HARMONY}VoteGovernance`,
  DelegateUser: `${HARMONY}DelegateUser`,
  AuthorizeAgent: `${HARMONY}AuthorizeAgent`,
  IssueCustomCredential: `${HARMONY}IssueCustomCredential`
} as const

// RDF predicates
export const RDFPredicate = {
  type: `${RDF}type`,
  subClassOf: `${RDFS}subClassOf`
} as const

// XSD datatypes
export const XSDDatatype = {
  string: `${XSD}string`,
  dateTime: `${XSD}dateTime`,
  integer: `${XSD}integer`,
  boolean: `${XSD}boolean`
} as const

// Ontology content as string constants (isomorphic — no Node.js fs/path APIs)
export const HARMONY_TURTLE = `@prefix harmony: <https://harmony.example/vocab#> .
@prefix vc:      <https://www.w3.org/2018/credentials#> .
@prefix zcap:    <https://w3id.org/zcap#> .
@prefix did:     <https://www.w3.org/ns/did#> .
@prefix xsd:     <http://www.w3.org/2001/XMLSchema#> .
@prefix rdf:     <http://www.w3.org/1999/02/22-rdf-syntax-ns#> .
@prefix rdfs:    <http://www.w3.org/2000/01/rdf-schema#> .

harmony:Community     rdfs:subClassOf  rdfs:Resource .
harmony:Channel       rdfs:subClassOf  rdfs:Resource .
harmony:Category      rdfs:subClassOf  rdfs:Resource .
harmony:Thread        rdfs:subClassOf  harmony:Channel .
harmony:Message       rdfs:subClassOf  rdfs:Resource .
harmony:Role          rdfs:subClassOf  rdfs:Resource .
harmony:Member        rdfs:subClassOf  rdfs:Resource .
harmony:Reaction      rdfs:subClassOf  rdfs:Resource .

harmony:author        rdfs:domain  harmony:Message ;    rdfs:range  did:DID .
harmony:content       rdfs:domain  harmony:Message ;    rdfs:range  xsd:string .
harmony:timestamp     rdfs:domain  harmony:Message ;    rdfs:range  xsd:dateTime .
harmony:replyTo       rdfs:domain  harmony:Message ;    rdfs:range  harmony:Message .
harmony:inChannel     rdfs:domain  harmony:Message ;    rdfs:range  harmony:Channel .
harmony:inCategory    rdfs:domain  harmony:Channel ;    rdfs:range  harmony:Category .
harmony:parentThread  rdfs:domain  harmony:Thread ;     rdfs:range  harmony:Message .
harmony:role          rdfs:domain  harmony:Member ;     rdfs:range  harmony:Role .
harmony:community     rdfs:domain  harmony:Member ;     rdfs:range  harmony:Community .
harmony:joinedAt      rdfs:domain  harmony:Member ;     rdfs:range  xsd:dateTime .
harmony:permission    rdfs:domain  harmony:Role ;       rdfs:range  xsd:string .
harmony:name          rdfs:domain  rdfs:Resource ;      rdfs:range  xsd:string .
harmony:emoji         rdfs:domain  harmony:Reaction ;   rdfs:range  xsd:string .
harmony:reactor       rdfs:domain  harmony:Reaction ;   rdfs:range  harmony:Member .
harmony:onMessage     rdfs:domain  harmony:Reaction ;   rdfs:range  harmony:Message .

harmony:DiscordIdentityCredential       rdfs:subClassOf  vc:VerifiableCredential .
harmony:CommunityMembershipCredential   rdfs:subClassOf  vc:VerifiableCredential .
harmony:EmailVerificationCredential     rdfs:subClassOf  vc:VerifiableCredential .
harmony:OAuthIdentityCredential         rdfs:subClassOf  vc:VerifiableCredential .

harmony:SendMessage       rdf:type  zcap:Action .
harmony:DeleteMessage     rdf:type  zcap:Action .
harmony:AddReaction       rdf:type  zcap:Action .
harmony:ManageChannel     rdf:type  zcap:Action .
harmony:ManageRoles       rdf:type  zcap:Action .
harmony:MuteUser          rdf:type  zcap:Action .
harmony:BanUser           rdf:type  zcap:Action .
harmony:InviteMember      rdf:type  zcap:Action .
harmony:RelayMessage      rdf:type  zcap:Action .
harmony:VerifyMembership  rdf:type  zcap:Action .
`

export const HARMONY_JSONLD_CONTEXT = {
  '@context': {
    harmony: 'https://harmony.example/vocab#',
    vc: 'https://www.w3.org/2018/credentials#',
    zcap: 'https://w3id.org/zcap#',
    did: 'https://www.w3.org/ns/did#',
    xsd: 'http://www.w3.org/2001/XMLSchema#',
    rdf: 'http://www.w3.org/1999/02/22-rdf-syntax-ns#',
    rdfs: 'http://www.w3.org/2000/01/rdf-schema#',
    Community: 'harmony:Community',
    Channel: 'harmony:Channel',
    Category: 'harmony:Category',
    Thread: 'harmony:Thread',
    Message: 'harmony:Message',
    Role: 'harmony:Role',
    Member: 'harmony:Member',
    Reaction: 'harmony:Reaction',
    author: { '@id': 'harmony:author', '@type': '@id' },
    content: { '@id': 'harmony:content', '@type': 'xsd:string' },
    timestamp: { '@id': 'harmony:timestamp', '@type': 'xsd:dateTime' },
    replyTo: { '@id': 'harmony:replyTo', '@type': '@id' },
    inChannel: { '@id': 'harmony:inChannel', '@type': '@id' },
    inCategory: { '@id': 'harmony:inCategory', '@type': '@id' },
    parentThread: { '@id': 'harmony:parentThread', '@type': '@id' },
    role: { '@id': 'harmony:role', '@type': '@id' },
    community: { '@id': 'harmony:community', '@type': '@id' },
    joinedAt: { '@id': 'harmony:joinedAt', '@type': 'xsd:dateTime' },
    permission: { '@id': 'harmony:permission', '@type': 'xsd:string' },
    name: { '@id': 'harmony:name', '@type': 'xsd:string' },
    emoji: { '@id': 'harmony:emoji', '@type': 'xsd:string' },
    reactor: { '@id': 'harmony:reactor', '@type': '@id' },
    onMessage: { '@id': 'harmony:onMessage', '@type': '@id' },
    DiscordIdentityCredential: 'harmony:DiscordIdentityCredential',
    CommunityMembershipCredential: 'harmony:CommunityMembershipCredential',
    EmailVerificationCredential: 'harmony:EmailVerificationCredential',
    OAuthIdentityCredential: 'harmony:OAuthIdentityCredential',
    SendMessage: 'harmony:SendMessage',
    DeleteMessage: 'harmony:DeleteMessage',
    AddReaction: 'harmony:AddReaction',
    ManageChannel: 'harmony:ManageChannel',
    ManageRoles: 'harmony:ManageRoles',
    MuteUser: 'harmony:MuteUser',
    BanUser: 'harmony:BanUser',
    InviteMember: 'harmony:InviteMember',
    RelayMessage: 'harmony:RelayMessage',
    VerifyMembership: 'harmony:VerifyMembership'
  }
} as const

// W3C context URLs
export const Context = {
  VC: 'https://www.w3.org/2018/credentials/v1',
  DID: 'https://www.w3.org/ns/did/v1',
  ZCAP: 'https://w3id.org/zcap/v1',
  ED25519_2020: 'https://w3id.org/security/suites/ed25519-2020/v1',
  X25519_2020: 'https://w3id.org/security/suites/x25519-2020/v1',
  HARMONY: 'https://harmony.example/context/v1'
} as const
