import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'default',
          include: ['packages/*/test/**/*.spec.ts'],
          exclude: ['packages/ui/**']
        }
      },
      'packages/ui'
    ]
  }
})
