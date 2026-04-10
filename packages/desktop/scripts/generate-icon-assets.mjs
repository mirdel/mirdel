import { app, nativeImage } from "electron";
import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";

function getArg(name, fallback = "") {
  const key = `--${name}=`;
  const hit = process.argv.find((arg) => arg.startsWith(key));
  return hit ? hit.slice(key.length) : fallback;
}

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: "inherit" });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} exited with code ${code}`));
    });
  });
}

function buildIcoFromPngBuffers(entries) {
  const count = entries.length;
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(count, 4);

  const dir = Buffer.alloc(count * 16);
  let offset = 6 + count * 16;

  entries.forEach((entry, i) => {
    const base = i * 16;
    const wh = entry.size >= 256 ? 0 : entry.size;
    dir.writeUInt8(wh, base + 0); // width
    dir.writeUInt8(wh, base + 1); // height
    dir.writeUInt8(0, base + 2); // color count
    dir.writeUInt8(0, base + 3); // reserved
    dir.writeUInt16LE(1, base + 4); // planes
    dir.writeUInt16LE(32, base + 6); // bit count
    dir.writeUInt32LE(entry.data.length, base + 8); // size
    dir.writeUInt32LE(offset, base + 12); // offset
    offset += entry.data.length;
  });

  return Buffer.concat([header, dir, ...entries.map((e) => e.data)]);
}

async function renderPngFromSvg({ svgPath, size, outputPath }) {
  const source = nativeImage.createFromPath(svgPath);
  if (source.isEmpty()) {
    throw new Error(`Failed to load SVG: ${svgPath}`);
  }
  const rendered = source.resize({
    width: size,
    height: size,
    quality: "best"
  });
  await fs.writeFile(outputPath, rendered.toPNG());
}

async function main() {
  const inputSvg = getArg("input");
  const buildDir = getArg("build-dir");

  if (!inputSvg || !buildDir) {
    throw new Error("Usage: --input=/abs/icon.svg --build-dir=/abs/build");
  }

  const iconsetDir = path.join(buildDir, "icon.iconset");
  await fs.mkdir(iconsetDir, { recursive: true });

  const iconsetTargets = [
    { size: 16, file: "icon_16x16.png" },
    { size: 32, file: "icon_16x16@2x.png" },
    { size: 32, file: "icon_32x32.png" },
    { size: 64, file: "icon_32x32@2x.png" },
    { size: 128, file: "icon_128x128.png" },
    { size: 256, file: "icon_128x128@2x.png" },
    { size: 256, file: "icon_256x256.png" },
    { size: 512, file: "icon_256x256@2x.png" },
    { size: 512, file: "icon_512x512.png" },
    { size: 1024, file: "icon_512x512@2x.png" }
  ];

  // Render every iconset slot directly from SVG.
  for (const target of iconsetTargets) {
    await renderPngFromSvg({
      svgPath: inputSvg,
      size: target.size,
      outputPath: path.join(iconsetDir, target.file)
    });
  }

  await renderPngFromSvg({
    svgPath: inputSvg,
    size: 1024,
    outputPath: path.join(buildDir, "icon.svg.png")
  });
  await renderPngFromSvg({
    svgPath: inputSvg,
    size: 512,
    outputPath: path.join(buildDir, "icon.png")
  });

  await run("iconutil", ["-c", "icns", iconsetDir, "-o", path.join(buildDir, "icon.icns")]);

  // Multi-size ICO: embed PNG payloads for common Windows icon sizes.
  const icoSizes = [16, 24, 32, 48, 64, 128, 256];
  const icoEntries = [];
  for (const size of icoSizes) {
    const tmp = path.join(buildDir, `icon.ico.${size}.png`);
    await renderPngFromSvg({ svgPath: inputSvg, size, outputPath: tmp });
    const data = await fs.readFile(tmp);
    icoEntries.push({ size, data, tmp });
  }

  const icoBuffer = buildIcoFromPngBuffers(icoEntries.map(({ size, data }) => ({ size, data })));
  await fs.writeFile(path.join(buildDir, "icon.ico"), icoBuffer);

  await Promise.all(icoEntries.map((entry) => fs.unlink(entry.tmp)));
}

app.commandLine.appendSwitch("force-device-scale-factor", "1");

app.whenReady()
  .then(main)
  .then(() => app.quit())
  .catch((error) => {
    console.error(error);
    app.quit();
    process.exitCode = 1;
  });
