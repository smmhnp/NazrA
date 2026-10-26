/**
 * generate-icons.mjs — تولید آیکونهای PNG نصب PWA از روی نشان هندسی موقت.
 * فقط به @napi-rs/canvas (وابستگی توسعه) نیاز دارد؛ هیچ سرویس خارجی استفاده نمیشود.
 * اجرا: npm run icons
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outDir = path.join(root, "assets", "icons");

let createCanvas;
try {
  ({ createCanvas } = await import("@napi-rs/canvas"));
} catch {
  console.error("برای تولید آیکونها ابتدا «npm install» را اجرا کنید (نیاز به @napi-rs/canvas).");
  process.exit(1);
}

function drawIcon(ctx, size, maskable = false) {
  const gold = "#C9A24B";
  ctx.fillStyle = "#0E0F12";
  ctx.fillRect(0, 0, size, size);

  // بافت هندسی بسیار کمرنگ
  ctx.save();
  ctx.strokeStyle = "rgba(201,162,75,0.055)";
  ctx.lineWidth = Math.max(1, size * 0.002);
  const step = size / 8;
  for (let x = step / 2; x < size; x += step) {
    for (let y = step / 2; y < size; y += step) {
      const r = step * 0.22;
      ctx.beginPath();
      ctx.moveTo(x, y - r); ctx.lineTo(x + r, y);
      ctx.lineTo(x, y + r); ctx.lineTo(x - r, y);
      ctx.closePath(); ctx.stroke();
    }
  }
  ctx.restore();

  const scale = maskable ? 0.7 : 1;
  const cx = size / 2;
  const cy = size / 2;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(scale, scale);
  ctx.translate(-cx, -cy);

  ctx.strokeStyle = gold;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  // دایرهٔ بیرونی
  ctx.globalAlpha = 0.30;
  ctx.lineWidth = size * 0.006;
  ctx.beginPath();
  ctx.arc(cx, cy, size * 0.40, 0, Math.PI * 2);
  ctx.stroke();

  // طاق (محراب) — نشان انتزاعی و موقت
  ctx.globalAlpha = 1;
  ctx.lineWidth = size * 0.014;
  ctx.beginPath();
  ctx.moveTo(size * 0.285, size * 0.735);
  ctx.lineTo(size * 0.285, size * 0.455);
  ctx.arc(cx, size * 0.455, size * 0.215, Math.PI, 0);
  ctx.lineTo(size * 0.715, size * 0.735);
  ctx.stroke();

  ctx.globalAlpha = 0.72;
  ctx.beginPath();
  ctx.moveTo(size * 0.22, size * 0.735);
  ctx.lineTo(size * 0.78, size * 0.735);
  ctx.stroke();

  // ستارهٔ هشتپر
  ctx.globalAlpha = 1;
  ctx.lineWidth = size * 0.011;
  const r = size * 0.125;
  ctx.beginPath();
  for (let i = 0; i < 8; i += 1) {
    const angle = (i * Math.PI) / 4 - Math.PI / 2;
    const radius = i % 2 === 0 ? r : r * 0.46;
    const x = cx + Math.cos(angle) * radius;
    const y = cy - size * 0.045 + Math.sin(angle) * radius;
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.stroke();
  ctx.restore();
}

const targets = [
  { name: "icon-192.png", size: 192, maskable: false },
  { name: "icon-512.png", size: 512, maskable: false },
  { name: "icon-maskable-512.png", size: 512, maskable: true },
  { name: "apple-touch-icon.png", size: 180, maskable: false }
];

fs.mkdirSync(outDir, { recursive: true });
for (const target of targets) {
  const canvas = createCanvas(target.size, target.size);
  drawIcon(canvas.getContext("2d"), target.size, target.maskable);
  fs.writeFileSync(path.join(outDir, target.name), canvas.toBuffer("image/png"));
  console.log(`✓ ${target.name} (${target.size}×${target.size})`);
}
