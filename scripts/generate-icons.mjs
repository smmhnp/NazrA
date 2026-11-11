/** Prepare the official logo and generate PWA icons (npm run icons). */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const asset = (...parts) => path.join(root, "assets", ...parts);
const sourcePath = asset("logo-source.png");
const logoPath = asset("logo.png");
const iconDir = asset("icons");

let createCanvas, loadImage;
try {
  ({ createCanvas, loadImage } = await import("@napi-rs/canvas"));
} catch {
  console.error("برای تولید لوگو و آیکونها ابتدا «npm install» را اجرا کنید (نیاز به @napi-rs/canvas).");
  process.exit(1);
}
if (!fs.existsSync(sourcePath)) {
  console.error("فایل ورودی یافت نشد: assets/logo-source.png");
  process.exit(1);
}

const CREAM = [237, 232, 220]; // --text-primary
const GOLD = [201, 162, 75];   // --gold
const BG = "#0E0F12";

/** Turn the white-on-black mark into a transparent tinted logo. */
async function buildTransparentLogo() {
  const source = await loadImage(sourcePath);
  const width = 800;
  const height = Math.round((source.height / source.width) * width);
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");
  ctx.drawImage(source, 0, 0, width, height);
  const image = ctx.getImageData(0, 0, width, height);
  const data = image.data;
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i], g = data[i + 1], b = data[i + 2], a = data[i + 3];
    // With a black background and white mark, luminance equals coverage.
    const luminance = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
    data[i] = CREAM[0];
    data[i + 1] = CREAM[1];
    data[i + 2] = CREAM[2];
    data[i + 3] = Math.round(luminance * a);
  }
  ctx.putImageData(image, 0, 0);
  fs.writeFileSync(logoPath, canvas.toBuffer("image/png"));
  return await loadImage(logoPath);
}

/** Recolor the transparent mark while preserving alpha. */
function tintedMark(logo, color, width, height) {
  const mark = createCanvas(Math.ceil(width), Math.ceil(height));
  const ctx = mark.getContext("2d");
  ctx.drawImage(logo, 0, 0, width, height);
  ctx.globalCompositeOperation = "source-in";
  ctx.fillStyle = `rgb(${color[0]},${color[1]},${color[2]})`;
  ctx.fillRect(0, 0, width, height);
  return mark;
}

function drawIcon(ctx, size, logo, maskable = false) {
  ctx.fillStyle = BG;
  ctx.fillRect(0, 0, size, size);

  // Very faint geometric texture.
  ctx.save();
  ctx.strokeStyle = "rgba(201,162,75,0.05)";
  ctx.lineWidth = Math.max(1, size * 0.002);
  const step = size / 8;
  for (let x = step / 2; x < size; x += step) {
    for (let y = step / 2; y < size; y += step) {
      const r = step * 0.2;
      ctx.beginPath();
      ctx.moveTo(x, y - r); ctx.lineTo(x + r, y);
      ctx.lineTo(x, y + r); ctx.lineTo(x - r, y);
      ctx.closePath(); ctx.stroke();
    }
  }
  ctx.restore();

  // Safe zone: keep the maskable mark smaller to survive circular crops.
  const box = size * (maskable ? 0.62 : 0.78);
  const scale = Math.min(box / logo.width, box / logo.height);
  const w = logo.width * scale;
  const h = logo.height * scale;
  const mark = tintedMark(logo, GOLD, w, h);
  ctx.drawImage(mark, (size - w) / 2, (size - h) / 2);
}

fs.mkdirSync(iconDir, { recursive: true });
const logo = await buildTransparentLogo();

const targets = [
  { name: "icon-192.png", size: 192, maskable: false },
  { name: "icon-512.png", size: 512, maskable: false },
  { name: "icon-maskable-512.png", size: 512, maskable: true },
  { name: "apple-touch-icon.png", size: 180, maskable: false }
];

let icon512 = null;
for (const target of targets) {
  const canvas = createCanvas(target.size, target.size);
  drawIcon(canvas.getContext("2d"), target.size, logo, target.maskable);
  const buffer = canvas.toBuffer("image/png");
  fs.writeFileSync(path.join(iconDir, target.name), buffer);
  if (target.name === "icon-512.png") icon512 = buffer;
  console.log(`✓ ${target.name} (${target.size}×${target.size})`);
}

// SVG version of the 512 icon for the manifest and favicon.
const svg = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="512" height="512" viewBox="0 0 512 512">
  <title>نشان موسسه آموزش عالی شاندیز</title>
  <image width="512" height="512" href="data:image/png;base64,${icon512.toString("base64")}"/>
</svg>
`;
fs.writeFileSync(path.join(iconDir, "icon.svg"), svg);
console.log("✓ assets/logo.png و assets/icons/icon.svg");
