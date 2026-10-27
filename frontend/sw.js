const CACHE="abs-dashboard-runtime-v4";
self.addEventListener("install",e=>e.waitUntil(self.skipWaiting()));
self.addEventListener("activate",e=>e.waitUntil((async()=>{const keys=await caches.keys();await Promise.all(keys.filter(k=>k.startsWith("abs-dashboard-runtime-")&&k!==CACHE).map(k=>caches.delete(k)));await self.clients.claim()})()));
self.addEventListener("fetch",e=>{if(e.request.method!=="GET"||new URL(e.request.url).origin!==self.location.origin)return;e.respondWith(fetch(e.request,{cache:"no-store"}).then(r=>{if(r.ok){const copy=r.clone();caches.open(CACHE).then(c=>c.put(e.request,copy)).catch(()=>{})}return r}).catch(()=>caches.match(e.request))) });
