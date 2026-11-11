// Rasterize one polygon at a time, unioning its interior into a binary mask.
// A second pass clears roofs. Work is expressed in rows so callers can yield.
const LIMIT = 85.05112878;
const mercator = (latitude) => (1 - Math.asinh(Math.tan(latitude * Math.PI / 180)) / Math.PI) / 2;

export function createShadowBitmap(collection, bounds, longestSide = 256) {
  if (!Array.isArray(bounds) || bounds.length !== 4 || !bounds.every(Number.isFinite)) throw new Error('Invalid bounds');
  const [west, south, east, north] = bounds;
  if (west >= east || south >= north || south < -LIMIT || north > LIMIT || !Number.isInteger(longestSide) || longestSide < 1 || longestSide > 1024) throw new Error('Invalid bounds or size');
  const top = mercator(north), bottom = mercator(south), spanX = (east - west) / 360, spanY = bottom - top;
  const scale = longestSide / Math.max(spanX, spanY);
  const width = Math.max(1, Math.ceil(spanX * scale)), height = Math.max(1, Math.ceil(spanY * scale));
  const pixels = new Uint8Array(width * height);
  const shadowFeatures = collection?.features || [], features = [...shadowFeatures, ...(collection?.roofs || [])];
  let featureIndex = 0, polygonIndex = 0, polygon = null, row = 0, lastRow = -1, completed = false;
  function prepareNext() {
    // A view may contain thousands of off-screen polygons. Limit skipped
    // pieces too, not just rows which actually paint a pixel.
    let skipped = 0;
    while (featureIndex < features.length && skipped++ < 10) {
      const geometry = features[featureIndex]?.geometry;
      const polygons = geometry?.type === 'Polygon' ? [geometry.coordinates] : geometry?.type === 'MultiPolygon' ? geometry.coordinates : null;
      if (!Array.isArray(polygons)) throw new Error('Invalid geometry');
      if (polygonIndex >= polygons.length) { featureIndex++; polygonIndex = 0; continue; }
      const rings = polygons[polygonIndex++];
      if (!Array.isArray(rings) || !rings.length) throw new Error('Invalid polygon');
      let minY = Infinity, maxY = -Infinity;
      polygon = rings.map((ring) => {
        if (!Array.isArray(ring) || ring.length < 4) throw new Error('Invalid ring');
        return ring.map((point) => {
          if (!Array.isArray(point) || !Number.isFinite(point[0]) || !Number.isFinite(point[1]) || Math.abs(point[1]) > LIMIT) throw new Error('Invalid point');
          const x = ((point[0] - west) / 360) * width / spanX, y = (mercator(point[1]) - top) * height / spanY;
          minY = Math.min(minY, y); maxY = Math.max(maxY, y);
          return [x, y];
        });
      });
      row = Math.max(0, Math.ceil(minY - .5));
      lastRow = Math.min(height - 1, Math.ceil(maxY - .5) - 1);
      if (row <= lastRow) return true;
      polygon = null;
    }
    if (featureIndex >= features.length) { completed = true; return false; }
    return null;
  }
  function fillRow() {
    const y = row + .5, intersections = [];
    for (const ring of polygon) for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const a = ring[j], b = ring[i];
      if ((a[1] > y) !== (b[1] > y)) intersections.push(a[0] + (y - a[1]) * (b[0] - a[0]) / (b[1] - a[1]));
    }
    intersections.sort((a, b) => a - b);
    const value = featureIndex < shadowFeatures.length ? 1 : 0;
    for (let i = 0; i + 1 < intersections.length; i += 2) {
      const first = Math.max(0, Math.ceil(intersections[i] - .5));
      const end = Math.min(width, Math.ceil(intersections[i + 1] - .5));
      if (first < end) pixels.fill(value, row * width + first, row * width + end);
    }
    if (++row > lastRow) polygon = null;
  }
  return {
    step(maxRows = 100) {
      if (!Number.isSafeInteger(maxRows) || maxRows < 1) throw new RangeError('Invalid raster batch');
      let rows = 0;
      while (!completed && rows < maxRows) {
        if (!polygon) {
          const prepared = prepareNext();
          if (prepared !== true) break;
        }
        fillRow(); rows++;
      }
      return completed;
    },
    result() {
      if (!completed) throw new Error('Raster incomplete');
      return { pixels, width, height, bounds: [[north, east], [south, west]] };
    },
  };
}

const CRC_TABLE = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  CRC_TABLE[n] = c >>> 0;
}
const write32 = (a, p, n) => { a[p] = n >>> 24; a[p + 1] = n >>> 16; a[p + 2] = n >>> 8; a[p + 3] = n; };
const BASE64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

