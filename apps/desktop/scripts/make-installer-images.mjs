// Generates the NSIS branding bitmaps (24-bit BMP) from assets/icon.svg with headless Chromium.
// Usage: node scripts/make-installer-images.mjs [path-to-chrome-headless-shell.exe]
// No npm deps: PNG decoding uses node:zlib, the BMP writer is below.
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { inflateSync } from "node:zlib";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const chrome = process.argv[2] ?? join(process.env.LOCALAPPDATA ?? "", "ms-playwright/chromium_headless_shell-1234/chrome-headless-shell-win64/chrome-headless-shell.exe");
if (!existsSync(chrome)) throw new Error(`chrome-headless-shell not found: ${chrome}`);
const icon = pathToFileURL(join(root, "assets/icon.svg")).href;
const out = join(root, "src-tauri/installer");

const base = (w, h, body) => `<!doctype html><meta charset="utf-8"><style>
html,body{margin:0;width:${w}px;height:${h}px;overflow:hidden;background:#0d0b0b;font-family:'Courier New',monospace}
body{background:radial-gradient(120% 90% at 50% 25%,#2b1416 0%,#120b0c 60%,#080606 100%);position:relative}
${body}</style>`;
const pages = {
  "sidebar.bmp": { w: 164, h: 314, html: base(164, 314, `
img{position:absolute;left:22px;top:46px;width:120px;height:120px}
.t{position:absolute;left:0;right:0;top:186px;text-align:center;color:#d11f33;font-size:15px;letter-spacing:2px;line-height:1.5}
.s{position:absolute;left:0;right:0;bottom:18px;text-align:center;color:#8a6a6c;font-size:10px;letter-spacing:1px}
.l{position:absolute;left:0;right:0;top:0;height:3px;background:#d11f33}
</style><div class="l"></div><img src="${icon}"><div class="t">THE<br>MENTALIST<br>ARCHIVE</div><div class="s">ARCHIVO OFFLINE</div>`) },
  "header.bmp": { w: 150, h: 57, html: base(150, 57, `
img{position:absolute;right:6px;top:4px;width:49px;height:49px}
.t{position:absolute;left:7px;top:17px;color:#d11f33;font-size:9px;letter-spacing:.5px;line-height:1.4}
.l{position:absolute;left:0;right:0;bottom:0;height:2px;background:#d11f33}
</style><div class="t">THE MENTALIST<br>ARCHIVE</div><img src="${icon}"><div class="l"></div>`) },
};

function decodePng(buf) {
  let p = 8, w = 0, h = 0, ct = 0; const idat = [];
  while (p < buf.length) {
    const len = buf.readUInt32BE(p), type = buf.toString("ascii", p + 4, p + 8), d = buf.subarray(p + 8, p + 8 + len);
    if (type === "IHDR") { w = d.readUInt32BE(0); h = d.readUInt32BE(4); ct = d[9]; if (d[8] !== 8 || d[12] !== 0) throw new Error("unsupported PNG"); }
    if (type === "IDAT") idat.push(d);
    p += 12 + len;
  }
  const bpp = ct === 6 ? 4 : ct === 2 ? 3 : 0; if (!bpp) throw new Error("unsupported PNG colour type " + ct);
  const raw = inflateSync(Buffer.concat(idat)), stride = w * bpp, px = Buffer.alloc(h * stride);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)], src = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? px[y * stride + x - bpp] : 0, b = y ? px[(y - 1) * stride + x] : 0, c = x >= bpp && y ? px[(y - 1) * stride + x - bpp] : 0;
      const pa = Math.abs(b - c), pb = Math.abs(a - c), pc = Math.abs(a + b - 2 * c);
      const pr = f === 0 ? 0 : f === 1 ? a : f === 2 ? b : f === 3 ? (a + b) >> 1 : (pa <= pb && pa <= pc ? a : pb <= pc ? b : c);
      px[y * stride + x] = (src[x] + pr) & 255;
    }
  }
  return { w, h, bpp, px };
}
function bmp24({ w, h, bpp, px }) {
  const row = (w * 3 + 3) & ~3, out = Buffer.alloc(54 + row * h);
  out.write("BM"); out.writeUInt32LE(out.length, 2); out.writeUInt32LE(54, 10); out.writeUInt32LE(40, 14);
  out.writeInt32LE(w, 18); out.writeInt32LE(h, 22); out.writeUInt16LE(1, 26); out.writeUInt16LE(24, 28); out.writeUInt32LE(row * h, 34);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const s = (y * w + x) * bpp, d = 54 + (h - 1 - y) * row + x * 3;
    out[d] = px[s + 2]; out[d + 1] = px[s + 1]; out[d + 2] = px[s];
  }
  return out;
}

const tmp = mkdtempSync(join(tmpdir(), "mentalist-img-"));
try {
  for (const [name, { w, h, html }] of Object.entries(pages)) {
    const page = join(tmp, name + ".html"), png = join(tmp, name + ".png");
    writeFileSync(page, html);
    execFileSync(chrome, ["--hide-scrollbars", "--force-device-scale-factor=1", `--window-size=${w},${h}`, `--screenshot=${png}`, "--allow-file-access-from-files", pathToFileURL(page).href], { stdio: "ignore" });
    const img = decodePng(readFileSync(png));
    if (img.w !== w || img.h !== h) throw new Error(`${name}: got ${img.w}x${img.h}, expected ${w}x${h}`);
    writeFileSync(join(out, name), bmp24(img));
    console.log(`${name} ${w}x${h}`);
  }
} finally { rmSync(tmp, { recursive: true, force: true }); }
