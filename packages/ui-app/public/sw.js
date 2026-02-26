const CACHE_NAME = 'harmony-v1'
const APP_SHELL = ['/', '/index.html']

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)))
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
  )
  self.clients.claim()
})

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url)
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/ws')) return

  event.respondWith(
    caches
      .match(event.request)
      .then((cached) => {
        if (cached) return cached
        return fetch(event.request).then((response) => {
          if (response.ok && event.request.method === 'GET') {
            const clone = response.clone()
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone))
          }
          return response
        })
      })
      .catch(() => caches.match('/index.html'))
  )
})

self.addEventListener('push', (event) => {
  const data = event.data ? event.data.json() : {}
  const title = data.title || 'Harmony'
  const options = {
    body: data.body || '',
    icon: '/icon.svg',
    badge: '/favicon.svg',
    data: data.data || {},
    tag: data.data?.channelId || 'default'
  }
  event.waitUntil(self.registration.showNotification(title, options))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const data = event.notification.data || {}
  let url = '/'
  if (data.channelId) url = `/?channel=${data.channelId}`
  else if (data.dmDID) url = `/?dm=${data.dmDID}`

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if (client.url.includes(self.location.origin)) {
          client.focus()
          client.postMessage({ type: 'notification-tap', data })
          return
        }
      }
      return self.clients.openWindow(url)
    })
  )
})

self.addEventListener('sync', (event) => {
  if (event.tag === 'message-sync') {
    event.waitUntil(
      self.clients.matchAll().then((clients) => {
        for (const client of clients) {
          client.postMessage({ type: 'background-sync', tag: event.tag })
        }
      })
    )
  }
})
