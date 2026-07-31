import { chromium } from "playwright-core";

const browser = await chromium.launch({
  headless: true,
  executablePath: "C:/Program Files/BraveSoftware/Brave-Browser/Application/brave.exe",
  args: ["--use-angle=swiftshader", "--enable-webgl", "--ignore-gpu-blocklist"],
});
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
const consoleErrors = [];
const failedRequests = [];
page.on("console", (message) => {
  if (message.type() === "error") consoleErrors.push(message.text());
});
page.on("requestfailed", (request) => {
  failedRequests.push(`${request.url()} :: ${request.failure()?.errorText ?? "failed"}`);
});

await page.goto("http://127.0.0.1:3001/inner", { waitUntil: "domcontentloaded", timeout: 60_000 });
await page.locator('select[aria-label="Выбор управляемого аватара"]').selectOption("azure-aegis-armed-v3");
await page.waitForTimeout(120_000);

const editor = page.locator(".meshy-dlanis-editor");
await editor.getByRole("button", { name: "Проиграть" }).click();
await page.waitForTimeout(8_000);
await page.screenshot({ path: "tmp/dlanis-editor-final.png", fullPage: false });
const report = {
  editorVisible: await editor.isVisible(),
  weaponOptions: await editor.locator('select[aria-label="Оружие DLANIS"] option').allTextContents(),
  controls: await editor.locator("label").allTextContents(),
  canvas: await page.locator("canvas").evaluate((canvas) => ({ width: canvas.width, height: canvas.height })),
  nextErrorOverlay: await page.locator("nextjs-portal").count(),
  consoleErrors,
  failedRequests,
};
console.log(JSON.stringify(report, null, 2));
await browser.close();
