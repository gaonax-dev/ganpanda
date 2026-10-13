// onnxruntime-web 의 wasm 런타임을 public/ort 로 복사 (외부 CDN 대신 자체 호스팅)
import { copyFileSync, mkdirSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
const src = 'node_modules/onnxruntime-web/dist';
const dst = 'public/ort';
mkdirSync(dst, { recursive: true });
let n = 0;
for (const f of readdirSync(src)) {
  if (/^ort-wasm-simd-threaded.*\.(wasm|mjs)$/.test(f)) { copyFileSync(join(src, f), join(dst, f)); n++; }
}
console.log(`ort 런타임 ${n}개 복사`);
