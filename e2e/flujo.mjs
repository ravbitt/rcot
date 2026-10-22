// Prueba de punta a punta: login, subida, cotas 3D, plano con 3 vistas y una cota, PDF y enlace de cliente.
// Necesita el servidor corriendo, el administrador de .env y un STEP con frente en −Y (p. ej. de SolidCraft).
import { createRequire } from "node:module";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
const PROJ = fileURLToPath(new URL("..", import.meta.url));
const require = createRequire(PROJ + "/package.json");
const { chromium } = require("@playwright/test");

const BASE = process.env.BASE_URL ?? "http://localhost:3200";
const OUT = process.argv[2];
const env = Object.fromEntries(fs.readFileSync(PROJ + "/.env", "utf8").split("\n").filter((l) => l.includes("=")).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]));
const STEP = process.env.STEP_FILE;
if (!STEP || !OUT) throw new Error("Uso: STEP_FILE=modelo.step [CHROME_BIN=…] [BASE_URL=…] node e2e/flujo.mjs carpeta-salida");
const log = (...a) => console.log("·", ...a);

const browser = await chromium.launch({ executablePath: process.env.CHROME_BIN, args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
const ctx = await browser.newContext({ viewport: { width: 1500, height: 950 } });
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (m) => m.type() === "error" && errors.push(m.text()));

// 1. Login
await page.goto(`${BASE}/admin/login`);
await page.fill("#email", env.ADMIN_EMAIL);
await page.fill("#password", env.ADMIN_PASSWORD);
await page.click("button[type=submit]");
await page.waitForURL(`${BASE}/admin`);
log("login ok");

// 2. Subida
await page.click("text=Subir modelo");
await page.setInputFiles("#file", STEP);
await page.fill("#name", "SMCV prueba");
await page.click("form button[type=submit]");
await page.waitForURL(/\/admin\/modelos\/[^/]+$/, { timeout: 120000 });
const modelId = page.url().split("/").pop();
log("modelo subido", modelId);
await page.waitForSelector("text=Cargando modelo…", { state: "detached", timeout: 60000 });
await page.waitForTimeout(800);
await page.screenshot({ path: `${OUT}/1-modelo.png` });
const piezas = await page.locator("summary", { hasText: "Piezas" }).textContent();
log("piezas:", piezas);

// 3. Cota 3D con clics reales sobre el visor (imán)
const canvas = page.locator("canvas").first();
const box = await canvas.boundingBox();
await page.click("text=Medir");
const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
await page.mouse.click(cx - 120, cy + 40);
await page.mouse.click(cx + 120, cy + 40);
await page.mouse.move(cx, cy + 160);
await page.mouse.click(cx, cy + 160);
await page.waitForTimeout(800);
const dimCount = await page.locator("aside ul li").count();
log("cotas en la lista tras medir:", dimCount);
await page.keyboard.press("Escape");
// una cota exacta por API (coordenadas del SMCV de ejemplo: ancho total del módulo)
const r = await page.evaluate(async (id) => {
  const res = await fetch(`/api/models/${id}/dimensions`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ a: [-489.835, 1182.6, 730], b: [489.835, 1182.6, 730], offset: [0, 1300, 780], axis: "x", label: null }) });
  return res.status;
}, modelId);
log("cota por API:", r);
await page.reload();
await page.waitForSelector("text=Cargando modelo…", { state: "detached", timeout: 60000 });
await page.waitForTimeout(800);
await page.screenshot({ path: `${OUT}/2-cotas.png` });
const labels = await page.locator(".dim-label").allTextContents();
log("etiquetas de cotas:", labels);

// 4. Plano
await page.click("text=Planos (0)");
await page.click("text=Nuevo plano");
await page.waitForURL(/\/planos\/[^/]+$/);
const sheetUrl = page.url();
async function addView(label, scale) {
  await page.locator("button[role=combobox]").first().click();
  await page.getByRole("option", { name: label, exact: true }).click();
  await page.locator("button[role=combobox]").nth(1).click();
  await page.getByRole("option", { name: scale, exact: true }).click();
  await page.getByRole("button", { name: "Vista", exact: true }).click();
  await page.waitForSelector("text=Proyectando vista…", { state: "detached", timeout: 60000 }).catch(() => {});
  await page.waitForTimeout(500);
}
await addView("Vista frontal", "1:10");
// mover la vista frontal a la izquierda
const moveView = async (idx, dx, dy) => {
  const rect = page.locator("svg g[data-view] rect").nth(idx);
  const b = await rect.boundingBox();
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width / 2 + dx, b.y + b.height / 2 + dy, { steps: 5 });
  await page.mouse.up();
};
await moveView(0, -330, 230);
await addView("Vista lateral derecha", "1:10");
await moveView(1, 160, 230);
await addView("Isométrica", "1:10");
await moveView(2, -150, -170);
const counts = await page.evaluate(() => [...document.querySelectorAll("svg g[data-view]")].map((g) => g.querySelectorAll("path")[g.querySelectorAll("path").length - 1].getAttribute("d").split("M").length - 1));
log("segmentos visibles por vista:", counts);

