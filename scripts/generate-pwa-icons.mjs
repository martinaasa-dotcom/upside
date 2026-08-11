// One-off generator: rasterizes public/upside-icon.svg into the PNGs
// Next.js file-convention icons and the web manifest need. Re-run this
// only if the source mark changes — outputs are committed, not built.
import sharp from "sharp";
import { readFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const svgPath = join(root, "public", "upside-icon.svg");
const svg = readFileSync(svgPath);

const targets = [
  { out: join(root, "src", "app", "apple-icon.png"), size: 180 },
  { out: join(root, "public", "icons", "icon-192.png"), size: 192 },
  { out: join(root, "public", "icons", "icon-512.png"), size: 512 },
];

mkdirSync(join(root, "public", "icons"), { recursive: true });

for (const { out, size } of targets) {
  await sharp(svg, { density: 384 })
    .resize(size, size)
    .png()
    .toFile(out);
  console.log(`wrote ${out} (${size}x${size})`);
}
