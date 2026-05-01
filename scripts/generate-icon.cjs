const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const rootDir = path.join(__dirname, '..');
const buildDir = path.join(rootDir, 'build');
const sizes = [16, 24, 32, 48, 64, 128, 256];
const supersample = 4;

function clamp(value, min = 0, max = 255) {
  return Math.max(min, Math.min(max, value));
}

function hexToRgb(hex) {
  const clean = hex.replace('#', '');
  return {
    r: parseInt(clean.slice(0, 2), 16),
    g: parseInt(clean.slice(2, 4), 16),
    b: parseInt(clean.slice(4, 6), 16)
  };
}

function mixColor(a, b, t) {
  return {
    r: Math.round(a.r + ((b.r - a.r) * t)),
    g: Math.round(a.g + ((b.g - a.g) * t)),
    b: Math.round(a.b + ((b.b - a.b) * t))
  };
}

function createSurface(size) {
  const scale = supersample;
  const width = size * scale;
  const height = size * scale;
  return {
    size,
    scale,
    width,
    height,
    data: Buffer.alloc(width * height * 4)
  };
}

function blendPixel(surface, px, py, color) {
  if (px < 0 || py < 0 || px >= surface.width || py >= surface.height) {
    return;
  }

  const index = (py * surface.width + px) * 4;
  const srcA = clamp(color.a ?? 255) / 255;
  const dstA = surface.data[index + 3] / 255;
  const outA = srcA + (dstA * (1 - srcA));
  if (outA <= 0) {
    return;
  }

  surface.data[index] = Math.round(((color.r * srcA) + (surface.data[index] * dstA * (1 - srcA))) / outA);
  surface.data[index + 1] = Math.round(((color.g * srcA) + (surface.data[index + 1] * dstA * (1 - srcA))) / outA);
  surface.data[index + 2] = Math.round(((color.b * srcA) + (surface.data[index + 2] * dstA * (1 - srcA))) / outA);
  surface.data[index + 3] = Math.round(outA * 255);
}

function fillRoundedRect(surface, x, y, width, height, radius, colorForPoint) {
  const scale = surface.scale;
  const sx = Math.round(x * scale);
  const sy = Math.round(y * scale);
  const sw = Math.round(width * scale);
  const sh = Math.round(height * scale);
  const sr = Math.round(radius * scale);
  const right = sx + sw;
  const bottom = sy + sh;

  for (let py = sy; py < bottom; py += 1) {
    for (let px = sx; px < right; px += 1) {
      const dx = px < sx + sr ? sx + sr - px : (px >= right - sr ? px - (right - sr - 1) : 0);
      const dy = py < sy + sr ? sy + sr - py : (py >= bottom - sr ? py - (bottom - sr - 1) : 0);
      if ((dx * dx) + (dy * dy) > sr * sr) {
        continue;
      }

      const logicalY = py / scale;
      const color = typeof colorForPoint === 'function' ? colorForPoint(logicalY) : colorForPoint;
      blendPixel(surface, px, py, color);
    }
  }
}

function fillCircle(surface, cx, cy, radius, color) {
  const scale = surface.scale;
  const scx = cx * scale;
  const scy = cy * scale;
  const sr = radius * scale;
  const minX = Math.floor(scx - sr);
  const maxX = Math.ceil(scx + sr);
  const minY = Math.floor(scy - sr);
  const maxY = Math.ceil(scy + sr);

  for (let py = minY; py <= maxY; py += 1) {
    for (let px = minX; px <= maxX; px += 1) {
      const dx = px - scx;
      const dy = py - scy;
      if ((dx * dx) + (dy * dy) <= sr * sr) {
        blendPixel(surface, px, py, color);
      }
    }
  }
}

function fillLine(surface, x1, y1, x2, y2, thickness, color) {
  const scale = surface.scale;
  const sx1 = x1 * scale;
  const sy1 = y1 * scale;
  const sx2 = x2 * scale;
  const sy2 = y2 * scale;
  const radius = (thickness * scale) / 2;
  const minX = Math.floor(Math.min(sx1, sx2) - radius);
  const maxX = Math.ceil(Math.max(sx1, sx2) + radius);
  const minY = Math.floor(Math.min(sy1, sy2) - radius);
  const maxY = Math.ceil(Math.max(sy1, sy2) + radius);
  const dx = sx2 - sx1;
  const dy = sy2 - sy1;
  const lengthSquared = (dx * dx) + (dy * dy);

  for (let py = minY; py <= maxY; py += 1) {
    for (let px = minX; px <= maxX; px += 1) {
      const t = lengthSquared === 0 ? 0 : clamp(((px - sx1) * dx + (py - sy1) * dy) / lengthSquared, 0, 1);
      const closestX = sx1 + (dx * t);
      const closestY = sy1 + (dy * t);
      const distanceX = px - closestX;
      const distanceY = py - closestY;
      if ((distanceX * distanceX) + (distanceY * distanceY) <= radius * radius) {
        blendPixel(surface, px, py, color);
      }
    }
  }
}

