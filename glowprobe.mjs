import { chromium } from "playwright";
import { readFileSync } from "node:fs";
const S = process.argv[2], which = process.argv[3];
const body = readFileSync(`${S}/glow.html`, "utf8");
const css = readFileSync(`${S}/glow-${which}.css`, "utf8");
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const page = await b.newPage({ viewport: { width: 1440, height: 900 } });
await page.setContent(`<!doctype html><html class="dark"><head><style>${css}</style></head><body>${body}</body></html>`);
const shot = await page.screenshot({ path: `${S}/glow-${which}.png` });
const probe = await b.newPage();
await probe.setContent("<canvas id=c></canvas>");
const out = await probe.evaluate(async (b64) => {
  const img = new Image();
  await new Promise((r) => { img.onload = r; img.src = "data:image/png;base64," + b64; });
  const c = document.getElementById("c"); c.width = img.width; c.height = img.height;
  const x = c.getContext("2d"); x.drawImage(img, 0, 0);
  const at = (px, py) => { const d = x.getImageData(px, py, 1, 1).data; return [d[0], d[1], d[2]]; };
  const lum = ([r, g, bl]) => 0.2126 * r + 0.7152 * g + 0.0722 * bl;
  // field samples on a grid, avoiding the card rows
  const vals = [];
  for (let py = 20; py < img.height; py += 40) for (let px = 20; px < img.width; px += 40) vals.push(lum(at(px, py)));
  const cardL = lum(at(120, 60)), cardR = lum(at(1320, 60));
  return {
    topLeft: at(8, 8), bottomRight: at(img.width - 8, img.height - 8),
    bottomLeft: at(8, img.height - 8), topRight: at(img.width - 8, 8),
    spread: +(Math.max(...vals) - Math.min(...vals)).toFixed(1),
    cardLeftVsRight: +(cardL - cardR).toFixed(1),
  };
}, shot.toString("base64"));
console.log(which, JSON.stringify(out));
await b.close();
