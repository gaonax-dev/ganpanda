// Vite 가 onnxruntime-web 의 import.meta.url 참조 때문에 내보내는 wasm 을 dist 에서 제거한다.
// 런타임은 wasmPaths 로 우리 서버(/api/models/ort/)에서 받으므로 필요 없고, 25MiB 정적 에셋 한도도 넘는다.
import { readdirSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
const dir = 'dist/assets';
let n = 0;
for (const f of readdirSync(dir)) if (/^ort-wasm.*\.wasm$/.test(f)) { unlinkSync(join(dir, f)); n++; }
console.log(`번들에서 ORT wasm ${n}개 제거`);
