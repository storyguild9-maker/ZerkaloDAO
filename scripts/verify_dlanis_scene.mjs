import { chromium } from "playwright-core";

const url = process.argv[2] ?? "http://127.0.0.1:3001/inner";
const output = process.argv[3] ?? "tmp/dlanis-inner-scene.png";
const browser = await chromium.launch({
  headless: true,
  executablePath: "C:/Program Files/BraveSoftware/Brave-Browser/Application/brave.exe",
  args: ["--use-angle=swiftshader", "--enable-webgl", "--ignore-gpu-blocklist"],
});
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
const consoleErrors = [];
const failedRequests = [];
page.on("console", (message) => {
  if (message.type() === "error") consoleErrors.push(message.text());
});
page.on("requestfailed", (request) => {
  failedRequests.push(`${request.url()} :: ${request.failure()?.errorText ?? "failed"}`);
});

await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60_000 });
await page.waitForTimeout(120_000);
await page.screenshot({ path: output, fullPage: false });
const report = await page.evaluate(() => {
  const canvas = document.querySelector("canvas");
  return {
    title: document.title,
    bodyText: document.body.innerText.slice(0, 1200),
    canvas: canvas ? { width: canvas.width, height: canvas.height, rect: canvas.getBoundingClientRect().toJSON() } : null,
    nextErrorOverlay: Boolean(document.querySelector("nextjs-portal")),
  };
});
console.log(JSON.stringify({ ...report, consoleErrors, failedRequests, output }, null, 2));
await browser.close();
