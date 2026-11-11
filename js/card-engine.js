/** Shared 1080x1350 (4:5) Canvas renderer with three data-driven presets. */

import { clamp, normalizePersian, toFaDigits } from "./lib/utils.js";

export const CARD_WIDTH = 1080;
export const CARD_HEIGHT = 1350;
export const CARD_RATIO = "4:5";

export const FALLBACK_FONT_STACK = '"Vazirmatn", "Tahoma", "Segoe UI", sans-serif';

export class CardEngineError extends Error {
  constructor(code, message, cause) {
    super(message ?? code);
    this.name = "CardEngineError";
    this.code = code;
    if (cause) this.cause = cause;
  }
}

/** Data-driven presets; renderCard implements all drawing. */
export const CARD_PRESETS = {
  gold: {
    id: "gold",
    background: { base: "#0E0F12", glows: [{ x: 540, y: 250, r: 900, color: "rgba(201,162,75,0.115)" }] },
    geometry: { tone: "rgba(201,162,75,0.052)", step: 132, size: 22, width: 1.4, motif: "star" },
    frame: {
      inset: 38, radius: 50, color: "rgba(201,162,75,0.42)", width: 2.4,
      innerInset: 54, innerColor: "rgba(201,162,75,0.13)", innerWidth: 1.1
    },
    header: { y: 158, size: 26, color: "rgba(201,162,75,0.82)" },
    ornament: { y: 202 },
    media: { x: 104, y: 244, w: 872, h: 826, radius: 36 },
    band: { x: 104, y: 826, w: 872, h: 244, fill: "rgba(14,15,18,0.82)", line: "rgba(201,162,75,0.5)", inset: 54 },
    textBox: { x: 156, y: 350, w: 768, h: 620, align: "center", panel: null },
    scoreBox: { y: 258, h: 118 },
    medallion: null,
    accent: "#C9A24B",
    text: "#EDE8DC"
  },
  glow: {
    id: "glow",
    background: {
      base: "#0C1011",
      glows: [
        { x: 540, y: 220, r: 950, color: "rgba(46,107,94,0.18)" },
        { x: 540, y: 120, r: 620, color: "rgba(201,162,75,0.10)" }
      ]
    },
    geometry: { tone: "rgba(237,232,220,0.042)", step: 118, size: 15, width: 1.1, motif: "arc" },
    frame: { inset: 54, radius: 44, color: "rgba(237,232,220,0.11)", width: 1.1, innerInset: 0 },
    header: { y: 158, size: 25, color: "rgba(201,162,75,0.78)" },
    ornament: { y: 206 },
    media: { x: 96, y: 250, w: 888, h: 826, radius: 120 },
    band: { x: 96, y: 836, w: 888, h: 240, fill: "rgba(12,16,17,0.80)", line: "rgba(46,107,94,0.8)", inset: 58 },
    textBox: { x: 152, y: 360, w: 776, h: 630, align: "center", panel: null },
    scoreBox: { y: 262, h: 116 },
    medallion: null,
    accent: "#2E6B5E",
    text: "#EDE8DC"
  },
  band: {
    id: "band",
    background: { base: "#101317", glows: [{ x: 540, y: 420, r: 780, color: "rgba(201,162,75,0.075)" }] },
    geometry: { tone: "rgba(201,162,75,0.068)", step: 108, size: 26, width: 1.6, motif: "diamond" },
    frame: { inset: 38, radius: 42, color: "rgba(201,162,75,0.24)", width: 1.8, innerInset: 0 },
    header: { y: 158, size: 26, color: "rgba(201,162,75,0.82)" },
    ornament: { y: 202 },
    media: { x: 76, y: 244, w: 928, h: 866, radius: 28 },
    band: { x: 76, y: 800, w: 928, h: 310, fill: "rgba(22,24,29,0.84)", line: "rgba(201,162,75,0.72)", inset: 62 },
    textBox: { x: 138, y: 826, w: 804, h: 264, align: "bottom", panel: true },
    scoreBox: { y: 262, h: 118 },
    medallion: { x: 540, y: 486, r: 168 },
    accent: "#C9A24B",
    text: "#EDE8DC"
  }
};

