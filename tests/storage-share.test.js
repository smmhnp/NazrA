import test from "node:test";
import assert from "node:assert/strict";
import { createStateStore, DEFAULT_STATE } from "../js/lib/storage.js";
import { isValidEmail, buildMailto, getAppUrl, shareOrDownload, copyText, inviteFriend, buildFileName } from "../js/lib/share.js";

function fakeStorage(initial = {}) {
  const map = new Map(Object.entries(initial));
  return {
    getItem: (k) => map.has(k) ? map.get(k) : null,
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
    _map: map
  };
}

test("JSON خراب به مقدار پیشفرض برمیگردد و خطا گزارش میشود", () => {
  const backend = fakeStorage({ key: "{not-json" });
  let reported = 0;
  const store = createStateStore({ key: "key", storage: backend, onError: () => { reported += 1; } });
  const state = store.load();
  assert.equal(state.step, DEFAULT_STATE.step);
  assert.equal(state.currentTextId, null);
  assert.equal(reported, 1);
});

test("نبود localStorage برنامه را متوقف نمیکند", () => {
  const throwing = { getItem() { throw new Error("blocked"); }, setItem() { throw new Error("blocked"); }, removeItem() { throw new Error("blocked"); } };
  const store = createStateStore({ key: "k", storage: throwing });
  const s = store.save({ step: "text", category: "prayer" });
  assert.equal(s.step, "text");
  assert.equal(s.category, "prayer");
});

test("پیشرفت و تنظیمات رابط ذخیره و بازیابی میشود", () => {
  const backend = fakeStorage();
  const first = createStateStore({ key: "state", storage: backend });
  first.save({ step: "final", category: "prayer", seenTextIds: ["a", "b"], ui: { postcardTemplate: "band", selfieTemplate: "glow" } });
  const second = createStateStore({ key: "state", storage: backend });
  const loaded = second.load();
  assert.equal(loaded.step, "final");
  assert.deepEqual(loaded.seenTextIds, ["a", "b"]);
  assert.equal(loaded.ui.postcardTemplate, "band");
});

test("قسمتهای ناامن ورودی پاکسازی میشوند", () => {
  const store = createStateStore({ key: "k", storage: fakeStorage({ k: JSON.stringify({ step: "<script>", category: 12, seenTextIds: [1, "ok", null] }) }) });
  const s = store.load();
  assert.equal(s.step, "welcome");
  assert.equal(s.category, null);
  assert.deepEqual(s.seenTextIds, ["ok"]);
});

test("mailto با encodeURIComponent ساخته میشود و TODO لینک ناقص نمیدهد", () => {
  assert.equal(isValidEmail("TODO"), false);
  assert.equal(buildMailto({ email: "TODO", subject: "x", body: "y" }), null);
  const link = buildMailto({ email: "a@b.ir", subject: "سلام & تست", body: "خط۱\nخط۲" });
  assert.ok(link.startsWith("mailto:a@b.ir?subject="));
  assert.ok(link.includes(encodeURIComponent("سلام & تست")));
  assert.ok(link.includes(encodeURIComponent("خط۱\nخط۲")));
  assert.ok(!link.includes(" "));
});

test("getAppUrl لینک معتبر همان وباپ را در زیرمسیر میدهد", () => {
  assert.equal(getAppUrl({ href: "https://x.test/NazrA/index.html?a=1#b" }), "https://x.test/NazrA/");
  assert.equal(getAppUrl({}), "");
});

test("ترتیب اشتراکگذاری: فایل → دانلود → mailto → راهنما", async () => {
  const opened = [];
  const downloaded = [];
  const base = { blob: { fake: true }, fileName: "c.png", email: "a@b.ir", subject: "س", body: "م", guide: "عکس را پیوست کنید", download: (b, n) => { downloaded.push(n); return true; }, openLink: (u) => opened.push(u) };
  globalThis.__fakeFileForShare = true;

  const navShare = { canShare: () => true, share: async () => {} };
  assert.equal((await shareOrDownload({ ...base, navigator: navShare })).outcome, "shared");
  assert.equal(downloaded.length, 0);

  const navCancel = { canShare: () => true, share: async () => { const e = new Error("cancel"); e.name = "AbortError"; throw e; } };
  assert.equal((await shareOrDownload({ ...base, navigator: navCancel })).outcome, "cancelled");

  const navNoFile = { share: async () => {}, canShare: () => false };
  const fallback = await shareOrDownload({ ...base, navigator: navNoFile });
  assert.equal(fallback.outcome, "downloaded-email");
  assert.equal(downloaded.length, 1);
  assert.ok(opened[0].startsWith("mailto:a@b.ir?"));

  const noEmail = await shareOrDownload({ ...base, email: "TODO", navigator: {} });
  assert.equal(noEmail.outcome, "downloaded-no-email");
  assert.equal(opened.length, 1, "ایمیل تنظیمنشده لینک اضافهای نساخته است");

  const navError = { canShare: () => true, share: async () => { throw new Error("denied"); } };
  assert.equal((await shareOrDownload({ ...base, navigator: navError })).outcome, "share-error-download");
  assert.equal((await shareOrDownload({ ...base, blob: null })).outcome, "image-error");
  assert.equal((await shareOrDownload({ ...base, download: () => false, navigator: {} })).outcome, "download-failed");
  delete globalThis.__fakeFileForShare;
});

test("کپی و دعوت، مسیر جایگزین را activ میکند", async () => {
  let copied = "";
  assert.equal(await copyText("سلام", { navigator: { clipboard: { writeText: async (v) => { copied = v; } } }, document: {} }), true);
  assert.equal(copied, "سلام");
  assert.equal(await copyText("", { navigator: {}, document: {} }), false);

  const nav = { share: async (p) => { assert.ok(p.url); } };
  assert.equal((await inviteFriend({ title: "t", text: "x", url: "https://a.test/", navigator: nav })).outcome, "shared");
  let fellBack = false;
  assert.equal((await inviteFriend({ title: "t", text: "x", navigator: {}, onFallback: () => { fellBack = true; } })).outcome, "fallback");
  assert.equal(fellBack, true);
  assert.ok(buildFileName().endsWith(".png"));
});
