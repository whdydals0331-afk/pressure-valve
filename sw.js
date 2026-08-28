// Pressure Valve · 서비스 워커
// 목적: 홈 화면에 설치했을 때 오프라인에서도 앱 셸이 뜨도록 캐싱.
// 서버로 아무것도 전송하지 않는 앱 성격 그대로, 여기서도 외부 요청은 손대지 않고
// 같은 출처(origin)의 GET 요청만 stale-while-revalidate 방식으로 캐싱한다.

const CACHE_NAME = 'pressure-valve-v1';
const CORE_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png'
];

self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(function (cache) { return cache.addAll(CORE_ASSETS); })
      .then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys()
      .then(function (keys) {
        return Promise.all(
          keys.filter(function (k) { return k !== CACHE_NAME; })
              .map(function (k) { return caches.delete(k); })
        );
      })
      .then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (event) {
  var req = event.request;
  var url = new URL(req.url);

  // GET 요청, 같은 출처만 다룬다 — 구글 폰트 등 외부 요청은 그대로 네트워크로 흘려보낸다
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;

  event.respondWith(
    caches.match(req).then(function (cached) {
      var networkFetch = fetch(req)
        .then(function (res) {
          if (res && res.status === 200) {
            var copy = res.clone();
            caches.open(CACHE_NAME).then(function (cache) { cache.put(req, copy); });
          }
          return res;
        })
        .catch(function () { return cached; }); // 오프라인이면 캐시로 대체
      return cached || networkFetch;
    })
  );
});
