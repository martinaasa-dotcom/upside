// Rasterizes Images/upside favicon.png (the metallic A) into the PNGs
// Next.js file-convention icons and the web manifest need. Re-run this
// only if the source mark changes. Outputs are committed, not built.
//
// SVG favicon (public/upside-icon.svg, src/app/icon.svg) is traced from
// the same source and edited by hand when the geometry changes.
import sharp from "sharp";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = join(root, "Images", "upside favicon.png");
const BG = "#0C1014";

mkdirSync(join(root, "public", "icons"), { recursive: true });

function radiusFor(size) {
  return size * 0.225;
}

function strokeFor(size) {
  if (size <= 48) return 2;
  return Math.max(3, Math.round((size * 2.4) / 128));
}

function maskSvg(size) {
  const r = radiusFor(size).toFixed(2);
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">
      <rect width="${size}" height="${size}" rx="${r}" ry="${r}" fill="white"/>
    </svg>`
  );
}

function rimSvg(size) {
  const r = radiusFor(size);
  const sw = strokeFor(size);
  const m = sw / 2;
  const inner = size - sw;
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">
      <defs>
        <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="#F0D7A4"/>
          <stop offset="0.5" stop-color="#D6AD69"/>
          <stop offset="1" stop-color="#9C723F"/>
        </linearGradient>
      </defs>
      <rect x="${m}" y="${m}" width="${inner}" height="${inner}" rx="${Math.max(1, r - m)}" ry="${Math.max(1, r - m)}" fill="none" stroke="url(#g)" stroke-width="${sw}"/>
    </svg>`
  );
}

async function framedPngBuffer(size) {
  const base = await sharp(src)
    .resize(size, size, { fit: "fill" })
    .flatten({ background: BG })
    .png()
    .toBuffer();
  const rounded = await sharp(base)
    .composite([{ input: maskSvg(size), blend: "dest-in" }])
    .png()
    .toBuffer();
  return sharp(rounded)
    .composite([{ input: rimSvg(size), blend: "over" }])
    .png()
    .toBuffer();
}

async function framedPng(size, out) {
  const buf = await framedPngBuffer(size);
  writeFileSync(out, buf);
  console.log(`wrote ${out} (${size}x${size} framed)`);
  return buf;
}

/** PNG-in-ICO so Chrome's default /favicon.ico request is the gold mark. */
function packIco(pngs) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(pngs.length, 4);
  const entries = Buffer.alloc(16 * pngs.length);
  let offset = 6 + 16 * pngs.length;
  const blobs = [];
  pngs.forEach((p, i) => {
    const o = i * 16;
    entries.writeUInt8(p.width >= 256 ? 0 : p.width, o);
    entries.writeUInt8(p.height >= 256 ? 0 : p.height, o + 1);
    entries.writeUInt16LE(1, o + 4);
    entries.writeUInt16LE(32, o + 6);
    entries.writeUInt32LE(p.data.length, o + 8);
    entries.writeUInt32LE(offset, o + 12);
    offset += p.data.length;
    blobs.push(p.data);
  });
  return Buffer.concat([header, entries, ...blobs]);
}

async function squarePng(size, out) {
  await sharp(src)
    .resize(size, size, { fit: "fill" })
    .flatten({ background: BG })
    .png()
    .toFile(out);
  console.log(`wrote ${out} (${size}x${size} square)`);
}

await framedPng(180, join(root, "src", "app", "apple-icon.png"));
const png16 = await framedPngBuffer(16);
const png32 = await framedPng(32, join(root, "public", "icons", "icon-32.png"));
await framedPng(192, join(root, "public", "icons", "icon-192.png"));
await framedPng(512, join(root, "public", "icons", "icon-512.png"));
await squarePng(512, join(root, "public", "icons", "icon-512-maskable.png"));

const ico = packIco([
  { width: 16, height: 16, data: png16 },
  { width: 32, height: 32, data: png32 },
]);
for (const out of [
  join(root, "src", "app", "favicon.ico"),
  join(root, "public", "favicon.ico"),
]) {
  writeFileSync(out, ico);
  console.log(`wrote ${out} (ico)`);
}
