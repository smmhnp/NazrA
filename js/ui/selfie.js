/**
 * selfie.js — کنترلر سلفیکارت.
 * عکس فقط بهصورت محلی خوانده میشود (createImageBitmap / object URL)؛
 * هیچ درخواست شبکهای، تحلیلگر یا ذخیرهسازی ابری وجود ندارد.
 */
import { buildTemplateChips, schedulePreview, cardBrandOptions } from "./common.js";
import { clamp, toFaDigits } from "../lib/utils.js";
import { CARD_PRESETS } from "../card-engine.js";

export class SelfieImageError extends Error {
  constructor(code) { super(code); this.name = "SelfieImageError"; this.code = code; }
}

/** خواندن و اعتبارسنجی فایل تصویر روی همان دستگاه. */
export async function decodeImageFile(file, { maxBytes = 15 * 1024 * 1024 } = {}) {
  if (!file) throw new SelfieImageError("cancelled");
  const type = String(file.type ?? "").toLowerCase();
  if (type && !type.startsWith("image/")) throw new SelfieImageError("invalid-type");
  if (!type && !/\.(png|jpe?g|webp|gif|bmp|avif|heic|heif)$/i.test(String(file.name ?? ""))) {
    throw new SelfieImageError("invalid-type");
  }
  if (Number(file.size) > maxBytes) throw new SelfieImageError("too-large");

  try {
    if (typeof createImageBitmap === "function") {
      const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
      if (bitmap.width > 0 && bitmap.height > 0) return bitmap;
      bitmap.close?.();
    }
  } catch { /* به روش قدیمی میرویم */ }

  try {
    if (typeof URL === "undefined" || !URL.createObjectURL || typeof Image === "undefined") {
      throw new Error("no fallback");
    }
    const url = URL.createObjectURL(file);
    const image = await new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("decode"));
      img.src = url;
    });
    URL.revokeObjectURL(url);
    if (!image.naturalWidth || !image.naturalHeight) throw new Error("empty");
    return image;
  } catch {
    throw new SelfieImageError("decode-failed");
  }
}

