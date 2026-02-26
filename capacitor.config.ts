import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'chat.harmony.app',
  appName: 'Harmony',
  webDir: 'packages/ui-app/dist',
  server: { androidScheme: 'https' }
}

export default config
