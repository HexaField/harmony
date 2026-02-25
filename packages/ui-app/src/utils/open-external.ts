/** Open a URL in the user's default browser. In Electron, uses shell.openExternal via IPC. */
export function openExternal(url: string): void {
  const desktop = (window as any).__HARMONY_DESKTOP__
  if (desktop?.openExternal) {
    desktop.openExternal(url)
  } else {
    window.open(url, '_blank')
  }
}
