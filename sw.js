// ── SERVICE WORKER ───────────────────────────────────────────
// Las notificaciones (nueva tarea, cambios, inicio de clase, resumen
// diario 5:30am) YA NO se calculan aquí. Un Service Worker se apaga
// cuando no hay pestañas abiertas, así que un setInterval() dentro de
// él nunca dispararía algo a horas fijas de forma confiable.
//
// En su lugar, Supabase (pg_cron + un trigger + una Edge Function)
// envía un Web Push real a este dispositivo cuando corresponde, y
// este archivo solo se encarga de MOSTRAR esa notificación, incluso
// con el navegador cerrado. Ver "Notificaciones-Push-Setup.sql" y
// "supabase/functions/send-push" para la configuración del servidor.

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(clients.claim());
});

// Recibir un Web Push del servidor y mostrarlo
self.addEventListener('push', (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch (e) {
    payload = { title: 'Horario', body: event.data ? event.data.text() : '' };
  }

  const title = payload.title || 'Horario';
  const options = {
    body: payload.body || '',
    icon: 'colegio.png',
    badge: 'colegio.png',
    vibrate: [200, 100, 200],
    tag: payload.tag || 'horario',
    renotify: true,
    requireInteraction: payload.urgency === 'high',
    data: { url: payload.url || './' }
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

// Clic en la notificación: enfocar o abrir la app
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = (event.notification.data && event.notification.data.url) || './';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      for (const client of windowClients) {
        if (client.url.includes('index.html') && 'focus' in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
    })
  );
});

// Si el navegador rota la suscripción push automáticamente, hay que
// volver a registrarla en Supabase o se dejarán de recibir avisos.
self.addEventListener('pushsubscriptionchange', (event) => {
  event.waitUntil(
    (async () => {
      const clientsList = await clients.matchAll({ type: 'window' });
      clientsList.forEach((c) => c.postMessage({ type: 'PUSH_SUBSCRIPTION_CHANGED' }));
    })()
  );
});
