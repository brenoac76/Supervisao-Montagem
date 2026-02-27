self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
  // Pass-through simples para permitir que os critérios de instalação do PWA sejam atendidos
  // sem interferir nas chamadas de API do Google Script.
  event.respondWith(fetch(event.request));
});