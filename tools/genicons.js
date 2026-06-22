/* Generates raster PNG app icons (no external deps) so the PWA is installable
   on Samsung Internet / Chrome, which require PNG 192 & 512 icons.
   Run: node tools/genicons.js  (outputs to repo root) */
const fs = require('fs');
const zlib = require('zlib');
const path = require('path');

const OUT = path.join(__dirname, '..');
const olive = [107, 114, 83];
const paper = [250, 246, 239];
const clay  = [181, 101, 74];

// CRC32 for PNG chunks
const crcTable = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
  const t = Buffer.from(type, 'ascii');
  const body = Buffer.concat([t, data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}
function encodePNG(width, height, rgba) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;   // bit depth
  ihdr[9] = 6;   // color type RGBA
  ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  // raw image with filter byte 0 per scanline
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0;
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, y * stride + stride);
  }
  const idat = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))]);
}

// Returns [r,g,b] for normalized point (nx,ny) in [0,1]; full-bleed so maskable-safe.
function colorAt(nx, ny) {
  let c = olive; // background
  const inTri = (() => {
    const apexX = 0.5, apexY = 0.27, baseY = 0.44, lx = 0.25, rx = 0.75;
    if (ny < apexY || ny > baseY) return false;
    const t = (ny - apexY) / (baseY - apexY);
    const left = apexX + (lx - apexX) * t;
    const right = apexX + (rx - apexX) * t;
    return nx >= left && nx <= right;
  })();
  if (inTri) c = paper;
  if (nx >= 0.25 && nx <= 0.75 && ny >= 0.44 && ny <= 0.475) c = clay;      // eaves band
  if (nx >= 0.31 && nx <= 0.69 && ny >= 0.475 && ny <= 0.75) c = paper;     // body
  if (ny >= 0.52 && ny <= 0.59 && ((nx >= 0.36 && nx <= 0.435) || (nx >= 0.565 && nx <= 0.64))) c = olive; // windows
  if (nx >= 0.455 && nx <= 0.545 && ny >= 0.62 && ny <= 0.75) c = olive;    // door
  return c;
}

function render(size) {
  const SS = 3; // supersample for antialiasing
  const rgba = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0, g = 0, b = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const nx = (x + (sx + 0.5) / SS) / size;
          const ny = (y + (sy + 0.5) / SS) / size;
          const c = colorAt(nx, ny);
          r += c[0]; g += c[1]; b += c[2];
        }
      }
      const n = SS * SS;
      const i = (y * size + x) * 4;
      rgba[i] = Math.round(r / n);
      rgba[i + 1] = Math.round(g / n);
      rgba[i + 2] = Math.round(b / n);
      rgba[i + 3] = 255;
    }
  }
  return encodePNG(size, size, rgba);
}

for (const size of [180, 192, 512]) {
  const png = render(size);
  const file = path.join(OUT, `icon-${size}.png`);
  fs.writeFileSync(file, png);
  console.log(`wrote ${file} (${png.length} bytes)`);
}