export const CARD_TEMPLATE_IDS = Object.keys(CARD_PRESETS);

/* ------------------------------------------------------------------ */
/* Geometry and text helpers (testable) */
/* ------------------------------------------------------------------ */

export function pathRoundRect(ctx, x, y, w, h, radius) {
  const r = Math.min(Math.max(0, radius), Math.min(w, h) / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.arcTo(x + w, y, x + w, y + r, r);
  ctx.lineTo(x + w, y + h - r);
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
  ctx.lineTo(x + r, y + h);
  ctx.arcTo(x, y + h, x, y + h - r, r);
  ctx.lineTo(x, y + r);
  ctx.arcTo(x, y, x + r, y, r);
  ctx.closePath();
  return ctx;
}

/** Split an overlong word into measured chunks. */
function breakLongWord(ctx, word, maxWidth) {
  const pieces = [];
  let chunk = "";
  for (const ch of word) {
    const candidate = chunk + ch;
    if (chunk && ctx.measureText(candidate).width > maxWidth) {
      pieces.push(chunk);
      chunk = ch;
    } else chunk = candidate;
  }
  if (chunk) pieces.push(chunk);
  return pieces.length ? pieces : [""];
}

/** Manual RTL wrapping via ctx.measureText; never exceeds maxLines. */
export function wrapText(ctx, text, maxWidth, { maxLines = 20 } = {}) {
  const width = Math.max(20, Number(maxWidth) || 20);
  const limit = Number.isFinite(maxLines) && maxLines > 0 ? Math.floor(maxLines) : 20;
  const paragraphs = String(text ?? "").replace(/\r/g, "").split("\n");
  const lines = [];

  for (const paragraph of paragraphs) {
    const words = normalizePersian(paragraph).split(" ").filter(Boolean);
    if (!words.length) { if (lines.length < limit) lines.push(""); continue; }
    let line = "";
    for (const word of words) {
      if (lines.length >= limit) break;
      const wordWidth = ctx.measureText(word).width;
      const candidate = line ? `${line} ${word}` : word;
      if (wordWidth > width && !line) {
        const pieces = breakLongWord(ctx, word, width);
        for (let i = 0; i < pieces.length - 1 && lines.length < limit - 1; i += 1) lines.push(pieces[i]);
        line = pieces[pieces.length - 1] ?? "";
      } else if (ctx.measureText(candidate).width <= width || !line) {
        line = candidate;
      } else {
        lines.push(line);
        line = wordWidth > width ? "" : word;
        if (wordWidth > width) {
          const pieces = breakLongWord(ctx, word, width);
          for (let i = 0; i < pieces.length - 1 && lines.length < limit - 1; i += 1) lines.push(pieces[i]);
          line = pieces[pieces.length - 1] ?? "";
        }
      }
    }
    if (line && lines.length < limit) lines.push(line);
    if (lines.length >= limit) break;
  }
  if (!lines.length) lines.push("");
  return lines.slice(0, limit);
}

/** Shrink font size until text fits; returns lines, fontSize, lineHeight. */
export function fitTextLayout(ctx, text, {
  maxWidth, maxHeight, baseSize = 58, minSize = 28, lineHeight = 1.62,
  maxLines = 12, weight = 600, fontFamily = FALLBACK_FONT_STACK
} = {}) {
  const width = Math.max(40, maxWidth ?? 700);
  const height = Math.max(40, maxHeight ?? 500);
  const step = 2;
  let last = { lines: [""], fontSize: minSize, lineHeight: minSize * lineHeight, totalHeight: minSize * lineHeight, truncated: true };

  for (let size = baseSize; size >= minSize; size -= step) {
    try { ctx.font = `${weight} ${size}px ${fontFamily}`; } catch { /* Invalid font: keep going. */ }
    const lines = wrapText(ctx, text, width, { maxLines });
    const lh = size * lineHeight;
    const totalHeight = lines.length * lh;
    const fits = totalHeight <= height && lines.length <= maxLines;
    last = { lines, fontSize: size, lineHeight: lh, totalHeight, truncated: !fits };
    if (fits) return last;
  }
  // Last resort for very long text: truncate with an ellipsis.
  if (last.lines.length && last.lines.length >= maxLines) {
    const original = last.lines[maxLines - 1];
    last.lines = last.lines.slice(0, maxLines);
    last.lines[maxLines - 1] = `${original.slice(0, Math.max(1, original.length - 2))}…`;
    last.totalHeight = last.lines.length * last.lineHeight;
  }
  return last;
}

/** Clamp panning so the frame stays fully covered. */
export function clampImageTransform(image, frame, transform = {}) {
  const iw = Math.max(1, Number(image?.width) || 1);
  const ih = Math.max(1, Number(image?.height) || 1);
  const base = Math.max(frame.w / iw, frame.h / ih);
  const scale = clamp(transform.scale ?? 1, 1, 5);
  const w = iw * base * scale;
  const h = ih * base * scale;
  const maxX = Math.max(0, (w - frame.w) / 2);
  const maxY = Math.max(0, (h - frame.h) / 2);
  const x = clamp(transform.x ?? 0, -1, 1);
  const y = clamp(transform.y ?? 0, -1, 1);
  return { scale, x, y, width: w, height: h, offsetX: x * maxX, offsetY: y * maxY, base };
}

/* ------------------------------------------------------------------ */
/* Shared rendering */
/* ------------------------------------------------------------------ */

function setFont(ctx, weight, size, family) {
  ctx.font = `${weight} ${Math.round(size)}px ${family}`;
}

function drawBackground(ctx, preset, brand) {
  const base = brand?.background ?? preset.background.base;
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);
  for (const glow of preset.background.glows) {
    try {
      const gradient = ctx.createRadialGradient(glow.x, glow.y, 0, glow.x, glow.y, glow.r);
      gradient.addColorStop(0, glow.color);
      gradient.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);
    } catch { /* Some implementations lack gradients; keep the flat background. */ }
  }
}

