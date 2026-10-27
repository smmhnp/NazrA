/** A sourced text renders the correct badge and note. */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let JSDOM, VirtualConsole;
try { ({ JSDOM, VirtualConsole } = await import("jsdom")); }
catch { JSDOM = null; }

function setGlobal(name, value) {
  try { globalThis[name] = value; }
  catch { Object.defineProperty(globalThis, name, { value, configurable: true, writable: true }); }
}

test("متن sourced برچسب «متن با منبع مشخص» و یادداشت درست میگیرد", { skip: !JSDOM }, async (t) => {
  const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
  const virtualConsole = new VirtualConsole();
  const jsdomErrors = [];
  virtualConsole.on("jsdomError", (error) => jsdomErrors.push(error.message));

  const dom = new JSDOM(html, { url: "https://example.test/NazrA/", runScripts: "outside-only", pretendToBeVisual: true, virtualConsole });
  const { window } = dom;
  const { document } = window;
  window.scrollTo = () => {};
  setGlobal("window", window);
  setGlobal("document", document);
  setGlobal("location", window.location);
  setGlobal("localStorage", window.localStorage);
  setGlobal("requestAnimationFrame", (cb) => setTimeout(() => cb(Date.now()), 0));
  setGlobal("cancelAnimationFrame", (id) => clearTimeout(id));
  t.after(() => dom.window.close());

  // Provide a single sourced record before loading app.js.
  // No query so it is the same module instance app.js imports.
  const content = await import("../js/content.js");
  content.TEXT_RECORDS.length = 0;
  content.TEXT_RECORDS.push({
    id: "sourced_prayer_001",
    category: "prayer",
    text: "متن آزمایشی با منبع دقیق و قابل بررسی.",
    source: "نام کتاب، ناشر، صفحهٔ ۱۲۳",
    sourceUrl: null,
    verified: true,
    sourceType: "sourced"
  });
  await import(`../js/app.js?sourced=${Date.now()}`);

  const click = (selector) => document.querySelector(selector)
    .dispatchEvent(new window.MouseEvent("click", { bubbles: true, cancelable: true }));
  click('[data-action="start"]');
  click('[data-category-id="prayer"]');

  assert.equal(document.querySelector("#text-body").textContent, "متن آزمایشی با منبع دقیق و قابل بررسی.");
  assert.equal(document.querySelector("#text-badge").textContent, "متن با منبع مشخص");
  assert.equal(document.querySelector("#text-badge").classList.contains("badge--todo"), false);
  assert.equal(document.querySelector("#text-source").textContent, "نام کتاب، ناشر، صفحهٔ ۱۲۳");
  assert.ok(document.querySelector("#text-note").textContent.includes("فرد آگاه"));
  assert.deepEqual(jsdomErrors.filter((m) => !/Not implemented/i.test(m)), []);
});
