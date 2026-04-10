import { app, BrowserWindow } from "electron";
import fs from "node:fs/promises";
import path from "node:path";

function getArg(name, fallback) {
  const key = `--${name}=`;
  const hit = process.argv.find((arg) => arg.startsWith(key));
  if (!hit) return fallback;
  return hit.slice(key.length);
}

const input = getArg("input", "");
const output = getArg("output", "");
const size = Number(getArg("size", "1024"));

if (!input || !output || !Number.isFinite(size) || size <= 0) {
  console.error("Usage: electron render-svg-icon.mjs --input=/abs/icon.svg --output=/abs/icon.png --size=1024");
  process.exit(1);
}

app.commandLine.appendSwitch("force-device-scale-factor", "1");

async function renderSvgToPng() {
  const svg = await fs.readFile(input, "utf8");
  const svgUrl = `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;

  const html = `<!doctype html>
<html>
  <body style="margin:0;background:transparent;overflow:hidden;width:100vw;height:100vh;">
    <img id="icon" src="${svgUrl}" style="width:100%;height:100%;display:block;" />
  </body>
</html>`;

  const win = new BrowserWindow({
    width: size,
    height: size,
    show: false,
    frame: false,
    transparent: true,
    backgroundColor: "#00000000",
    webPreferences: {
      sandbox: false
    }
  });

  try {
    await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
    await win.webContents.executeJavaScript(`
      new Promise((resolve, reject) => {
        const img = document.getElementById("icon");
        if (!img) return reject(new Error("icon img not found"));
        const done = () => requestAnimationFrame(() => requestAnimationFrame(resolve));
        if (img.complete) return done();
        img.onload = done;
        img.onerror = () => reject(new Error("icon img failed to load"));
      });
    `);

    const image = await win.webContents.capturePage({ x: 0, y: 0, width: size, height: size });
    await fs.mkdir(path.dirname(output), { recursive: true });
    await fs.writeFile(output, image.toPNG());
  } finally {
    if (!win.isDestroyed()) win.destroy();
  }
}

app.whenReady().then(async () => {
  try {
    await renderSvgToPng();
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  } finally {
    app.quit();
  }
});
