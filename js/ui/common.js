/** common.js — ابزارهای مشترک رابط (بدون منطق کسبوکار). */
import { CARD_WIDTH, CARD_HEIGHT, renderCardScaled } from "../card-engine.js";
import { escapeHtml } from "../lib/utils.js";

export function setLoading(button, loading, label = "در حال انجام…") {
  if (!button) return;
  if (loading) {
    if (button.dataset.loading === "true") return;
    button.dataset.loading = "true";
    button.dataset.originalHtml = button.innerHTML;
    button.dataset.originalDisabled = button.disabled ? "true" : "false";
    button.disabled = true;
    button.classList.add("is-loading");
    button.innerHTML = `<span>${escapeHtml(label)}</span>`;
  } else {
    if (button.dataset.loading !== "true") return;
    button.classList.remove("is-loading");
    button.innerHTML = button.dataset.originalHtml ?? button.innerHTML;
    button.disabled = button.dataset.originalDisabled === "true";
    delete button.dataset.loading;
    delete button.dataset.originalHtml;
    delete button.dataset.originalDisabled;
  }
}

export function iconSvg(id, className = "icon") {
  return `<svg class="${className}" aria-hidden="true"><use href="#i-${id}"></use></svg>`;
}

/** ساخت دکمههای قالب بهصورت دادهمحور. */
export function buildTemplateChips(container, templates, { selected, onSelect } = {}) {
  if (!container) return { getSelected: () => selected, setSelected: () => {} };
  let current = templates.some((t) => t.id === selected) ? selected : templates[0]?.id ?? "gold";
  container.innerHTML = templates.map((t) => `
    <button type="button" class="chip" data-template-id="${escapeHtml(t.id)}"
            aria-pressed="${t.id === current}" title="${escapeHtml(t.hint ?? "")}">
      ${escapeHtml(t.label)}
    </button>`).join("");
  const buttons = [...container.querySelectorAll("[data-template-id]")];
  buttons.forEach((button) => {
    button.addEventListener("click", () => {
      current = button.dataset.templateId;
      buttons.forEach((b) => b.setAttribute("aria-pressed", String(b === button)));
      onSelect?.(current);
    });
  });
  return {
    getSelected: () => current,
    setSelected: (id) => {
      if (!templates.some((t) => t.id === id)) return;
      current = id;
      buttons.forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.templateId === id)));
    }
  };
}

/** رندر پیشنمایش زنده با همان موتور کارت نهایی. */
export function renderPreview(canvas, options = {}) {
  if (!canvas) return false;
  const ctx = canvas.getContext?.("2d");
  if (!ctx) return false;
  try {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    renderCardScaled(ctx, options, canvas.width / CARD_WIDTH);
    return true;
  } catch {
    return false;
  }
}

export function schedulePreview(canvas, getOptions) {
  if (canvas.__previewFrame && typeof cancelAnimationFrame === "function") {
    cancelAnimationFrame(canvas.__previewFrame);
  }
  const run = () => { canvas.__previewFrame = null; renderPreview(canvas, getOptions()); };
  if (typeof requestAnimationFrame === "function") canvas.__previewFrame = requestAnimationFrame(run);
  else run();
}

/** تنظیمات برند مشترک برای پیشنمایش و خروجی نهایی. */
export function cardBrandOptions(config, extra = {}) {
  return {
    logoPath: config.logoPath,
    brand: config.brand,
    universityName: config.universityName,
    programTitle: config.programTitle,
    headerLine: config.card.headerLine,
    footerLine: config.card.footerLine,
    fontFamily: config.card.fontFamily,
    ...extra
  };
}

export const CARD_SIZE = { width: CARD_WIDTH, height: CARD_HEIGHT };
