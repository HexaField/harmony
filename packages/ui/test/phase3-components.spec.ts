import { describe, it, expect } from 'vitest'
import { useVoiceChannel } from '../src/components/Voice/VoiceChannel.js'
import { useVoiceControls } from '../src/components/Voice/VoiceControls.js'
import { useVoiceParticipantGrid } from '../src/components/Voice/VoiceParticipantGrid.js'
import { useVoicePip } from '../src/components/Voice/VoicePip.js'
import { useFileUpload } from '../src/components/Media/FileUpload.js'
import { useFilePreview } from '../src/components/Media/FilePreview.js'
import { useLinkPreview } from '../src/components/Media/LinkPreview.js'
import { useImageGallery } from '../src/components/Media/ImageGallery.js'
import { useSearchBar } from '../src/components/Search/SearchBar.js'
import { useSearchResults } from '../src/components/Search/SearchResults.js'
import { useSearchFilters } from '../src/components/Search/SearchFilters.js'
import { useBotDirectory } from '../src/components/Bot/BotDirectory.js'
import { useBotInstall } from '../src/components/Bot/BotInstall.js'
import { useBotSettings } from '../src/components/Bot/BotSettings.js'
import { useWebhookManager } from '../src/components/Bot/WebhookManager.js'
import { useProposalList } from '../src/components/Governance/ProposalList.js'
import { useProposalDetail } from '../src/components/Governance/ProposalDetail.js'
import { useCreateProposal } from '../src/components/Governance/CreateProposal.js'
import { useConstitutionView } from '../src/components/Governance/ConstitutionView.js'
import { useDelegationManager } from '../src/components/Governance/DelegationManager.js'
import { useCredentialPortfolio } from '../src/components/Credentials/CredentialPortfolio.js'
import { useCredentialDetail } from '../src/components/Credentials/CredentialDetail.js'
import { useCredentialTypeEditor } from '../src/components/Credentials/CredentialTypeEditor.js'
import { useReputationCard } from '../src/components/Credentials/ReputationCard.js'
import { useIssueCredential } from '../src/components/Credentials/IssueCredential.js'
import { useNotificationCenter } from '../src/components/Notifications/NotificationCenter.js'
import { useNotificationItem } from '../src/components/Notifications/NotificationItem.js'
import { useNotificationSettings } from '../src/components/Notifications/NotificationSettings.js'

import type { VoiceParticipant } from '@harmony/voice'
import type { Proposal, ProposalDef, ConstitutionDoc, UserDelegation } from '@harmony/governance'
import type { RegisteredBot, BotPermission } from '@harmony/bot-api'
import type { HeldCredential, CredentialType, ReputationProfile } from '@harmony/credentials'
import type { SearchResult } from '@harmony/search'
import type { PushNotification } from '@harmony/mobile'
import type { LinkPreview as LinkPreviewData } from '@harmony/media'

function mockParticipant(overrides?: Partial<VoiceParticipant>): VoiceParticipant {
  return {
    did: 'did:key:z6MkTest',
    joinedAt: '2026-01-01T00:00:00Z',
    audioEnabled: true,
    videoEnabled: false,
    screenSharing: false,
    speaking: false,
    ...overrides
  }
}

function mockBot(overrides?: Partial<RegisteredBot>): RegisteredBot {
  return {
    id: 'bot-1',
    manifest: {
      did: 'did:key:bot',
      name: 'Test Bot',
      description: 'A test bot',
      version: '1.0.0',
      permissions: ['SendMessage' as BotPermission],
      events: ['message.created'],
      entrypoint: 'index.js'
    },
    communityId: 'c1',
    status: 'running',
    installedBy: 'did:key:admin',
    installedAt: '2026-01-01T00:00:00Z',
    capabilities: ['cap-1'],
    resourceUsage: { memoryMB: 64, cpuPercent: 5, messagesPerMinute: 10, apiCallsPerMinute: 20 },
    ...overrides
  }
}