// A standards-compliant PNG with uncompressed DEFLATE. The larger file avoids
// native canvas rasterization and keeps encoding deterministic and chunkable.
export function createShadowPng(bitmap, color = [48, 67, 73, 66], supersample = 1) {
  const { width: sourceWidth, height: sourceHeight, pixels } = bitmap || {};
  if (!Number.isSafeInteger(sourceWidth) || !Number.isSafeInteger(sourceHeight) || sourceWidth < 1 || sourceHeight < 1 || sourceWidth > 1024 || sourceHeight > 1024 || !(pixels instanceof Uint8Array) || pixels.length !== sourceWidth * sourceHeight || ![1, 2].includes(supersample)) throw new Error('Invalid bitmap');
  const width = Math.ceil(sourceWidth / supersample), height = Math.ceil(sourceHeight / supersample);
  const rowBytes = 1 + width * 4, rawLength = rowBytes * height, blocks = Math.ceil(rawLength / 65535);
  const zLength = 2 + blocks * 5 + rawLength + 4;
  const png = new Uint8Array(8 + 25 + 12 + zLength + 12);
  png.set([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82]);
  write32(png, 16, width); write32(png, 20, height);
  png.set([8, 6, 0, 0, 0], 24);
  let crc = 0xffffffff;
  for (let i = 12; i < 29; i++) crc = CRC_TABLE[(crc ^ png[i]) & 255] ^ (crc >>> 8);
  write32(png, 29, (crc ^ 0xffffffff) >>> 0);
  write32(png, 33, zLength); png.set([73, 68, 65, 84, 0x78, 0x01], 37);
  let rawPos = 0, pos = 43, a = 1, b = 0, blockRemaining = 0, stage = 'raw', crcPos = 37, base64Pos = 0;
  let encoded = '';
  function rawByte(i) {
    const col = i % rowBytes;
    if (col === 0) return 0;
    const x = Math.floor((col - 1) / 4), y = Math.floor(i / rowBytes), channel = (col - 1) % 4;
    if (channel !== 3) return color[channel];
    let coverage = 0, total = 0;
    for (let dy = 0; dy < supersample; dy++) for (let dx = 0; dx < supersample; dx++) {
      const sx = x * supersample + dx, sy = y * supersample + dy;
      if (sx < sourceWidth && sy < sourceHeight) { total++; coverage += pixels[sy * sourceWidth + sx]; }
    }
    return Math.round(color[3] * coverage / total);
  }
  function advanceRaw(limit) {
    let work = 0;
    while (rawPos < rawLength && work < limit) {
      if (!blockRemaining) {
        blockRemaining = Math.min(65535, rawLength - rawPos);
        const len = blockRemaining, inverted = (~len) & 65535;
        png[pos++] = rawPos + len === rawLength ? 1 : 0;
        png[pos++] = len & 255; png[pos++] = len >>> 8;
        png[pos++] = inverted & 255; png[pos++] = inverted >>> 8;
      }
      const byte = rawByte(rawPos++);
      png[pos++] = byte; blockRemaining--; a = (a + byte) % 65521; b = (b + a) % 65521; work++;
    }
    if (rawPos === rawLength) { write32(png, pos, ((b << 16) | a) >>> 0); pos += 4; crc = 0xffffffff; stage = 'crc'; }
  }
  function advanceCrc(limit) {
    const end = Math.min(41 + zLength, crcPos + limit);
    while (crcPos < end) crc = CRC_TABLE[(crc ^ png[crcPos++]) & 255] ^ (crc >>> 8);
    if (crcPos === end && end === 41 + zLength) {
      write32(png, pos, (crc ^ 0xffffffff) >>> 0); pos += 4;
      png.set([0, 0, 0, 0, 73, 69, 78, 68, 174, 66, 96, 130], pos);
      stage = 'base64';
    }
  }
  function advanceBase64(limit) {
    const end = Math.min(png.length, base64Pos + limit - limit % 3), parts = [];
    while (base64Pos + 2 < end) {
      const value = (png[base64Pos] << 16) | (png[base64Pos + 1] << 8) | png[base64Pos + 2];
      parts.push(BASE64[value >>> 18], BASE64[(value >>> 12) & 63], BASE64[(value >>> 6) & 63], BASE64[value & 63]);
      base64Pos += 3;
    }
    if (end === png.length && base64Pos < end) {
      const a = png[base64Pos++], b = base64Pos < end ? png[base64Pos++] : null;
      parts.push(BASE64[a >>> 2], BASE64[((a & 3) << 4) | ((b ?? 0) >>> 4)], b == null ? '=' : BASE64[(b & 15) << 2], '=');
    }
    encoded += parts.join('');
    if (base64Pos === png.length) stage = 'done';
  }
  return {
    step(maxBytes = 8192) {
      if (!Number.isSafeInteger(maxBytes) || maxBytes < 3) throw new RangeError('Invalid encoding batch');
      if (stage === 'raw') advanceRaw(maxBytes);
      else if (stage === 'crc') advanceCrc(maxBytes);
      else if (stage === 'base64') advanceBase64(maxBytes);
      return stage === 'done';
    },
    result() { if (stage !== 'done') throw new Error('PNG incomplete'); return encoded; },
  };
}
