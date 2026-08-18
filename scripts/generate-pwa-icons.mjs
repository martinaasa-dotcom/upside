// Rasterizes Images/upside-fund-x-avatar-centered.png (the metallic A,
// sitting in the square) into the PNGs Next.js file-convention icons, the
// web manifest, OG card, and email lockup need. The circle-safe X avatar
// stays at public/upside-fund-x-avatar.png. Re-run only if the source
// mark changes. Outputs are committed, not built.
import sharp from "sharp";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = join(root, "Images", "upside-fund-x-avatar-centered.png");
const BG = "#000000";
const MARK_PAD = 0.16;

mkdirSync(join(root, "public", "icons"), { recursive: true });

function radiusFor(size) {
  return size * 0.225;
}

function maskSvg(size) {
  const r = radiusFor(size).toFixed(2);
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">
      <rect width="${size}" height="${size}" rx="${r}" ry="${r}" fill="white"/>
    </svg>`
  );
}

/** Trim the A and sit it in the square so the tip is not on the edge. */
async function centeredMark(size) {
  const inner = Math.max(1, Math.round(size * (1 - 2 * MARK_PAD)));
  const trimmed = await sharp(src)
    .flatten({ background: BG })
    .trim({ threshold: 12 })
    .png()
    .toBuffer();
  const fitted = await sharp(trimmed)
    .resize(inner, inner, {
      fit: "contain",
      background: BG,
      withoutEnlargement: false,
    })
    .png()
    .toBuffer();
  return sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 1 },
    },
  })
    .composite([{ input: fitted, gravity: "centre" }])
    .png()
    .toBuffer();
}

async function framedPngBuffer(size) {
  const base = await centeredMark(size);
  return sharp(base)
    .composite([{ input: maskSvg(size), blend: "dest-in" }])
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
  writeFileSync(out, await centeredMark(size));
  console.log(`wrote ${out} (${size}x${size} square)`);
}

async function writeOg() {
  const logo = await centeredMark(440);
  await sharp({
    create: { width: 1200, height: 630, channels: 3, background: BG },
  })
    .composite([{ input: logo, gravity: "center" }])
    .png()
    .toFile(join(root, "public", "og.png"));
  console.log("wrote public/og.png (1200x630)");
}

async function writeEmailLockup() {
  const mark = await centeredMark(80);
  const plate = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="540" height="100">
      <rect width="540" height="100" fill="${BG}"/>
      <text x="108" y="63" font-family="-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif" font-size="34" font-weight="700" fill="#f4f1ea">UPSIDE LAB</text>
    </svg>`
  );
  await sharp(plate)
    .composite([{ input: mark, left: 16, top: 10 }])
    .png()
    .toFile(join(root, "public", "icons", "email-lockup.png"));
  console.log("wrote public/icons/email-lockup.png");
}

async function writeTransparentMark() {
  const { data, info } = await sharp(src)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  for (let i = 0; i < data.length; i += 4) {
    if (data[i] < 22 && data[i + 1] < 22 && data[i + 2] < 22) {
      data[i + 3] = 0;
    }
  }
  await sharp(data, { raw: info })
    .trim({ threshold: 8 })
    .png()
    .toFile(join(root, "public", "upside-mark.png"));
  console.log("wrote public/upside-mark.png (transparent)");
}

await framedPng(180, join(root, "src", "app", "apple-icon.png"));
await framedPng(180, join(root, "public", "apple-touch-icon.png"));
const png16 = await framedPngBuffer(16);
const png32 = await framedPng(32, join(root, "public", "icons", "icon-32.png"));
await framedPng(192, join(root, "public", "icons", "icon-192.png"));
await framedPng(512, join(root, "public", "icons", "icon-512.png"));
await framedPng(512, join(root, "src", "app", "icon.png"));
await framedPng(128, join(root, "public", "upside-icon.png"));
// Maskable must stay full-bleed square. The OS clips it.
await squarePng(512, join(root, "public", "icons", "icon-512-maskable.png"));
await writeOg();
await writeEmailLockup();
await writeTransparentMark();

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
