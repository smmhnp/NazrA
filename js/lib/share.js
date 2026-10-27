/** Serverless sharing/download; browser deps are injectable for tests. */
import { isTodo } from "./utils.js";

export function isValidEmail(email) {
  if (typeof email !== "string" || isTodo(email)) return false;
  const trimmed = email.trim();
  if (trimmed.length > 254 || /\s/.test(trimmed)) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed);
}

/** Build a mailto link with fully encoded subject and body. */
export function buildMailto({ email, subject, body } = {}) {
  if (!isValidEmail(email)) return null;
  return `mailto:${email.trim()}?subject=${encodeURIComponent(String(subject ?? ""))}&body=${encodeURIComponent(String(body ?? ""))}`;
}

export function buildFileName(prefix = "nazra-card") {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  return `${prefix}-${stamp}.png`;
}

/** Download a Blob locally; creates no network request. */
export function defaultDownload(blob, fileName) {
  try {
    if (typeof document === "undefined" || typeof URL === "undefined" || !URL.createObjectURL) return false;
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName;
    link.rel = "noopener";
    link.style.display = "none";
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => { try { URL.revokeObjectURL(url); } catch { /*noop*/ } }, 1000);
    return true;
  } catch {
    return false;
  }
}

function defaultOpenLink(url) {
  // Clicking an anchor is less disruptive to the PWA than assigning location.
  try {
    if (typeof document !== "undefined" && typeof document.createElement === "function") {
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.rel = "noopener";
      anchor.style.display = "none";
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      return true;
    }
  } catch { /* Fall through to the legacy method. */ }
  try {
    if (typeof window !== "undefined" && typeof window.location?.assign === "function") {
      window.location.assign(url);
      return true;
    }
  } catch { /*noop*/ }
  return false;
}

function makeFile(blob, fileName) {
  try {
    if (typeof File === "undefined") return null;
    return new File([blob], fileName, { type: "image/png" });
  } catch {
    return null;
  }
}

/** Order: canShare(files) -> share -> download -> mailto -> guide. */
export async function shareOrDownload({
  blob,
  fileName = "nazra-card.png",
  shareText = "",
  email = "",
  subject = "",
  body = "",
  guide = "عکس را به پیام پیوست کنید.",
  navigator: nav = globalThis.navigator,
  download = defaultDownload,
  openLink = defaultOpenLink,
  messages = {}
} = {}) {
  if (!blob) return { outcome: "image-error", guide: "", downloaded: false };

  const file = makeFile(blob, fileName);
  const canShareFiles = Boolean(file && nav?.canShare && nav?.share);
  if (canShareFiles) {
    let supported = false;
    try { supported = Boolean(nav.canShare({ files: [file] })); } catch { supported = false; }
    if (supported) {
      try {
        await nav.share({ files: [file], text: shareText });
        return { outcome: "shared", guide: "", downloaded: false };
      } catch (error) {
        if (error?.name === "AbortError") {
          return { outcome: "cancelled", guide: "", downloaded: false };
        }
        // A real share error falls through to the download path.
        return fallbackDownload({ error, wasError: true });
      }
    }
  }

  return fallbackDownload({ error: null, wasError: false });

  function fallbackDownload({ error, wasError }) {
    const downloaded = Boolean(download?.(blob, fileName));
    if (!downloaded) return { outcome: "download-failed", guide: "", downloaded: false };
    const mailto = buildMailto({ email, subject, body });
    if (mailto) {
      openLink?.(mailto);
      return { outcome: wasError ? "share-error-download" : "downloaded-email", guide, downloaded: true };
    }
    return {
      outcome: wasError ? "share-error-download-no-email" : "downloaded-no-email",
      guide,
      downloaded: true
    };
  }
}

/** Copy text via the Clipboard API with a legacy fallback. */
export async function copyText(text, { navigator: nav = globalThis.navigator, document: doc = globalThis.document } = {}) {
  const value = String(text ?? "");
  if (!value) return false;
  try {
    if (nav?.clipboard?.writeText) {
      await nav.clipboard.writeText(value);
      return true;
    }
  } catch { /* Fall through to the legacy method. */ }
  try {
    if (!doc?.body || !doc.createElement) return false;
    const area = doc.createElement("textarea");
    area.value = value;
    area.setAttribute("readonly", "");
    area.style.position = "fixed";
    area.style.opacity = "0";
    doc.body.appendChild(area);
    area.select();
    const ok = typeof doc.execCommand === "function" ? doc.execCommand("copy") : false;
    area.remove();
    return Boolean(ok);
  } catch {
    return false;
  }
}

/** Canonical app URL without query/hash (works under Pages subpaths). */
export function getAppUrl(locationLike = globalThis.location) {
  try {
    if (!locationLike?.href) return "";
    const url = new URL(".", locationLike.href);
    url.search = "";
    url.hash = "";
    return url.href;
  } catch {
    return "";
  }
}

/** Invite a friend via Web Share, or show copy options. */
export async function inviteFriend({
  title = "", text = "", url = "",
  navigator: nav = globalThis.navigator,
  onFallback = () => {}
} = {}) {
  const payload = { title, text };
  if (url) payload.url = url;
  if (nav?.share) {
    try {
      await nav.share(payload);
      return { outcome: "shared" };
    } catch (error) {
      if (error?.name === "AbortError") return { outcome: "cancelled" };
      // Other errors fall back to copy.
    }
  }
  onFallback();
  return { outcome: "fallback" };
}
