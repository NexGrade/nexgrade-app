// Service worker minimo, escopado so a /minha-agenda -- exigido pelos
// navegadores para permitir "instalar como app" (PWA). Nao faz cache
// agressivo de nada (evita mostrar dados desatualizados da agenda);
// so repassa as requisicoes normalmente.
self.addEventListener("install", (event) => {
  self.skipWaiting();
});
self.addEventListener("activate", (event) => {
  self.clients.claim();
});
self.addEventListener("fetch", (event) => {
  event.respondWith(fetch(event.request));
});