// cota 2D: dos puntos extremos de la vista frontal (por su path) y ubicación debajo
await page.click("button[title='Cota (D)']");
const pts = await page.evaluate(() => {
  const g = document.querySelector("svg g[data-view]");
  const paths = g.querySelectorAll("path");
  const d = paths[paths.length - 1].getAttribute("d");
  const nums = [...d.matchAll(/[ML]([-\d.]+) ([-\d.]+)/g)].map((m) => [+m[1], +m[2]]);
  let minP = nums[0], maxP = nums[0];
  for (const p of nums) {
    if (p[0] < minP[0] || (p[0] === minP[0] && p[1] > minP[1])) minP = p;
    if (p[0] > maxP[0] || (p[0] === maxP[0] && p[1] > maxP[1])) maxP = p;
  }
  const svg = g.ownerSVGElement;
  const ctm = svg.getScreenCTM();
  const toClient = ([x, y]) => { const q = new DOMPoint(x, y).matrixTransform(ctm); return [q.x, q.y]; };
  return { a: toClient(minP), b: toClient(maxP), below: toClient([(minP[0] + maxP[0]) / 2, Math.max(minP[1], maxP[1]) + 12]) };
});
await page.mouse.move(pts.a[0], pts.a[1]);
await page.mouse.click(pts.a[0], pts.a[1]);
await page.mouse.move(pts.b[0], pts.b[1]);
await page.mouse.click(pts.b[0], pts.b[1]);
await page.mouse.move(pts.below[0], pts.below[1], { steps: 4 });
await page.mouse.click(pts.below[0], pts.below[1]);
await page.waitForTimeout(400);
const dimTexts = await page.locator("svg g[data-dim] text").allTextContents();
log("cotas del plano:", dimTexts);
await page.keyboard.press("Escape");
await page.waitForSelector("text=Guardado", { timeout: 15000 });
await page.screenshot({ path: `${OUT}/3-plano-editor.png` });
log("plano guardado");

// 5. Impresión
const printPage = await ctx.newPage();
await printPage.goto(`${sheetUrl}/imprimir`);
await printPage.waitForTimeout(500);
await printPage.screenshot({ path: `${OUT}/4-imprimir.png` });
await printPage.pdf({ path: `${OUT}/plano.pdf`, preferCSSPageSize: true, printBackground: true });
log("pdf generado");

// 6. Enlace de cliente
await page.goto(`${BASE}/admin/modelos/${modelId}`);
await page.click("text=Compartir");
await page.fill("#label", "Cliente de prueba");
await page.click("text=Crear y copiar enlace");
const tokLoc = page.locator("div.font-mono", { hasText: "/v/" }).first();
await tokLoc.waitFor({ timeout: 15000 });
const token = (await tokLoc.textContent()).replace("/v/", "").trim();
log("token:", token.slice(0, 6) + "…");
const anon = await browser.newContext({ viewport: { width: 1300, height: 850 } });
const cp = await anon.newPage();
cp.on("pageerror", (e) => errors.push("cliente: " + e));
await cp.goto(`${BASE}/v/${token}`);
await cp.waitForSelector("text=Cargando modelo…", { state: "detached", timeout: 60000 });
await cp.waitForTimeout(800);
await cp.screenshot({ path: `${OUT}/5-cliente.png` });
await cp.click("text=Planos (1)");
await cp.waitForTimeout(300);
await cp.screenshot({ path: `${OUT}/6-cliente-planos.png` });
// el cliente no puede editar ni ver el admin
const st = await cp.evaluate(async (id) => (await fetch(`/api/models/${id}/dimensions`, { method: "POST", body: "{}" })).status, modelId);
await cp.goto(`${BASE}/admin`);
log("cliente → POST cotas:", st, "| /admin →", cp.url());
const bad = await cp.goto(`${BASE}/v/token-que-no-existe-123456`);
log("token inválido →", bad.status());

log("errores de página:", errors.length ? errors : "ninguno");
await browser.close();
