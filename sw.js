/* sw.js — Service Worker نسخهدار و آفلاینمحور.            */
/* نسخهٔ کش توسط «npm run sw:version» از روی محتوای فایلها ساخته میشود. */

const CACHE_VERSION = "nazra-2a7f7e25b26c";
const CACHE_NAME = `nazra-static-${CACHE_VERSION}`;
const CACHE_PREFIX = "nazra-static-";

/* فهرست منابع اصلی (توسط scripts/bump-sw.mjs خوانده میشود — JSON معتبر نگهدارید). */
const APP_SHELL = [
  "./",
  "./index.html",
  "./manifest.json",
  "./css/style.css",
  "./css/components.css",
  "./css/animations.css",
  "./js/app.js",
  "./js/config.js",
  "./js/content.js",
  "./js/card-engine.js",
  "./js/lib/utils.js",
  "./js/lib/validation.js",
  "./js/lib/selection.js",
  "./js/lib/storage.js",
  "./js/lib/time.js",
  "./js/lib/quiz-engine.js",
  "./js/lib/share.js",
  "./js/ui/common.js",
  "./js/ui/toast.js",
  "./js/ui/quiz.js",
  "./js/ui/postcard.js",
  "./js/ui/selfie.js",
  "./assets/logo.svg",
  "./assets/icons/icon.svg",
  "./assets/icons/icon-192.png",
  "./assets/icons/icon-512.png",
  "./assets/icons/icon-maskable-512.png",
  "./assets/icons/apple-touch-icon.png",
  "./assets/fonts/vazirmatn/Vazirmatn-Regular.woff2",
  "./assets/fonts/vazirmatn/Vazirmatn-SemiBold.woff2",
  "./assets/fonts/vazirmatn/Vazirmatn-ExtraBold.woff2"
];

const OFFLINE_HTML = `<!doctype html>
<html lang="fa" dir="rtl"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>آفلاین — دانشگاه شاندیز</title>
<style>
body{margin:0;min-height:100dvh;display:grid;place-items:center;background:#0E0F12;color:#EDE8DC;
font-family:Vazirmatn,Tahoma,system-ui,sans-serif;padding:24px;text-align:center}
div{max-width:34ch;border:1px solid rgba(201,162,75,.2);border-radius:22px;padding:28px;background:#16181D}
h1{font-size:20px;color:#C9A24B;margin:0 0 12px}p{font-size:14px;line-height:2;color:#AAA69D;margin:0 0 20px}
button{font:inherit;font-weight:700;min-height:52px;width:100%;border:0;border-radius:16px;
background:#C9A24B;color:#14140F;cursor:pointer}
</style></head><body><div>
<h1>ارتباط در دسترس نیست</h1>
<p>نسخهٔ آفلاین برنامه روی این دستگاه ذخیره نشده است. پس از اتصال به اینترنت، یکبار برنامه را باز کنید تا برای دفعات بعد ذخیره شود.</p>
<button type="button" onclick="location.reload()">تلاش دوباره</button>
</div></body></html>`;

const IS_DEV = ["localhost", "127.0.0.1", "[::1]"].includes(self.location.hostname);

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await Promise.allSettled(APP_SHELL.map(async (entry) => {
      try {
        const request = new Request(entry, { cache: IS_DEV ? "reload" : "default" });
        const response = await fetch(request);
        if (response && response.ok) await cache.put(entry, response.clone());
      } catch { /* یک فایل ازدسترفته نباید نصب را متوقف کند */ }
    }));
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys
      .filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME)
      .map((key) => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener("message", (event) => {
  if (event.data === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return; // منابع خارجی هرگز کش یا رهگیری نمیشوند

  if (request.mode === "navigate") {
    event.respondWith((async () => {
      try {
        const network = await fetch(request);
        if (network && network.ok) {
          const cache = await caches.open(CACHE_NAME);
          await cache.put("./index.html", network.clone());
        }
        return network;
      } catch {
        const cached = await caches.match("./index.html") ?? await caches.match("./");
        return cached ?? new Response(OFFLINE_HTML, {
          status: 200,
          headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" }
        });
      }
    })());
    return;
  }

  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(request);

    if (IS_DEV) {
      // محیط توسعه: همیشه تازهترین فایل از شبکه؛ هنگام قطعی، کش.
      try {
        const network = await fetch(request, { cache: "no-store" });
        if (network && network.ok) await cache.put(request, network.clone());
        return network;
      } catch {
        return cached ?? Response.error();
      }
    }

    if (cached) {
      // stale-while-revalidate: پاسخ فوری از کش، بهروزرسانی در پسزمینه.
      fetch(request).then((network) => {
        if (network && network.ok) return cache.put(request, network.clone());
      }).catch(() => {});
      return cached;
    }

    try {
      const network = await fetch(request);
      if (network && network.ok) await cache.put(request, network.clone());
      return network;
    } catch {
      return Response.error();
    }
  })());
});
