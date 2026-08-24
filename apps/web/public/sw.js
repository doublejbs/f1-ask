// 서비스 워커 (docs/30-app-service.md §1 PWA). 설치형·오프라인 셸을 제공한다.
//
// 전략:
//   - /api/* : 캐시하지 않는다(라이브 데이터는 항상 네트워크).
//   - /_next/static, /icons : stale-while-revalidate(정적 자산).
//   - 내비게이션 : network-first, 실패 시 캐시/오프라인 셸(/en).
// 푸시 알림(§3)은 아래 push 핸들러를 채우면 된다 — 지금은 자리만 둔다.

const CACHE = "racepilot-v1";
const OFFLINE_FALLBACK = "/en";

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)),
      );
      await self.clients.claim();
    })(),
  );
});

const staleWhileRevalidate = async (request) => {
  const cache = await caches.open(CACHE);
  const cached = await cache.match(request);
  const network = fetch(request)
    .then((response) => {
      if (response.ok) {
        cache.put(request, response.clone());
      }

      return response;
    })
    .catch(() => cached);

  return cached || network;
};

const networkFirst = async (request) => {
  const cache = await caches.open(CACHE);

  try {
    const response = await fetch(request);

    if (response.ok) {
      cache.put(request, response.clone());
    }

    return response;
  } catch (error) {
    const cached = await cache.match(request);

    return cached || (await cache.match(OFFLINE_FALLBACK)) || Response.error();
  }
};

self.addEventListener("fetch", (event) => {
  const { request } = event;

  if (request.method !== "GET") {
    return;
  }

  const url = new URL(request.url);

  // 동일 출처만 다룬다(외부 뉴스/이미지 등은 브라우저 기본 처리).
  if (url.origin !== self.location.origin) {
    return;
  }

  // 라이브 데이터·서버 라우트는 항상 네트워크.
  if (url.pathname.startsWith("/api/")) {
    return;
  }

  if (
    url.pathname.startsWith("/_next/static") ||
    url.pathname.startsWith("/icons/")
  ) {
    event.respondWith(staleWhileRevalidate(request));

    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(networkFirst(request));
  }
});

// 푸시 알림(§3) 자리표시. 워커(Cloud Functions)가 FCM 으로 보낸 신호를 여기서 표시한다.
self.addEventListener("push", (event) => {
  if (!event.data) {
    return;
  }

  const payload = (() => {
    try {
      return event.data.json();
    } catch (error) {
      return { title: "Racepilot", body: event.data.text() };
    }
  })();

  event.waitUntil(
    self.registration.showNotification(payload.title ?? "Racepilot", {
      body: payload.body,
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      data: payload.data,
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = event.notification.data?.url ?? "/en";

  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clients) => {
        const existing = clients.find((client) => "focus" in client);

        if (existing) {
          existing.navigate(target);

          return existing.focus();
        }

        return self.clients.openWindow(target);
      }),
  );
});