function drawGeometry(ctx, preset) {
  const g = preset.geometry;
  ctx.save();
  ctx.strokeStyle = g.tone;
  ctx.lineWidth = g.width;
  ctx.beginPath();
  for (let x = g.step / 2; x < CARD_WIDTH; x += g.step) {
    for (let y = g.step / 2; y < CARD_HEIGHT; y += g.step) {
      const s = g.size;
      if (g.motif === "arc") {
        ctx.moveTo(x + s, y);
        ctx.arc(x, y, s, 0, Math.PI * 2);
      } else if (g.motif === "diamond") {
        ctx.moveTo(x, y - s); ctx.lineTo(x + s, y); ctx.lineTo(x, y + s); ctx.lineTo(x - s, y); ctx.closePath();
        ctx.moveTo(x - s * 0.5, y - s * 0.5); ctx.lineTo(x + s * 0.5, y + s * 0.5);
        ctx.moveTo(x + s * 0.5, y - s * 0.5); ctx.lineTo(x - s * 0.5, y + s * 0.5);
      } else {
        // Thin eight-point star lines.
        ctx.moveTo(x, y - s); ctx.lineTo(x, y + s);
        ctx.moveTo(x - s, y); ctx.lineTo(x + s, y);
        ctx.moveTo(x - s * 0.7, y - s * 0.7); ctx.lineTo(x + s * 0.7, y + s * 0.7);
        ctx.moveTo(x + s * 0.7, y - s * 0.7); ctx.lineTo(x - s * 0.7, y + s * 0.7);
        ctx.moveTo(x - s, y); ctx.lineTo(x, y - s);
      }
    }
  }
  ctx.stroke();
  ctx.restore();
}

