// Pressure Valve · 서비스 워커
// 목적: 홈 화면에 설치했을 때 오프라인에서도 앱 셸이 뜨도록 캐싱.
// 서버로 아무것도 전송하지 않는 앱 성격 그대로, 여기서도 외부 요청은 손대지 않고
// 같은 출처(origin)의 GET 요청만 캐싱한다.
//
// v2 변경 — 페이지(HTML)는 네트워크 우선으로 바꿨다.
// 예전엔 HTML까지 캐시 우선(stale-while-revalidate)이라, 새로 배포해도 사용자는
// 예전 화면을 계속 보고 새로고침을 두 번 해야 최신이 되는 문제가 있었다.
// 이제 온라인이면 항상 최신 HTML을 받고, 오프라인일 때만 캐시로 대체한다.
// 아이콘·매니페스트 같은 정적 파일은 기존처럼 캐시 우선으로 빠르게 띄운다.

const CACHE_NAME = 'pressure-valve-v2';
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

function isHtmlRequest(req, url) {
  if (req.mode === 'navigate') return true;
  if (url.pathname === '/' || /\.html$/i.test(url.pathname)) return true;
  var accept = req.headers.get('accept') || '';
  return accept.indexOf('text/html') !== -1;
}

self.addEventListener('fetch', function (event) {
  var req = event.request;
  var url = new URL(req.url);

  // GET 요청, 같은 출처만 다룬다 — 구글 폰트 등 외부 요청은 그대로 네트워크로 흘려보낸다
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;

  // AI 자유 입력 백엔드는 절대 캐싱하지 않는다 (항상 실시간 응답이어야 함)
  if (url.pathname.indexOf('/api/') === 0) return;

  if (isHtmlRequest(req, url)) {
    // 페이지: 네트워크 우선 — 배포 직후에도 바로 최신 화면이 뜬다
    event.respondWith(
      fetch(req)
        .then(function (res) {
          if (res && res.status === 200) {
            var copy = res.clone();
            caches.open(CACHE_NAME).then(function (cache) { cache.put(req, copy); });
          }
          return res;
        })
        .catch(function () {
          // 오프라인이면 캐시로 대체 (없으면 앱 셸이라도)
          return caches.match(req).then(function (cached) {
            return cached || caches.match('/index.html');
          });
        })
    );
    return;
  }

  // 그 외 정적 파일: 캐시 우선 + 백그라운드 갱신
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
        .catch(function () { return cached; });
      return cached || networkFetch;
    })
  );
});
