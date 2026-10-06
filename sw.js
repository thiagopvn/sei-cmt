// Service worker: guarda o app para funcionar sem internet e mostra notificações.
const VERSION = 'rotina-geral-v4';
const FIREBASE = 'https://www.gstatic.com/firebasejs/12.12.0';
const SDK = ['firebase-app.js', 'firebase-auth.js', 'firebase-database.js'].map((f) => `${FIREBASE}/${f}`);
const ASSETS = [
  './',
  'index.html',
  'manifest.webmanifest',
  'css/app.css',
  'assets/favicon-48.png',
  'assets/logo-128.png',
  'assets/logo-256.png',
  'assets/icon-192.png',
  'assets/icon-512.png',
  'assets/apple-touch-icon.png',
  'js/main.js',
  'js/store.js',
  'js/actions.js',
  'js/timer.js',
  'js/notify.js',
  'js/install.js',
  'js/sample.js',
  'js/lib/dates.js',
  'js/lib/util.js',
  'js/lib/icons.js',
  'js/domain/recurrence.js',
  'js/domain/tasks.js',
  'js/domain/events.js',
  'js/domain/shifts.js',
  'js/domain/finance.js',
  'js/domain/agenda.js',
  'js/domain/insights.js',
  'js/ui/overlay.js',
  'js/ui/fields.js',
  'js/ui/parts.js',
  'js/ui/quickadd.js',
  'js/ui/charts.js',
  'js/ui/bus.js',
  'js/forms/task.js',
  'js/forms/event.js',
  'js/forms/service.js',
  'js/forms/finance.js',
  'js/views/inicio.js',
  'js/views/agenda.js',
  'js/views/tarefas.js',
  'js/views/escala.js',
  'js/views/financas.js',
  'js/views/ajustes.js',
  'js/views/login.js',
  'js/cloud/config.js',
  'js/cloud/sync.js',
  'js/cloud/cloud.js',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then(async (c) => {
    await c.addAll(ASSETS);
    // SDK do Firebase (para abrir sem internet); se falhar, é baixado no primeiro uso.
    await c.addAll(SDK).catch(() => {});
  }).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  // SDK do Firebase: arquivos versionados, nunca mudam → cache primeiro.
  if (req.url.startsWith(FIREBASE)) {
    e.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((res) => {
      if (res.ok) {
        const copy = res.clone();
        caches.open(VERSION).then((c) => c.put(req, copy));
      }
      return res;
    })));
    return;
  }
  if (new URL(req.url).origin !== location.origin) return;
  // App: rede primeiro (sempre a versão mais nova quando online); cache quando offline.
  e.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(VERSION).then((c) => c.put(req, copy));
        }
        return res;
      })
      .catch(() => caches.match(req, { ignoreSearch: true }).then((r) => r || caches.match('index.html'))),
  );
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      const open = list.find((c) => 'focus' in c);
      if (open) return open.focus();
      return self.clients.openWindow('./#/inicio');
    }),
  );
});