function drawFrame(ctx, preset) {
  const f = preset.frame;
  if (!f) return;
  ctx.save();
  pathRoundRect(ctx, f.inset, f.inset, CARD_WIDTH - f.inset * 2, CARD_HEIGHT - f.inset * 2, f.radius);
  ctx.strokeStyle = f.color;
  ctx.lineWidth = f.width;
  ctx.stroke();
  if (f.innerInset) {
    pathRoundRect(ctx, f.innerInset, f.innerInset, CARD_WIDTH - f.innerInset * 2, CARD_HEIGHT - f.innerInset * 2, f.radius - 12);
    ctx.strokeStyle = f.innerColor;
    ctx.lineWidth = f.innerWidth;
    ctx.stroke();
  }
  ctx.restore();
}

function drawOrnament(ctx, preset, y) {
  ctx.save();
  ctx.strokeStyle = "rgba(201,162,75,0.42)";
  ctx.lineWidth = 1.3;
  ctx.beginPath();
  ctx.moveTo(150, y); ctx.lineTo(480, y);
  ctx.moveTo(600, y); ctx.lineTo(930, y);
  ctx.stroke();
  ctx.save();
  ctx.translate(540, y);
  ctx.rotate(Math.PI / 4);
  ctx.strokeRect(-9, -9, 18, 18);
  ctx.restore();
  ctx.restore();
}

function drawHeader(ctx, preset, headerLine, brand) {
  ctx.save();
  setFont(ctx, 400, preset.header.size, brand?.fontStack ?? FALLBACK_FONT_STACK);
  ctx.fillStyle = preset.header.color;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(headerLine ?? "", CARD_WIDTH / 2, preset.header.y);
  ctx.restore();
  drawOrnament(ctx, preset, preset.ornament.y);
}

