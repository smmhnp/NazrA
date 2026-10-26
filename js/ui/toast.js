/** toast.js — اعلانهای کوتاه و اعلام وضعیت برای صفحهخوانها. */
import { iconSvg } from "./common.js";
import { escapeHtml } from "../lib/utils.js";

export function createToaster({ root, statusRoot } = {}) {
  function announce(message) {
    try { if (statusRoot) statusRoot.textContent = String(message ?? ""); } catch { /*noop*/ }
  }

  function show(message, { type = "info", duration = 3400 } = {}) {
    const text = String(message ?? "").trim();
    if (!text) return;
    announce(text);
    if (!root) return;
    try {
      while (root.children.length >= 2) root.firstElementChild.remove();
      const toast = document.createElement("div");
      toast.className = `toast toast--${type === "error" ? "error" : type === "success" ? "success" : "info"}`;
      const icon = type === "error" ? "close" : type === "success" ? "check" : "info";
      toast.innerHTML = `${iconSvg(icon)}<span>${escapeHtml(text)}</span>`;
      root.appendChild(toast);
      const remove = () => {
        if (!toast.isConnected) return;
        toast.classList.add("is-leaving");
        setTimeout(() => toast.remove(), 220);
      };
      setTimeout(remove, duration);
    } catch { /* اعلان بصری نباید برنامه را متوقف کند */ }
  }

  return {
    show,
    announce,
    info: (m, o) => show(m, o),
    error: (m, o) => show(m, { ...o, type: "error" }),
    success: (m, o) => show(m, { ...o, type: "success" })
  };
}
