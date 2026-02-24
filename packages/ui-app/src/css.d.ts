declare module '*.css' {
  const content: string
  export default content
}

interface ImportMetaEnv {
  readonly VITE_PORTAL_URL?: string
  readonly VITE_DEFAULT_SERVER_URL?: string
  readonly VITE_CLOUD_API_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