function mockProposal(overrides?: Partial<Proposal>): Proposal {
  return {
    id: 'proposal-1',
    communityId: 'c1',
    def: {
      communityId: 'c1',
      title: 'Test Proposal',
      description: 'A test proposal',
      actions: [{ kind: 'create-channel', params: { name: 'new-channel' } }],
      quorum: { kind: 'threshold', threshold: 3 },
      votingPeriod: 604800,
      executionDelay: 86400,
      contestPeriod: 86400
    },
    status: 'active',
    createdBy: 'did:key:alice',
    createdAt: '2026-02-20T00:00:00Z',
    signatures: [],
    quorumMet: false,
    ...overrides
  }
}

function mockCredential(overrides?: Partial<HeldCredential>): HeldCredential {
  return {
    id: 'cred-1',
    type: 'VerifiedArtist',
    typeName: 'Verified Artist',
    issuer: 'did:key:z6MkIssuer',
    issuedAt: '2026-01-15T00:00:00Z',
    status: 'active',
    fields: { portfolio: 'https://example.com' },
    transferable: true,
    ...overrides
  }
}

function mockNotification(overrides?: Partial<PushNotification>): PushNotification {
  return {
    id: 'notif-1',
    title: 'New Message',
    body: 'Alice: Hello everyone!',
    data: { type: 'message', communityId: 'c1', channelId: 'ch1' },
    receivedAt: new Date().toISOString(),
    ...overrides
  }
}

