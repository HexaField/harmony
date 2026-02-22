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
  Reaction: `${HARMONY}Reaction`
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
  onMessage: `${HARMONY}onMessage`
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
  VerifyMembership: `${HARMONY}VerifyMembership`
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

// W3C context URLs
export const Context = {
  VC: 'https://www.w3.org/2018/credentials/v1',
  DID: 'https://www.w3.org/ns/did/v1',
  ZCAP: 'https://w3id.org/zcap/v1',
  ED25519_2020: 'https://w3id.org/security/suites/ed25519-2020/v1',
  X25519_2020: 'https://w3id.org/security/suites/x25519-2020/v1',
  HARMONY: 'https://harmony.example/context/v1'
} as const
