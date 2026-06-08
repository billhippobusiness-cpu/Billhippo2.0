// When this SW activates (after skipWaiting takes control), navigate every
// open window-client to its current URL.  This forces a real page load
// through the new SW, so users instantly get the freshly deployed JS
// instead of running the old cached bundle.
// This file is imported by the generated sw.js via importScripts().
self.addEventListener('activate', function (event) {
  event.waitUntil(
    self.clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then(function (clients) {
        return Promise.allSettled(
          clients.map(function (client) {
            return client.navigate(client.url);
          })
        );
      })
  );
});
