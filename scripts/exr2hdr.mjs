// 사용: node scripts/exr2hdr.mjs docs/environments/<이름>_1k.exr public/env/<이름>.hdr [가로px=512]
// EXR(float RGBA) → 작은 RGBE .hdr (three RGBELoader 용). 상자 필터로 줄인다
import { readFileSync, writeFileSync } from 'node:fs';
import { EXRLoader } from 'three/examples/jsm/loaders/EXRLoader.js';
import * as THREE from 'three';
const [,, src, dst, W = '512'] = process.argv;
const loader = new EXRLoader(); loader.setDataType(THREE.FloatType);
const buf = readFileSync(src);
const ex = loader.parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
const { width: w0, height: h0, data, format } = ex;
const ch = format === THREE.RGBAFormat ? 4 : 3;
const w = Number(W), h = w / 2, fx = w0 / w, fy = h0 / h;
const out = new Uint8Array(w * h * 4);
const bytes = ['#?RADIANCE', 'FORMAT=32-bit_rle_rgbe', '', `-Y ${h} +X ${w}`, ''].join('\n');
for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
  let r = 0, g = 0, b = 0, n = 0;
  const x0 = Math.floor(x * fx), x1 = Math.floor((x + 1) * fx), y0 = Math.floor(y * fy), y1 = Math.floor((y + 1) * fy);
  for (let yy = y0; yy < y1; yy++) for (let xx = x0; xx < x1; xx++) { const i = (yy * w0 + xx) * ch; r += data[i]; g += data[i + 1]; b += data[i + 2]; n++; }
  r /= n; g /= n; b /= n;
  const o = (y * w + x) * 4; // EXR 은 아래→위 저장일 수 있어 three 가 뒤집어 준 데이터: -Y 로 적으면 위→아래. three parse 는 flipY 기준이라 y 뒤집기
  const m = Math.max(r, g, b);
  if (m < 1e-32) { out.set([0, 0, 0, 0], o); continue; }
  let e = Math.ceil(Math.log2(m)); let s = Math.pow(2, -e) * 256; if (m * s >= 256) { e++; s /= 2; }
  out[o] = Math.min(255, r * s); out[o + 1] = Math.min(255, g * s); out[o + 2] = Math.min(255, b * s); out[o + 3] = e + 128;
}
// three 의 EXR parse 결과는 첫 행이 이미지 아래쪽(flipY=false 로 쓰는 DataTexture 관례) → .hdr 의 -Y(위→아래)에 맞게 행 순서 뒤집기
const flipped = new Uint8Array(out.length);
for (let y = 0; y < h; y++) flipped.set(out.subarray(y * w * 4, (y + 1) * w * 4), (h - 1 - y) * w * 4);
writeFileSync(dst, Buffer.concat([Buffer.from(bytes, 'ascii'), Buffer.from(flipped)]));
console.log(dst, w, h, (Buffer.byteLength(bytes) + flipped.length) / 1024 | 0, 'KB', 'src', w0, h0, 'ch', ch);
