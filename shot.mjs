import { chromium } from "playwright";
const [out, tag] = [process.argv[2], process.argv[3]];
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
for (const [label, w, h] of [["desktop", 1440, 900], ["phone", 390, 844]]) {
  const page = await b.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 2 });
  const errs = [];
  page.on("pageerror", (e) => errs.push(String(e).slice(0, 200)));
  await page.goto("http://localhost:3000/login", { waitUntil: "networkidle", timeout: 60000 });
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${out}/login-${tag}-${label}.png`, fullPage: false });
  if (label === "desktop") {
    const info = await page.evaluate(() => {
      const pick = (sel) => { const e = document.querySelector(sel); return e ? getComputedStyle(e).fontFamily : "(none)"; };
      const h = document.querySelector("h1,h2,h3");
      return {
        body: getComputedStyle(document.body).fontFamily,
        heading: h ? `${h.tagName} ${getComputedStyle(h).fontFamily} / ls ${getComputedStyle(h).letterSpacing}` : "(no heading)",
        logo: pick(".font-logo"),
        varSans: getComputedStyle(document.documentElement).getPropertyValue("--font-sans").trim().slice(0, 70),
        varHeading: getComputedStyle(document.documentElement).getPropertyValue("--font-heading").trim().slice(0, 70),
      };
    });
    console.log(tag, JSON.stringify(info, null, 1));
    if (errs.length) console.log("page errors:", errs.slice(0, 3));
  }
  await page.close();
}
await b.close();