export function createSelfieUI({
  root, config, templates, copy, toast, makeCard,
  initialTemplate, onTemplateChange, decodeImage = decodeImageFile
} = {}) {
  const $ = (sel) => root.querySelector(sel);
  const fileInput = $("#selfie-file");
  const canvas = $("#selfie-preview");
  const emptyOverlay = $("#selfie-empty");
  const status = $("#selfie-status");
  const zoomRange = $("#selfie-zoom");
  const zoomValue = $("#selfie-zoom-value");
  const flipButton = $("#selfie-flip");
  const textInput = $("#selfie-text");
  const chipsBox = $("#selfie-templates");
  const makeButton = $("#selfie-make");
  const privacyNote = $("#selfie-privacy span") ?? $("#selfie-privacy");

  if (privacyNote) privacyNote.textContent = config.privacy.notice;
  if (textInput && !textInput.value) textInput.value = copy.selfieDefaultText;

  let image = null;
  const transform = { scale: 1, x: 0, y: 0, mirror: false };
  const pointers = new Map();
  let pinch = null;

  const chips = buildTemplateChips(chipsBox, templates, {
    selected: initialTemplate,
    onSelect: (id) => { onTemplateChange?.(id); preview(); }
  });

  function options() {
    return cardBrandOptions(config, {
      type: "selfie",
      text: (textInput?.value ?? "").trim() || copy.selfieDefaultText,
      userImage: image,
      imageTransform: { scale: transform.scale, x: transform.x, y: transform.y },
      mirror: transform.mirror,
      templateId: chips.getSelected()
    });
  }
  function preview() {
    if (!image) {
      // بدون عکس، بوم خنثی است تا پیام «عکسی انتخاب نشده» خوانا بماند.
      const ctx = canvas?.getContext?.("2d");
      if (ctx) {
        try {
          ctx.setTransform(1, 0, 0, 1, 0, 0);
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          ctx.fillStyle = "#101216";
          ctx.fillRect(0, 0, canvas.width, canvas.height);
        } catch { /*noop*/ }
      }
      return;
    }
    schedulePreview(canvas, options);
  }
  function setStatus(message) { if (status) status.textContent = message ?? ""; }

  function syncZoom() {
    if (zoomRange) zoomRange.value = String(transform.scale);
    if (zoomValue) zoomValue.textContent = `${toFaDigits(transform.scale.toFixed(2).replace(/\.00$/, "").replace(/0$/, ""))}×`;
  }

  function releaseImage() {
    if (image && typeof image.close === "function") { try { image.close(); } catch { /*noop*/ } }
    if (image && typeof image.src === "string" && image.src.startsWith("blob:") &&
        typeof URL !== "undefined" && URL.revokeObjectURL) {
      try { URL.revokeObjectURL(image.src); } catch { /*noop*/ }
    }
    image = null;
  }

  async function handleFile(file) {
    try {
      const decoded = await decodeImage(file, { maxBytes: config.privacy.maxImageBytes });
      releaseImage();
      image = decoded;
      transform.scale = 1; transform.x = 0; transform.y = 0; transform.mirror = false;
      if (flipButton) flipButton.setAttribute("aria-pressed", "false");
      if (emptyOverlay) emptyOverlay.hidden = true;
      if (makeButton) makeButton.disabled = false;
      syncZoom();
      setStatus(copy.selfieReady);
      preview();
    } catch (error) {
      const code = error?.code ?? "decode-failed";
      const messages = {
        "invalid-type": copy.selfieInvalidType,
        "too-large": copy.selfieTooLarge,
        "decode-failed": copy.selfieDecodeFailed,
        "cancelled": copy.selfieCancelled
      };
      toast.error(messages[code] ?? copy.selfieDecodeFailed);
      setStatus(messages[code] ?? "");
    } finally {
      if (fileInput) fileInput.value = ""; // اجازهٔ انتخاب دوبارهٔ همان فایل
    }
  }

  fileInput?.addEventListener("change", (event) => {
    const file = event.target.files?.[0];
    handleFile(file).catch(() => toast.error(copy.selfieDecodeFailed));
  });

  zoomRange?.addEventListener("input", () => {
    transform.scale = clamp(Number(zoomRange.value), 1, 4);
    syncZoom(); preview();
  });

  textInput?.addEventListener("input", preview);

  root.addEventListener("click", (event) => {
    const action = event.target.closest("[data-ui-action]")?.dataset.uiAction;
    if (action === "selfie-flip") {
      transform.mirror = !transform.mirror;
      flipButton?.setAttribute("aria-pressed", String(transform.mirror));
      preview();
    } else if (action === "selfie-reset") {
      transform.scale = 1; transform.x = 0; transform.y = 0; transform.mirror = false;
      flipButton?.setAttribute("aria-pressed", "false");
      syncZoom(); preview();
    } else if (action === "selfie-make") {
      build().catch(() => toast.error(copy.cardFailed));
    }
  });

  /* --- جابهجایی، زوم دو انگشتی و زوم با چرخ ماوس --- */
  const frameOf = () => CARD_PRESETS[chips.getSelected()]?.media ?? CARD_PRESETS.gold.media;

  function applyPan(dxPixels, dyPixels) {
    if (!image) return;
    const rect = canvas.getBoundingClientRect();
    const scaleX = 1080 / Math.max(1, rect.width || canvas.width);
    const scaleY = 1350 / Math.max(1, rect.height || canvas.height);
    const frame = frameOf();
    const base = Math.max(frame.w / image.width, frame.h / image.height);
    const maxX = Math.max(1, (image.width * base * transform.scale - frame.w) / 2);
    const maxY = Math.max(1, (image.height * base * transform.scale - frame.h) / 2);
    transform.x = clamp(transform.x + (dxPixels * scaleX) / maxX, -1, 1);
    transform.y = clamp(transform.y + (dyPixels * scaleY) / maxY, -1, 1);
  }

  function distance(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }

  canvas?.addEventListener("pointerdown", (event) => {
    if (!image) return;
    try { canvas.setPointerCapture(event.pointerId); } catch { /*noop*/ }
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      pinch = { dist: Math.max(1, distance(a, b)), cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2 };
    }
  });

  canvas?.addEventListener("pointermove", (event) => {
    const previous = pointers.get(event.pointerId);
    if (!previous || !image) return;
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointers.size === 1) {
      applyPan(event.clientX - previous.x, event.clientY - previous.y);
      preview();
    } else if (pointers.size === 2 && pinch) {
      const [a, b] = [...pointers.values()];
      const dist = Math.max(1, distance(a, b));
      const cx = (a.x + b.x) / 2, cy = (a.y + b.y) / 2;
      transform.scale = clamp(transform.scale * (dist / pinch.dist), 1, 4);
      applyPan(cx - pinch.cx, cy - pinch.cy);
      pinch = { dist, cx, cy };
      syncZoom(); preview();
    }
  });

  function endPointer(event) {
    pointers.delete(event.pointerId);
    if (pointers.size < 2) pinch = null;
  }
  canvas?.addEventListener("pointerup", endPointer);
  canvas?.addEventListener("pointercancel", endPointer);
  canvas?.addEventListener("lostpointercapture", endPointer);

  canvas?.addEventListener("wheel", (event) => {
    if (!image) return;
    event.preventDefault();
    transform.scale = clamp(transform.scale * Math.exp(-event.deltaY * 0.0015), 1, 4);
    syncZoom(); preview();
  }, { passive: false });

  async function build() {
    if (!image) { toast.error(copy.selfieNeedImage); return; }
    await makeCard({
      type: "selfie",
      text: (textInput?.value ?? "").trim() || copy.selfieDefaultText,
      userImage: image,
      imageTransform: { scale: transform.scale, x: transform.x, y: transform.y },
      mirror: transform.mirror,
      templateId: chips.getSelected()
    }, makeButton);
  }

  /** پاکسازی کامل هنگام شروع دوبارهٔ برنامه (آزادسازی حافظهٔ عکس). */
  function reset() {
    releaseImage();
    transform.scale = 1; transform.x = 0; transform.y = 0; transform.mirror = false;
    pointers.clear(); pinch = null;
    if (emptyOverlay) emptyOverlay.hidden = false;
    if (makeButton) makeButton.disabled = true;
    if (flipButton) flipButton.setAttribute("aria-pressed", "false");
    setStatus("");
    syncZoom();
    preview();
  }

  return {
    enter() { syncZoom(); preview(); },
    leave() { pointers.clear(); pinch = null; },
    reset,
    destroy() { reset(); },
    get selectedTemplate() { return chips.getSelected(); }
  };
}