function downsample(surface) {
  const output = Buffer.alloc(surface.size * surface.size * 4);
  const scale = surface.scale;

  for (let y = 0; y < surface.size; y += 1) {
    for (let x = 0; x < surface.size; x += 1) {
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      for (let sy = 0; sy < scale; sy += 1) {
        for (let sx = 0; sx < scale; sx += 1) {
          const sourceIndex = (((y * scale + sy) * surface.width) + (x * scale + sx)) * 4;
          r += surface.data[sourceIndex];
          g += surface.data[sourceIndex + 1];
          b += surface.data[sourceIndex + 2];
          a += surface.data[sourceIndex + 3];
        }
      }
      const count = scale * scale;
      const targetIndex = ((y * surface.size) + x) * 4;
      output[targetIndex] = Math.round(r / count);
      output[targetIndex + 1] = Math.round(g / count);
      output[targetIndex + 2] = Math.round(b / count);
      output[targetIndex + 3] = Math.round(a / count);
    }
  }

  return output;
}

function crc32(buffer) {
  let crc = 0xffffffff;
  for (let i = 0; i < buffer.length; i += 1) {
    crc ^= buffer[i];
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const typeBuffer = Buffer.from(type, 'ascii');
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 0);
  return Buffer.concat([length, typeBuffer, data, crc]);
}

function encodePng(width, height, rgba) {
  const scanlineLength = (width * 4) + 1;
  const raw = Buffer.alloc(scanlineLength * height);
  for (let y = 0; y < height; y += 1) {
    raw[y * scanlineLength] = 0;
    rgba.copy(raw, (y * scanlineLength) + 1, y * width * 4, (y + 1) * width * 4);
  }

  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 6;
  header[10] = 0;
  header[11] = 0;
  header[12] = 0;

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk('IHDR', header),
    pngChunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    pngChunk('IEND', Buffer.alloc(0))
  ]);
}

function drawIcon(size) {
  const surface = createSurface(size);
  const top = hexToRgb('#35aa91');
  const bottom = hexToRgb('#1f5967');
  const white = { r: 255, g: 255, b: 255, a: 246 };
  const cardBottom = hexToRgb('#edf7f4');

  fillRoundedRect(surface, 18, 18, 220, 220, 50, (y) => ({
    ...mixColor(top, bottom, clamp((y - 18) / 220, 0, 1)),
    a: 255
  }));
  fillRoundedRect(surface, 56, 44, 144, 168, 24, (y) => ({
    ...mixColor(white, cardBottom, clamp((y - 44) / 168, 0, 1)),
    a: 246
  }));

  fillLine(surface, 92, 86, 104, 98, 12, { r: 35, g: 136, b: 117, a: 255 });
  fillLine(surface, 104, 98, 128, 70, 12, { r: 35, g: 136, b: 117, a: 255 });
  fillRoundedRect(surface, 132, 76, 42, 14, 7, { r: 44, g: 91, b: 154, a: 255 });
  fillRoundedRect(surface, 88, 122, 82, 14, 7, { r: 180, g: 48, b: 48, a: 255 });
  fillRoundedRect(surface, 88, 158, 54, 14, 7, { r: 47, g: 123, b: 76, a: 255 });
  fillCircle(surface, 178, 165, 8, { r: 47, g: 123, b: 76, a: 255 });

  return encodePng(size, size, downsample(surface));
}

function buildIco(pngs) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(pngs.length, 4);

  const directory = Buffer.alloc(16 * pngs.length);
  let offset = header.length + directory.length;

  pngs.forEach(({ size, data }, index) => {
    const entryOffset = index * 16;
    directory[entryOffset] = size >= 256 ? 0 : size;
    directory[entryOffset + 1] = size >= 256 ? 0 : size;
    directory[entryOffset + 2] = 0;
    directory[entryOffset + 3] = 0;
    directory.writeUInt16LE(1, entryOffset + 4);
    directory.writeUInt16LE(32, entryOffset + 6);
    directory.writeUInt32LE(data.length, entryOffset + 8);
    directory.writeUInt32LE(offset, entryOffset + 12);
    offset += data.length;
  });

  return Buffer.concat([header, directory, ...pngs.map((item) => item.data)]);
}

fs.mkdirSync(buildDir, { recursive: true });

const pngs = sizes.map((size) => ({ size, data: drawIcon(size) }));
fs.writeFileSync(path.join(buildDir, 'icon.png'), pngs[pngs.length - 1].data);
fs.writeFileSync(path.join(buildDir, 'icon.ico'), buildIco(pngs));

console.log('Generated build/icon.ico and build/icon.png');
