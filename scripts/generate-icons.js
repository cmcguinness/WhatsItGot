/**
 * Generate simple extension icons as PNG files using Canvas API (Node 18+ compatible).
 * Creates a blue "B" lettermark on a dark background.
 */
const fs = require('fs');
const path = require('path');

// Minimal PNG encoder — creates a simple PNG from raw RGBA pixel data
function createPNG(width, height, pixels) {
  const SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  function crc32(buf) {
    let c = 0xffffffff;
    for (let i = 0; i < buf.length; i++) {
      c = (c >>> 8) ^ CRC_TABLE[(c ^ buf[i]) & 0xff];
    }
    return (c ^ 0xffffffff) >>> 0;
  }

  const CRC_TABLE = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    }
    CRC_TABLE[n] = c >>> 0;
  }

  function chunk(type, data) {
    const typeBuf = Buffer.from(type, 'ascii');
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const combined = Buffer.concat([typeBuf, data]);
    const crcBuf = Buffer.alloc(4);
    crcBuf.writeUInt32BE(crc32(combined));
    return Buffer.concat([len, combined, crcBuf]);
  }

  // IHDR
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace

  // IDAT — raw pixel data with filter byte per row
  const rawData = Buffer.alloc(height * (1 + width * 4));
  for (let y = 0; y < height; y++) {
    rawData[y * (1 + width * 4)] = 0; // filter: none
    for (let x = 0; x < width; x++) {
      const srcIdx = (y * width + x) * 4;
      const dstIdx = y * (1 + width * 4) + 1 + x * 4;
      rawData[dstIdx] = pixels[srcIdx];
      rawData[dstIdx + 1] = pixels[srcIdx + 1];
      rawData[dstIdx + 2] = pixels[srcIdx + 2];
      rawData[dstIdx + 3] = pixels[srcIdx + 3];
    }
  }

  // Compress with zlib
  const zlib = require('zlib');
  const compressed = zlib.deflateSync(rawData);

  const IEND = chunk('IEND', Buffer.alloc(0));

  return Buffer.concat([
    SIGNATURE,
    chunk('IHDR', ihdr),
    chunk('IDAT', compressed),
    IEND
  ]);
}

function drawIcon(size) {
  const pixels = new Uint8Array(size * size * 4);

  // Background: dark blue (#1e293b)
  const bgR = 0x1e, bgG = 0x29, bgB = 0x3b;
  // Accent: blue (#60a5fa)
  const fgR = 0x60, fgG = 0xa5, fgB = 0xfa;

  // Fill background with rounded corners
  const radius = Math.floor(size * 0.18);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = (y * size + x) * 4;

      // Check if inside rounded rect
      let inside = true;
      const corners = [
        [radius, radius],
        [size - 1 - radius, radius],
        [radius, size - 1 - radius],
        [size - 1 - radius, size - 1 - radius]
      ];

      if (x < radius && y < radius) {
        inside = Math.hypot(x - radius, y - radius) <= radius;
      } else if (x > size - 1 - radius && y < radius) {
        inside = Math.hypot(x - (size - 1 - radius), y - radius) <= radius;
      } else if (x < radius && y > size - 1 - radius) {
        inside = Math.hypot(x - radius, y - (size - 1 - radius)) <= radius;
      } else if (x > size - 1 - radius && y > size - 1 - radius) {
        inside = Math.hypot(x - (size - 1 - radius), y - (size - 1 - radius)) <= radius;
      }

      if (inside) {
        pixels[idx] = bgR;
        pixels[idx + 1] = bgG;
        pixels[idx + 2] = bgB;
        pixels[idx + 3] = 255;
      } else {
        pixels[idx + 3] = 0; // transparent
      }
    }
  }

  // Draw "B" letter — using simple rectangle-based approach
  const margin = Math.floor(size * 0.22);
  const strokeW = Math.max(2, Math.floor(size * 0.14));
  const midY = Math.floor(size / 2);

  // Vertical bar of B
  for (let y = margin; y < size - margin; y++) {
    for (let x = margin; x < margin + strokeW; x++) {
      setPixel(pixels, size, x, y, fgR, fgG, fgB);
    }
  }

  // Top horizontal
  for (let y = margin; y < margin + strokeW; y++) {
    for (let x = margin; x < size - margin - Math.floor(strokeW * 0.3); x++) {
      setPixel(pixels, size, x, y, fgR, fgG, fgB);
    }
  }

  // Middle horizontal
  for (let y = midY - Math.floor(strokeW / 2); y < midY + Math.ceil(strokeW / 2); y++) {
    for (let x = margin; x < size - margin - Math.floor(strokeW * 0.3); x++) {
      setPixel(pixels, size, x, y, fgR, fgG, fgB);
    }
  }

  // Bottom horizontal
  for (let y = size - margin - strokeW; y < size - margin; y++) {
    for (let x = margin; x < size - margin - Math.floor(strokeW * 0.3); x++) {
      setPixel(pixels, size, x, y, fgR, fgG, fgB);
    }
  }

  // Right side top bump
  const rightX = size - margin - strokeW;
  for (let y = margin; y < midY; y++) {
    for (let x = rightX; x < rightX + strokeW; x++) {
      setPixel(pixels, size, x, y, fgR, fgG, fgB);
    }
  }

  // Right side bottom bump
  for (let y = midY; y < size - margin; y++) {
    for (let x = rightX; x < rightX + strokeW; x++) {
      setPixel(pixels, size, x, y, fgR, fgG, fgB);
    }
  }

  return createPNG(size, size, pixels);
}

function setPixel(pixels, size, x, y, r, g, b) {
  if (x < 0 || x >= size || y < 0 || y >= size) return;
  const idx = (y * size + x) * 4;
  if (pixels[idx + 3] === 0) return; // don't draw outside rounded rect
  pixels[idx] = r;
  pixels[idx + 1] = g;
  pixels[idx + 2] = b;
  pixels[idx + 3] = 255;
}

const iconsDir = path.join(__dirname, '..', 'icons');
const sizes = [16, 48, 128];

for (const size of sizes) {
  const png = drawIcon(size);
  const outPath = path.join(iconsDir, `icon${size}.png`);
  fs.writeFileSync(outPath, png);
  console.log(`Generated ${outPath} (${png.length} bytes)`);
}