function drawMedallion(ctx, preset) {
  const m = preset.medallion;
  if (!m) return;
  ctx.save();
  ctx.translate(m.x, m.y);
  ctx.strokeStyle = "rgba(201,162,75,0.30)";
  ctx.lineWidth = 2;
  for (let i = 0; i < 3; i += 1) {
    ctx.beginPath();
    ctx.arc(0, 0, m.r - i * 48, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.beginPath();
  for (let i = 0; i < 8; i += 1) {
    const angle = (i * Math.PI) / 4;
    const inner = i % 2 === 0 ? m.r * 0.72 : m.r * 0.34;
    const x = Math.cos(angle) * inner;
    const y = Math.sin(angle) * inner;
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.strokeStyle = "rgba(201,162,75,0.45)";
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.restore();
}

function drawFallbackMark(ctx, x, y, size, color) {
  // Simple geometric mark used when the logo is missing.
  ctx.save();
  ctx.translate(x + size / 2, y + size / 2);
  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(1.5, size * 0.045);
  ctx.beginPath();
  ctx.moveTo(-size * 0.34, size * 0.34);
  ctx.lineTo(-size * 0.34, -size * 0.08);
  ctx.arc(0, -size * 0.08, size * 0.34, Math.PI, 0);
  ctx.lineTo(size * 0.34, size * 0.34);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(-size * 0.46, size * 0.34);
  ctx.lineTo(size * 0.46, size * 0.34);
  ctx.stroke();
  ctx.restore();
}

function drawScoreBadge(ctx, preset, score, brand) {
  if (!score || !Number.isFinite(score.total) || score.total <= 0) return null;
  const y = preset.scoreBox.y;
  ctx.save();
  const w = 430, h = 84, x = (CARD_WIDTH - w) / 2;
  pathRoundRect(ctx, x, y, w, h, 42);
  ctx.fillStyle = "rgba(201,162,75,0.10)";
  ctx.fill();
  ctx.strokeStyle = "rgba(201,162,75,0.42)";
  ctx.lineWidth = 1.6;
  ctx.stroke();
  setFont(ctx, 800, 40, brand?.fontStack ?? FALLBACK_FONT_STACK);
  ctx.fillStyle = preset.accent;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(`امتیاز  ${toFaDigits(score.correct)}  از  ${toFaDigits(score.total)}`, CARD_WIDTH / 2, y + h / 2 + 2);
  ctx.restore();
  return y + h;
}

function drawTextLines(ctx, layout, box, { color, align = "center", weight = 600, family }) {
  ctx.save();
  setFont(ctx, weight, layout.fontSize, family);
  ctx.fillStyle = color;
  ctx.textAlign = "right"; // Physical right alignment for RTL.
  ctx.textBaseline = "middle";
  const n = layout.lines.length;
  const total = n * layout.lineHeight;
  let centerY;
  if (align === "top") centerY = box.y + total / 2;
  else if (align === "bottom") centerY = box.y + box.h - total / 2;
  else centerY = box.y + box.h / 2;
  const x = box.x + box.w - 8;
  for (let i = 0; i < n; i += 1) {
    const y = centerY - total / 2 + layout.lineHeight * (i + 0.5);
    ctx.fillText(layout.lines[i], x, y);
  }
  ctx.restore();
}

function drawName(ctx, name, box, color, family) {
  const value = typeof name === "string" ? name.trim() : "";
  if (!value) return;
  ctx.save();
  setFont(ctx, 400, 28, family);
  ctx.fillStyle = color;
  ctx.textAlign = "right";
  ctx.textBaseline = "middle";
  ctx.fillText(`به قلم: ${value.slice(0, 40)}`, box.x + box.w - 8, box.y + box.h + 42);
  ctx.restore();
}

function drawTextBoxContent(ctx, preset, options, scoreBottomY) {
  const { text, name, type, brand } = options;
  const family = brand?.fontStack ?? FALLBACK_FONT_STACK;
  const box = { ...preset.textBox };
  if (scoreBottomY) {
    const shift = Math.max(0, scoreBottomY - box.y + 34);
    box.y += shift;
    box.h = Math.max(140, box.h - shift);
  }
  if (preset.textBox.panel) {
    ctx.save();
    pathRoundRect(ctx, box.x - 24, box.y - 20, box.w + 48, box.h + 40, 24);
    ctx.fillStyle = "rgba(22,24,29,0.72)";
    ctx.fill();
    ctx.strokeStyle = "rgba(201,162,75,0.34)";
    ctx.lineWidth = 1.4;
    ctx.stroke();
    ctx.restore();
  }
  drawMedallion(ctx, preset);

  const reservedForName = typeof name === "string" && name.trim() ? 76 : 0;
  const inner = {
    x: box.x + 16,
    y: box.y + 12,
    w: box.w - 32,
    h: Math.max(80, box.h - 24 - reservedForName)
  };
  const isBand = preset.textBox.panel;
  const layout = fitTextLayout(ctx, normalizePersian(text || ""), {
    maxWidth: inner.w,
    maxHeight: inner.h,
    baseSize: isBand ? 52 : 60,
    minSize: isBand ? 26 : 28,
    maxLines: isBand ? 5 : 11,
    lineHeight: 1.66,
    weight: type === "quiz" ? 400 : 600,
    fontFamily: family
  });
  drawTextLines(ctx, layout, inner, {
    color: preset.text, align: preset.textBox.align, weight: type === "quiz" ? 400 : 600, family
  });
  if (reservedForName) {
    drawName(ctx, name, { x: inner.x, y: inner.y, w: inner.w, h: inner.h }, "rgba(201,162,75,0.82)", family);
  }
}

function drawMedia(ctx, preset, image, transform, mirror, brand) {
  const frame = preset.media;
  const t = clampImageTransform(image, frame, transform);
  ctx.save();
  pathRoundRect(ctx, frame.x, frame.y, frame.w, frame.h, frame.radius);
  ctx.clip();
  ctx.fillStyle = brand?.surface ?? "#16181D";
  ctx.fillRect(frame.x, frame.y, frame.w, frame.h);
  const dx = frame.x + (frame.w - t.width) / 2 + t.offsetX;
  const dy = frame.y + (frame.h - t.height) / 2 + t.offsetY;
  try {
    if (mirror) {
      ctx.save();
      ctx.translate(CARD_WIDTH / 2, 0);
      ctx.scale(-1, 1);
      ctx.translate(-CARD_WIDTH / 2, 0);
      ctx.drawImage(image, dx, dy, t.width, t.height);
      ctx.restore();
    } else {
      ctx.drawImage(image, dx, dy, t.width, t.height);
    }
  } catch (error) {
    ctx.restore();
    throw new CardEngineError("IMAGE_DRAW_FAILED", "رسم تصویر روی بوم ممکن نشد.", error);
  }
  // Soft bottom gradient keeps the caption band readable.
  try {
    const gradient = ctx.createLinearGradient(0, frame.y + frame.h * 0.45, 0, frame.y + frame.h);
    gradient.addColorStop(0, "rgba(0,0,0,0)");
    gradient.addColorStop(1, "rgba(0,0,0,0.55)");
    ctx.fillStyle = gradient;
    ctx.fillRect(frame.x, frame.y + frame.h * 0.45, frame.w, frame.h * 0.55);
  } catch { /*noop*/ }
  ctx.restore();
  return t;
}

function drawBandContent(ctx, preset, options) {
  const { text, name, score, brand } = options;
  const family = brand?.fontStack ?? FALLBACK_FONT_STACK;
  const band = preset.band;
  ctx.save();
  pathRoundRect(ctx, band.x, band.y, band.w, band.h, 22);
  ctx.fillStyle = band.fill;
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(band.x + 30, band.y + 2);
  ctx.lineTo(band.x + band.w - 30, band.y + 2);
  ctx.strokeStyle = band.line;
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.restore();

  const inner = {
    x: band.x + band.inset,
    y: band.y + 26,
    w: band.w - band.inset * 2,
    h: band.h - (typeof name === "string" && name.trim() ? 92 : 52)
  };
  const layout = fitTextLayout(ctx, normalizePersian(text || ""), {
    maxWidth: inner.w, maxHeight: inner.h,
    baseSize: 46, minSize: 24, maxLines: 4, lineHeight: 1.55,
    weight: 600, fontFamily: family
  });
  drawTextLines(ctx, layout, inner, { color: preset.text, align: "center", weight: 600, family });
  if (typeof name === "string" && name.trim()) {
    drawName(ctx, name, inner, "rgba(201,162,75,0.86)", family);
  }
  if (score && Number.isFinite(score.total) && score.total > 0) {
    ctx.save();
    setFont(ctx, 400, 24, family);
    ctx.fillStyle = "rgba(201,162,75,0.85)";
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText(`امتیاز: ${toFaDigits(score.correct)} از ${toFaDigits(score.total)}`, band.x + band.inset, band.y + band.h - 30);
    ctx.restore();
  }
}

function drawFooter(ctx, preset, options) {
  const { logoImage, universityName, footerLine, programTitle, brand } = options;
  const family = brand?.fontStack ?? FALLBACK_FONT_STACK;
  const gold = brand?.gold ?? "#C9A24B";
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(120, 1176);
  ctx.lineTo(960, 1176);
  ctx.strokeStyle = "rgba(201,162,75,0.26)";
  ctx.lineWidth = 1.2;
  ctx.stroke();

  const markX = 918, markY = 1200, markSize = 62;
  let drewLogo = false;
  if (logoImage && Number(logoImage.width) > 0 && Number(logoImage.height) > 0) {
    try {
      // Keep the official logo's aspect ratio inside the 62px box.
      const ratio = Math.min(markSize / logoImage.width, markSize / logoImage.height);
      const w = logoImage.width * ratio;
      const h = logoImage.height * ratio;
      ctx.drawImage(logoImage, markX + (markSize - w) / 2, markY + (markSize - h) / 2, w, h);
      drewLogo = true;
    } catch { /* Geometric fallback. */ }
  }
  if (!drewLogo) drawFallbackMark(ctx, markX, markY, markSize, gold);

  ctx.textAlign = "right";
  ctx.textBaseline = "middle";
  setFont(ctx, 800, 36, family);
  ctx.fillStyle = brand?.text ?? "#EDE8DC";
  ctx.fillText(universityName || "موسسه آموزش عالی شاندیز", 892, 1220);
  setFont(ctx, 400, 25, family);
  ctx.fillStyle = "rgba(201,162,75,0.78)";
  ctx.fillText(footerLine || "شب جمعه، موکب …", 892, 1262);

  setFont(ctx, 400, 23, family);
  ctx.fillStyle = "rgba(170,166,157,0.72)";
  ctx.textAlign = "left";
  ctx.fillText(programTitle || "نهضت هر شب جمعه", 120, 1226);
  ctx.restore();
}

/** Draw a card onto a ready ctx; no DOM or network dependency. */
export function renderCard(ctx, options = {}) {
  if (!ctx || typeof ctx.fillRect !== "function") {
    throw new CardEngineError("CANVAS_UNAVAILABLE", "بوم در دسترس نیست.");
  }
  const preset = CARD_PRESETS[options.templateId] ?? CARD_PRESETS.gold;
  const brand = {
    ...options.brand,
    fontStack: options.fontFamily ? `"${options.fontFamily}", "Tahoma", sans-serif` : FALLBACK_FONT_STACK
  };
  const normalized = { ...options, brand };

  ctx.save();
  try { ctx.direction = "rtl"; } catch { /* Some implementations expose a getter only. */ }
  try {
    drawBackground(ctx, preset, brand);
    drawGeometry(ctx, preset);
    drawFrame(ctx, preset);
    drawHeader(ctx, preset, options.headerLine, brand);

    if (options.userImage) {
      drawMedia(ctx, preset, options.userImage, options.imageTransform, options.mirror, brand);
      drawBandContent(ctx, preset, normalized);
    } else {
      const scoreBottomY = options.type === "quiz"
        ? drawScoreBadge(ctx, preset, options.score, brand)
        : null;
      drawTextBoxContent(ctx, preset, normalized, scoreBottomY);
    }

    drawFooter(ctx, preset, normalized);
  } finally {
    ctx.restore();
  }
  return { width: CARD_WIDTH, height: CARD_HEIGHT, templateId: preset.id };
}

/** Scaled render for live preview (same engine and output). */
export function renderCardScaled(ctx, options = {}, scale = 0.5) {
  const s = clamp(scale, 0.05, 1);
  ctx.save();
  ctx.setTransform(s, 0, 0, s, 0, 0);
  try {
    return renderCard(ctx, options);
  } finally {
    ctx.restore();
  }
}

/* ------------------------------------------------------------------ */
/* Browser layer */
/* ------------------------------------------------------------------ */

/** Load the Persian font before drawing; failure falls back to system fonts. */
export async function ensureCardFonts(family = "Vazirmatn") {
  if (typeof document === "undefined" || !document.fonts) return { ok: true, source: "none" };
  try {
    await Promise.all([
      document.fonts.load(`400 48px "${family}"`, "ایام فاطمیه"),
      document.fonts.load(`600 48px "${family}"`, "موسسه آموزش عالی شاندیز"),
      document.fonts.load(`800 48px "${family}"`, "نهضت هر شب جمعه")
    ]);
    await document.fonts.ready;
    return { ok: Boolean(document.fonts.check?.(`400 48px "${family}"`)), source: "document.fonts" };
  } catch (error) {
    return { ok: false, source: "document.fonts", error };
  }
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    if (typeof Image === "undefined") { reject(new Error("Image پشتیبانی نمیشود.")); return; }
    const image = new Image();
    image.decoding = "async";
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("بارگذاری تصویر ناموفق بود."));
    image.src = src;
  });
}

