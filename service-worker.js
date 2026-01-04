/* Inspekto Lite service worker - offline cache for static assets */
const CACHE = "inspekto-lite-v2";
"./assets/icon-192.png",
"./assets/icon-512.png",
"./assets/icon-192-maskable.png",
"./assets/icon-512-maskable.png",

const ASSETS = [
  "./",
  "./index.html",
  "./capture.html",
  "./review.html",
  "./report.html",
  "./settings.html",
  "./assets/styles.css",
  "./assets/app.js",
  "./assets/ui.js",
  "./manifest.json"
];

self.addEventListener("install", (event)=>{
  event.waitUntil(
    caches.open(CACHE).then(cache=>cache.addAll(ASSETS)).then(()=>self.skipWaiting())
  );
});

self.addEventListener("activate", (event)=>{
  event.waitUntil(
    caches.keys().then(keys=>Promise.all(keys.map(k=>k===CACHE?null:caches.delete(k)))).then(()=>self.clients.claim())
  );
});

self.addEventListener("fetch", (event)=>{
  const req = event.request;
  // Network-first for navigation, cache-first for assets
  if(req.mode === "navigate"){
    event.respondWith(
      fetch(req).then(res=>{
        const copy = res.clone();
        caches.open(CACHE).then(c=>c.put(req, copy));
        return res;
      }).catch(()=>caches.match(req).then(r=>r || caches.match("./index.html")))
    );
    return;
  }
  event.respondWith(
    caches.match(req).then(cached=> cached || fetch(req).then(res=>{
      const copy = res.clone();
      caches.open(CACHE).then(c=>c.put(req, copy));
      return res;
    }).catch(()=>cached))
  );
});