describe('@harmony/ui Phase 3 Extensions', () => {
  // ── Voice ──

  describe('VoiceChannel', () => {
    it('MUST report participant count', () => {
      const ctrl = useVoiceChannel({
        channelId: 'vc1',
        channelName: 'General Voice',
        participants: [mockParticipant(), mockParticipant({ did: 'did:key:bob' })],
        isConnected: false,
        onJoin: () => {},
        onLeave: () => {}
      })
      expect(ctrl.participantCount()).toBe(2)
      expect(ctrl.channelName()).toBe('General Voice')
    })

    it('MUST count speaking participants', () => {
      const ctrl = useVoiceChannel({
        channelId: 'vc1',
        channelName: 'Voice',
        participants: [
          mockParticipant({ speaking: true }),
          mockParticipant({ did: 'did:key:b', speaking: false }),
          mockParticipant({ did: 'did:key:c', speaking: true })
        ],
        isConnected: true,
        onJoin: () => {},
        onLeave: () => {}
      })
      expect(ctrl.speakingCount()).toBe(2)
    })

    it('MUST trigger join callback', () => {
      let joined = false
      const ctrl = useVoiceChannel({
        channelId: 'vc1',
        channelName: 'V',
        participants: [],
        isConnected: false,
        onJoin: () => {
          joined = true
        },
        onLeave: () => {}
      })
      ctrl.join()
      expect(joined).toBe(true)
    })
  })

  describe('VoiceControls', () => {
    it('MUST expose toggle state', () => {
      const ctrl = useVoiceControls({
        audioEnabled: true,
        videoEnabled: false,
        screenSharing: false,
        onToggleAudio: () => {},
        onToggleVideo: () => {},
        onToggleScreenShare: () => {},
        onDisconnect: () => {}
      })
      expect(ctrl.audioEnabled()).toBe(true)
      expect(ctrl.videoEnabled()).toBe(false)
    })

    it('MUST trigger disconnect callback', () => {
      let disconnected = false
      const ctrl = useVoiceControls({
        audioEnabled: true,
        videoEnabled: false,
        screenSharing: false,
        onToggleAudio: () => {},
        onToggleVideo: () => {},
        onToggleScreenShare: () => {},
        onDisconnect: () => {
          disconnected = true
        }
      })
      ctrl.disconnect()
      expect(disconnected).toBe(true)
    })
  })

  describe('VoiceParticipantGrid', () => {
    it('MUST compute grid columns from participant count', () => {
      expect(useVoiceParticipantGrid({ participants: [mockParticipant()] }).gridCols()).toBe('grid-cols-1')
      expect(
        useVoiceParticipantGrid({
          participants: Array(4)
            .fill(null)
            .map((_, i) => mockParticipant({ did: `d${i}` }))
        }).gridCols()
      ).toBe('grid-cols-2')
      expect(
        useVoiceParticipantGrid({
          participants: Array(9)
            .fill(null)
            .map((_, i) => mockParticipant({ did: `d${i}` }))
        }).gridCols()
      ).toBe('grid-cols-3')
      expect(
        useVoiceParticipantGrid({
          participants: Array(16)
            .fill(null)
            .map((_, i) => mockParticipant({ did: `d${i}` }))
        }).gridCols()
      ).toBe('grid-cols-4')
    })

    it('MUST track count', () => {
      const ctrl = useVoiceParticipantGrid({ participants: [mockParticipant(), mockParticipant({ did: 'b' })] })
      expect(ctrl.count()).toBe(2)
    })
  })

  describe('VoicePip', () => {
    it('MUST expose channel info', () => {
      const ctrl = useVoicePip({
        channelName: 'Voice',
        participantCount: 5,
        duration: '2:30',
        audioEnabled: true,
        onToggleAudio: () => {},
        onExpand: () => {},
        onDisconnect: () => {}
      })
      expect(ctrl.channelName()).toBe('Voice')
      expect(ctrl.participantCount()).toBe(5)
      expect(ctrl.duration()).toBe('2:30')
    })
  })

  // ── Media ──

  describe('FileUpload', () => {
    it('MUST compute max size', () => {
      const ctrl = useFileUpload({ onUpload: () => {}, maxSizeMB: 10 })
      expect(ctrl.maxSizeMB()).toBe(10)
    })

    it('MUST default to 25MB max', () => {
      const ctrl = useFileUpload({ onUpload: () => {} })
      expect(ctrl.maxSizeMB()).toBe(25)
    })

    it('MUST track drag state', () => {
      const ctrl = useFileUpload({ onUpload: () => {} })
      expect(ctrl.dragOver()).toBe(false)
      ctrl.setDragOver(true)
      expect(ctrl.dragOver()).toBe(true)
    })
  })

  describe('FilePreview', () => {
    it('MUST detect file type from content type', () => {
      expect(useFilePreview({ filename: 'a.jpg', contentType: 'image/jpeg', size: 100 }).fileType()).toBe('image')
      expect(useFilePreview({ filename: 'a.mp4', contentType: 'video/mp4', size: 100 }).fileType()).toBe('video')
      expect(useFilePreview({ filename: 'a.mp3', contentType: 'audio/mpeg', size: 100 }).fileType()).toBe('audio')
      expect(useFilePreview({ filename: 'a.pdf', contentType: 'application/pdf', size: 100 }).fileType()).toBe('file')
    })

    it('MUST format size display', () => {
      expect(useFilePreview({ filename: 'a', contentType: 'x', size: 500 }).sizeDisplay()).toBe('500 B')
      expect(useFilePreview({ filename: 'a', contentType: 'x', size: 2048 }).sizeDisplay()).toBe('2.0 KB')
      expect(useFilePreview({ filename: 'a', contentType: 'x', size: 5 * 1024 * 1024 }).sizeDisplay()).toBe('5.0 MB')
    })
  })

  describe('LinkPreview', () => {
    it('MUST expose preview data', () => {
      const preview: LinkPreviewData = {
        url: 'https://example.com',
        title: 'Example',
        description: 'A site',
        siteName: 'Example',
        type: 'article',
        fetchedAt: '',
        ttlSeconds: 3600
      }
      const ctrl = useLinkPreview({ preview })
      expect(ctrl.title()).toBe('Example')
      expect(ctrl.description()).toBe('A site')
      expect(ctrl.siteName()).toBe('Example')
    })

    it('MUST fall back to URL for title', () => {
      const preview: LinkPreviewData = {
        url: 'https://example.com',
        type: 'unknown',
        fetchedAt: '',
        ttlSeconds: 3600
      }
      const ctrl = useLinkPreview({ preview })
      expect(ctrl.title()).toBe('https://example.com')
    })
  })

  describe('ImageGallery', () => {
    it('MUST track current image index', () => {
      const ctrl = useImageGallery({
        images: [{ url: 'a.jpg' }, { url: 'b.jpg' }, { url: 'c.jpg' }]
      })
      expect(ctrl.currentIndex()).toBe(0)
      expect(ctrl.count()).toBe(3)
      expect(ctrl.hasNext()).toBe(true)
      expect(ctrl.hasPrev()).toBe(false)
    })

    it('MUST navigate between images', () => {
      const ctrl = useImageGallery({
        images: [{ url: 'a.jpg' }, { url: 'b.jpg' }, { url: 'c.jpg' }]
      })
      ctrl.next()
      expect(ctrl.currentIndex()).toBe(1)
      ctrl.next()
      expect(ctrl.currentIndex()).toBe(2)
      ctrl.next() // should not go past end
      expect(ctrl.currentIndex()).toBe(2)
      ctrl.prev()
      expect(ctrl.currentIndex()).toBe(1)
    })

    it('MUST manage lightbox state', () => {
      const ctrl = useImageGallery({ images: [{ url: 'a.jpg' }] })
      expect(ctrl.lightboxOpen()).toBe(false)
      ctrl.openLightbox(0)
      expect(ctrl.lightboxOpen()).toBe(true)
      ctrl.closeLightbox()
      expect(ctrl.lightboxOpen()).toBe(false)
    })
  })

  // ── Search ──

  describe('SearchBar', () => {
    it('MUST track query text', () => {
      const ctrl = useSearchBar({ onSearch: () => {} })
      expect(ctrl.query()).toBe('')
      ctrl.setQuery('hello')
      expect(ctrl.query()).toBe('hello')
      expect(ctrl.hasQuery()).toBe(true)
    })

    it('MUST clear query', () => {
      const ctrl = useSearchBar({ onSearch: () => {} })
      ctrl.setQuery('test')
      ctrl.clear()
      expect(ctrl.query()).toBe('')
    })

    it('MUST trigger search on submit', () => {
      let searched = ''
      const ctrl = useSearchBar({
        onSearch: (q) => {
          searched = q
        }
      })
      ctrl.setQuery('hello world')
      ctrl.submit()
      expect(searched).toBe('hello world')
    })

    it('MUST toggle filters visibility', () => {
      const ctrl = useSearchBar({ onSearch: () => {} })
      expect(ctrl.showFilters()).toBe(false)
      ctrl.toggleFilters()
      expect(ctrl.showFilters()).toBe(true)
    })
  })

  describe('SearchResults', () => {
    it('MUST report result count', () => {
      const results: SearchResult[] = [
        {
          messageId: 'm1',
          channelId: 'ch1',
          communityId: 'c1',
          authorDID: 'did:key:a',
          snippet: 'hello',
          timestamp: '2026-01-01',
          score: 10
        }
      ]
      const ctrl = useSearchResults({ results, loading: false, query: 'hello', onResultClick: () => {} })
      expect(ctrl.resultCount()).toBe(1)
      expect(ctrl.hasResults()).toBe(true)
    })

    it('MUST handle empty results', () => {
      const ctrl = useSearchResults({ results: [], loading: false, query: 'nothing', onResultClick: () => {} })
      expect(ctrl.hasResults()).toBe(false)
    })
  })

  describe('SearchFilters', () => {
    it('MUST count active filters', () => {
      const ctrl = useSearchFilters({
        filters: { channelId: 'ch1', authorDID: 'did:key:a' },
        onChange: () => {}
      })
      expect(ctrl.activeCount()).toBe(2)
    })

    it('MUST clear filters', () => {
      let cleared = false
      const ctrl = useSearchFilters({
        filters: { channelId: 'ch1' },
        onChange: (f) => {
          if (Object.keys(f).length === 0) cleared = true
        }
      })
      ctrl.clear()
      expect(cleared).toBe(true)
    })
  })

  // ── Bot ──

  describe('BotDirectory', () => {
    it('MUST count running bots', () => {
      const bots = [mockBot(), mockBot({ id: 'bot-2', status: 'stopped' })]
      const ctrl = useBotDirectory({ bots, onSelect: () => {}, onInstallNew: () => {} })
      expect(ctrl.runningCount()).toBe(1)
      expect(ctrl.botCount()).toBe(2)
    })

    it('MUST trigger select callback', () => {
      let selected = ''
      const ctrl = useBotDirectory({
        bots: [mockBot()],
        onSelect: (id) => {
          selected = id
        },
        onInstallNew: () => {}
      })
      ctrl.select('bot-1')
      expect(selected).toBe('bot-1')
    })
  })

  describe('BotInstall', () => {
    it('MUST track approved permissions', () => {
      const ctrl = useBotInstall({
        botName: 'Bot',
        botDescription: 'desc',
        requestedPermissions: ['SendMessage', 'ReadMessage'] as BotPermission[],
        onInstall: () => {},
        onCancel: () => {}
      })
      expect(ctrl.approvedCount()).toBe(2)
      ctrl.togglePermission('SendMessage' as BotPermission)
      expect(ctrl.approvedCount()).toBe(1)
    })

    it('MUST manage install steps', () => {
      const ctrl = useBotInstall({
        botName: 'Bot',
        botDescription: 'desc',
        requestedPermissions: ['SendMessage'] as BotPermission[],
        onInstall: () => {},
        onCancel: () => {}
      })
      expect(ctrl.step()).toBe('review')
      ctrl.nextStep()
      expect(ctrl.step()).toBe('confirm')
      ctrl.prevStep()
      expect(ctrl.step()).toBe('review')
    })
  })

  describe('BotSettings', () => {
    it('MUST expose bot info', () => {
      const ctrl = useBotSettings({
        bot: mockBot(),
        onStart: () => {},
        onStop: () => {},
        onUninstall: () => {},
        onUpdatePermissions: () => {}
      })
      expect(ctrl.name()).toBe('Test Bot')
      expect(ctrl.isRunning()).toBe(true)
      expect(ctrl.status()).toBe('running')
    })

    it('MUST manage uninstall confirmation', () => {
      const ctrl = useBotSettings({
        bot: mockBot(),
        onStart: () => {},
        onStop: () => {},
        onUninstall: () => {},
        onUpdatePermissions: () => {}
      })
      expect(ctrl.confirmUninstall()).toBe(false)
      ctrl.requestUninstall()
      expect(ctrl.confirmUninstall()).toBe(true)
      ctrl.cancelUninstall()
      expect(ctrl.confirmUninstall()).toBe(false)
    })
  })

  describe('WebhookManager', () => {
    it('MUST track webhook count', () => {
      const ctrl = useWebhookManager({
        webhooks: [
          { id: 'wh1', channelId: 'ch1', url: 'https://x.com', events: [], active: true, displayName: 'Hook' }
        ],
        channels: [{ id: 'ch1', name: 'general' }],
        onCreate: () => {},
        onDelete: () => {},
        onToggle: () => {}
      })
      expect(ctrl.webhookCount()).toBe(1)
    })

    it('MUST validate create form', () => {
      const ctrl = useWebhookManager({
        webhooks: [],
        channels: [{ id: 'ch1', name: 'general' }],
        onCreate: () => {},
        onDelete: () => {},
        onToggle: () => {}
      })
      expect(ctrl.canCreate()).toBe(false)
      ctrl.setNewUrl('https://x.com')
      ctrl.setNewName('My Hook')
      ctrl.setNewChannel('ch1')
      expect(ctrl.canCreate()).toBe(true)
    })
  })

  // ── Governance ──

  describe('ProposalList', () => {
    it('MUST list proposals', () => {
      const ctrl = useProposalList({
        proposals: [mockProposal(), mockProposal({ id: 'p2', status: 'passed' })],
        onSelect: () => {},
        onFilterChange: () => {},
        onCreateNew: () => {}
      })
      expect(ctrl.proposalCount()).toBe(2)
    })

    it('MUST provide status color', () => {
      const ctrl = useProposalList({
        proposals: [],
        onSelect: () => {},
        onFilterChange: () => {},
        onCreateNew: () => {}
      })
      expect(ctrl.statusColor('active')).toBe('text-blue-400')
      expect(ctrl.statusColor('passed')).toBe('text-green-400')
      expect(ctrl.statusColor('rejected')).toBe('text-red-400')
    })
  })

  describe('ProposalDetail', () => {
    it('MUST detect if user has voted', () => {
      const proposal = mockProposal({
        signatures: [{ signerDID: 'did:key:me', signedAt: '', proof: {} as any, vote: 'approve' }]
      })
      const ctrl = useProposalDetail({
        proposal,
        myDID: 'did:key:me',
        onVote: () => {},
        onExecute: () => {},
        onCancel: () => {},
        onBack: () => {}
      })
      expect(ctrl.hasVoted()).toBe(true)
      expect(ctrl.canVote()).toBe(false)
    })

    it('MUST count approve/reject votes', () => {
      const proposal = mockProposal({
        signatures: [
          { signerDID: 'a', signedAt: '', proof: {} as any, vote: 'approve' },
          { signerDID: 'b', signedAt: '', proof: {} as any, vote: 'reject' },
          { signerDID: 'c', signedAt: '', proof: {} as any, vote: 'approve' }
        ]
      })
      const ctrl = useProposalDetail({
        proposal,
        myDID: 'did:key:x',
        onVote: () => {},
        onExecute: () => {},
        onCancel: () => {},
        onBack: () => {}
      })
      expect(ctrl.approveCount()).toBe(2)
      expect(ctrl.rejectCount()).toBe(1)
    })

    it('MUST allow execution when passed', () => {
      const ctrl = useProposalDetail({
        proposal: mockProposal({ status: 'passed' }),
        myDID: 'x',
        onVote: () => {},
        onExecute: () => {},
        onCancel: () => {},
        onBack: () => {}
      })
      expect(ctrl.canExecute()).toBe(true)
      expect(ctrl.canVote()).toBe(false)
    })
  })

  describe('CreateProposal', () => {
    it('MUST manage multi-step flow', () => {
      const ctrl = useCreateProposal({
        communityId: 'c1',
        onSubmit: () => {},
        onCancel: () => {}
      })
      expect(ctrl.step()).toBe('info')
      ctrl.nextStep()
      expect(ctrl.step()).toBe('actions')
      ctrl.nextStep()
      expect(ctrl.step()).toBe('quorum')
      ctrl.prevStep()
      expect(ctrl.step()).toBe('actions')
    })

    it('MUST manage actions', () => {
      const ctrl = useCreateProposal({
        communityId: 'c1',
        onSubmit: () => {},
        onCancel: () => {}
      })
      ctrl.addAction('create-channel')
      ctrl.addAction('create-role')
      expect(ctrl.actionCount()).toBe(2)
      ctrl.removeAction(0)
      expect(ctrl.actionCount()).toBe(1)
    })

    it('MUST validate before submit', () => {
      const ctrl = useCreateProposal({
        communityId: 'c1',
        onSubmit: () => {},
        onCancel: () => {}
      })
      expect(ctrl.canSubmit()).toBe(false)
      ctrl.setTitle('Test')
      expect(ctrl.canSubmit()).toBe(false) // no actions
      ctrl.addAction('create-channel')
      expect(ctrl.canSubmit()).toBe(true)
    })
  })

  describe('ConstitutionView', () => {
    it('MUST expose constitution info', () => {
      const constitution: ConstitutionDoc = {
        communityId: 'c1',
        rules: [
          { id: 'r1', description: 'Be nice', constraint: { kind: 'require-role', params: {} }, immutable: true }
        ],
        ratifiedAt: '2026-01-01T00:00:00Z',
        ratifiedBy: ['did:key:a', 'did:key:b'],
        version: 2
      }
      const ctrl = useConstitutionView({ constitution })
      expect(ctrl.ruleCount()).toBe(1)
      expect(ctrl.version()).toBe(2)
      expect(ctrl.ratifierCount()).toBe(2)
    })
  })

  describe('DelegationManager', () => {
    it('MUST count delegations', () => {
      const ctrl = useDelegationManager({
        delegationsFrom: [
          {
            id: 'd1',
            fromDID: 'me',
            toDID: 'bob',
            capabilities: ['Send'],
            createdAt: '',
            revocable: true,
            active: true
          }
        ],
        delegationsTo: [],
        myDID: 'me',
        availableCapabilities: ['Send', 'Read'],
        onCreate: () => {},
        onRevoke: () => {}
      })
      expect(ctrl.outgoingCount()).toBe(1)
      expect(ctrl.incomingCount()).toBe(0)
    })

    it('MUST validate create form', () => {
      const ctrl = useDelegationManager({
        delegationsFrom: [],
        delegationsTo: [],
        myDID: 'me',
        availableCapabilities: ['Send'],
        onCreate: () => {},
        onRevoke: () => {}
      })
      expect(ctrl.canCreate()).toBe(false)
      ctrl.setTargetDID('did:key:bob')
      ctrl.toggleCap('Send')
      expect(ctrl.canCreate()).toBe(true)
    })

    it('MUST toggle tabs', () => {
      const ctrl = useDelegationManager({
        delegationsFrom: [],
        delegationsTo: [],
        myDID: 'me',
        availableCapabilities: [],
        onCreate: () => {},
        onRevoke: () => {}
      })
      expect(ctrl.tab()).toBe('outgoing')
      ctrl.setTab('incoming')
      expect(ctrl.tab()).toBe('incoming')
    })
  })

  // ── Credentials ──

  describe('CredentialPortfolio', () => {
    it('MUST count active credentials', () => {
      const creds = [
        mockCredential(),
        mockCredential({ id: 'c2', status: 'expired' }),
        mockCredential({ id: 'c3', status: 'revoked' })
      ]
      const ctrl = useCredentialPortfolio({ credentials: creds, onSelect: () => {}, onExport: () => {} })
      expect(ctrl.totalCount()).toBe(3)
      expect(ctrl.activeCount()).toBe(1)
    })

    it('MUST filter credentials', () => {
      const creds = [mockCredential(), mockCredential({ id: 'c2', status: 'expired' })]
      const ctrl = useCredentialPortfolio({ credentials: creds, onSelect: () => {}, onExport: () => {} })
      expect(ctrl.filteredCount()).toBe(2) // all by default
      ctrl.setFilter('active')
      expect(ctrl.filteredCount()).toBe(1)
      ctrl.setFilter('expired')
      expect(ctrl.filteredCount()).toBe(1)
    })
  })

  describe('CredentialDetail', () => {
    it('MUST expose credential info', () => {
      const ctrl = useCredentialDetail({
        credential: mockCredential(),
        onBack: () => {}
      })
      expect(ctrl.typeName()).toBe('Verified Artist')
      expect(ctrl.status()).toBe('active')
      expect(ctrl.transferable()).toBe(true)
      expect(ctrl.canPresent()).toBe(true)
    })

    it('MUST expose fields', () => {
      const ctrl = useCredentialDetail({
        credential: mockCredential({ fields: { skill: 'painting', level: 'expert' } }),
        onBack: () => {}
      })
      expect(ctrl.fields().length).toBe(2)
    })

    it('MUST not allow presenting non-transferable', () => {
      const ctrl = useCredentialDetail({
        credential: mockCredential({ transferable: false }),
        onBack: () => {}
      })
      expect(ctrl.canPresent()).toBe(false)
    })
  })

  describe('CredentialTypeEditor', () => {
    it('MUST manage schema fields', () => {
      const ctrl = useCredentialTypeEditor({ onSave: () => {}, onCancel: () => {} })
      expect(ctrl.fieldCount()).toBe(0)
      ctrl.addField()
      ctrl.addField()
      expect(ctrl.fieldCount()).toBe(2)
      ctrl.removeField(0)
      expect(ctrl.fieldCount()).toBe(1)
    })

    it('MUST validate name is required', () => {
      const ctrl = useCredentialTypeEditor({ onSave: () => {}, onCancel: () => {} })
      expect(ctrl.canSave()).toBe(false)
      ctrl.setName('Test Type')
      expect(ctrl.canSave()).toBe(true)
    })
  })

  describe('ReputationCard', () => {
    it('MUST categorize score', () => {
      const profile = (score: number): ReputationProfile => ({
        did: 'did:key:x',
        communities: [],
        credentials: [],
        aggregateScore: score,
        lastUpdated: ''
      })
      expect(useReputationCard({ reputation: profile(85) }).scoreLabel()).toBe('Excellent')
      expect(useReputationCard({ reputation: profile(60) }).scoreLabel()).toBe('Good')
      expect(useReputationCard({ reputation: profile(30) }).scoreLabel()).toBe('Fair')
      expect(useReputationCard({ reputation: profile(10) }).scoreLabel()).toBe('New')
    })

    it('MUST count communities and credentials', () => {
      const ctrl = useReputationCard({
        reputation: {
          did: 'did:key:x',
          communities: [
            {
              communityId: 'c1',
              communityName: 'A',
              memberSince: '',
              roles: [],
              credentials: [],
              messageCount: 0,
              contributionScore: 0
            },
            {
              communityId: 'c2',
              communityName: 'B',
              memberSince: '',
              roles: [],
              credentials: [],
              messageCount: 0,
              contributionScore: 0
            }
          ],
          credentials: [
            {
              credentialId: 'cr1',
              typeId: 't1',
              typeName: 'T1',
              issuingCommunity: 'c1',
              issuedAt: '',
              transferable: true,
              verified: true
            }
          ],
          aggregateScore: 50,
          lastUpdated: ''
        }
      })
      expect(ctrl.communityCount()).toBe(2)
      expect(ctrl.credentialCount()).toBe(1)
    })
  })

  describe('IssueCredential', () => {
    it('MUST validate required fields before issue', () => {
      const credType: CredentialType = {
        id: 'ct1',
        communityId: 'c1',
        def: {
          name: 'Artist',
          description: '',
          revocable: true,
          transferable: false,
          schema: { fields: [{ name: 'skill', type: 'string', required: true }] },
          issuerPolicy: { kind: 'admin-only' },
          displayConfig: { showInMemberList: true, showOnMessages: true, priority: 0 }
        },
        createdAt: '',
        createdBy: '',
        active: true,
        issuedCount: 0
      }
      const ctrl = useIssueCredential({ credentialType: credType, onIssue: () => {}, onCancel: () => {} })
      expect(ctrl.canIssue()).toBe(false)
      ctrl.setSubjectDID('did:key:bob')
      expect(ctrl.canIssue()).toBe(false) // missing required field
      ctrl.updateField('skill', 'painting')
      expect(ctrl.canIssue()).toBe(true)
    })
  })

  // ── Notifications ──

  describe('NotificationCenter', () => {
    it('MUST count notifications', () => {
      const ctrl = useNotificationCenter({
        notifications: [mockNotification(), mockNotification({ id: 'n2' })],
        open: true,
        onClose: () => {},
        onNotificationClick: () => {},
        onClearAll: () => {}
      })
      expect(ctrl.count()).toBe(2)
      expect(ctrl.hasNotifications()).toBe(true)
    })

    it('MUST detect empty state', () => {
      const ctrl = useNotificationCenter({
        notifications: [],
        open: true,
        onClose: () => {},
        onNotificationClick: () => {},
        onClearAll: () => {}
      })
      expect(ctrl.hasNotifications()).toBe(false)
    })
  })

  describe('NotificationItem', () => {
    it('MUST determine icon by type', () => {
      expect(
        useNotificationItem({
          notification: mockNotification({ data: { type: 'message' } }),
          onClick: () => {}
        }).typeIcon()
      ).toBe('💬')
      expect(
        useNotificationItem({ notification: mockNotification({ data: { type: 'dm' } }), onClick: () => {} }).typeIcon()
      ).toBe('✉️')
      expect(
        useNotificationItem({
          notification: mockNotification({ data: { type: 'mention' } }),
          onClick: () => {}
        }).typeIcon()
      ).toBe('@')
      expect(
        useNotificationItem({
          notification: mockNotification({ data: { type: 'voice' } }),
          onClick: () => {}
        }).typeIcon()
      ).toBe('🔊')
    })
  })

  describe('NotificationSettings', () => {
    it('MUST count enabled and muted channels', () => {
      const ctrl = useNotificationSettings({
        channels: [
          { channelId: 'ch1', channelName: 'general', enabled: true, mentions: true, muted: false },
          { channelId: 'ch2', channelName: 'random', enabled: false, mentions: false, muted: true }
        ],
        pushEnabled: true,
        onTogglePush: () => {},
        onUpdateChannel: () => {}
      })
      expect(ctrl.enabledCount()).toBe(1)
      expect(ctrl.mutedCount()).toBe(1)
      expect(ctrl.pushEnabled()).toBe(true)
    })
  })
})