function canvasToBlob(canvas) {
  return new Promise((resolve, reject) => {
    if (typeof canvas.toBlob === "function") {
      try {
        canvas.toBlob((blob) => {
          if (blob) resolve(blob);
          else reject(new CardEngineError("PNG_FAILED", "تولید فایل PNG ممکن نشد."));
        }, "image/png");
        return;
      } catch (error) {
        reject(new CardEngineError("PNG_FAILED", "تولید فایل PNG ممکن نشد.", error));
        return;
      }
    }
    // Legacy fallback: dataURL to Blob (no fetch).
    try {
      const dataUrl = canvas.toDataURL("image/png");
      const base64 = dataUrl.split(",")[1] ?? "";
      const binary = typeof atob === "function" ? atob(base64) : Buffer.from(base64, "base64").toString("binary");
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
      resolve(new Blob([bytes], { type: "image/png" }));
    } catch (error) {
      reject(new CardEngineError("PNG_FAILED", "تولید فایل PNG ممکن نشد.", error));
    }
  });
}

/** @returns {Promise<{blob: Blob, width: number, height: number, mimeType: string, fontFallback: boolean}>} */
export async function createCardBlob(options = {}) {
  const family = options.fontFamily ?? "Vazirmatn";
  const fonts = await ensureCardFonts(family);
  if (typeof document === "undefined") {
    throw new CardEngineError("CANVAS_UNAVAILABLE", "ساخت کارت فقط در مرورگر ممکن است.");
  }

  const canvas = options.canvas ?? document.createElement("canvas");
  canvas.width = CARD_WIDTH;
  canvas.height = CARD_HEIGHT;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new CardEngineError("CANVAS_UNAVAILABLE", "بوم دوبعدی در دسترس نیست.");

  let logoImage = null;
  let userImage = null;
  let temporaryUrl = null;

  try {
    if (options.logoPath) {
      try { logoImage = await loadImage(options.logoPath); } catch { logoImage = null; }
    }
    if (options.userImage && typeof options.userImage === "string") {
      temporaryUrl = options.userImage;
      try { userImage = await loadImage(options.userImage); } catch (error) {
        throw new CardEngineError("IMAGE_LOAD_FAILED", "بارگذاری عکس ممکن نشد.", error);
      }
    } else {
      userImage = options.userImage ?? null;
    }

    renderCard(ctx, {
      ...options,
      logoImage,
      userImage,
      fontFamily: fonts.ok ? family : null,
      brand: { ...options.brand, fontStack: fonts.ok ? `"${family}", "Tahoma", sans-serif` : FALLBACK_FONT_STACK }
    });

    const blob = await canvasToBlob(canvas);
    return {
      blob,
      width: CARD_WIDTH,
      height: CARD_HEIGHT,
      mimeType: "image/png",
      fontFallback: !fonts.ok
    };
  } catch (error) {
    if (error instanceof CardEngineError) throw error;
    throw new CardEngineError("RENDER_FAILED", "رندر کارت با خطا روبهرو شد.", error);
  } finally {
    // Release temporary images and canvas memory.
    try { if (logoImage) logoImage.src = ""; } catch { /*noop*/ }
    if (temporaryUrl && typeof URL !== "undefined" && URL.revokeObjectURL) {
      try { URL.revokeObjectURL(temporaryUrl); } catch { /*noop*/ }
    }
    if (typeof options.releaseTemporaryAssets === "function") {
      try { options.releaseTemporaryAssets(); } catch { /*noop*/ }
    }
    try { canvas.width = 1; canvas.height = 1; } catch { /*noop*/ }
  }
}

/** Sanitize a download filename (strip control characters). */
export function safeDownloadName(name) {
  return String(name ?? "nazra-card.png").replace(/[<>:"\/\\|?*\x00-\x1f]/g, "-").slice(0, 120);
}
