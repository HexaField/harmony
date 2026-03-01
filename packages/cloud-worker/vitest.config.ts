import { defineWorkersConfig } from '@cloudflare/vitest-pool-workers/config'

export default defineWorkersConfig({
  test: {
    poolOptions: {
      workers: {
        wrangler: { configPath: './wrangler.toml' },
        miniflare: {
          compatibilityDate: '2025-01-01',
          compatibilityFlags: ['nodejs_compat'],
          durableObjects: {
            COMMUNITY: { className: 'CommunityDurableObject', scriptName: 'harmony-cloud' }
          },
          d1Databases: { DB: { name: 'harmony-instances-test' } },
          r2Buckets: ['MEDIA']
        }
      }
    }
  }
})
