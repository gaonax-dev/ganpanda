// 굽기 결과 다듬기 (2026-10-31): 라이트맵 PNG(블렌더는 RGBA 로 씀) → 회색조 WebP, manifest 의 파일 이름을 바꾼다
import { readFileSync, writeFileSync, unlinkSync, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';

const OUT = 'public/channel-models';
const mf = JSON.parse(readFileSync(join(OUT, 'manifest.json'), 'utf8'));
let total = 0;
for (const v of mf.variants) {
  for (const mode of ['day', 'night']) {
    for (const k of ['letters', 'wall']) {
      const f = v.lightmaps[mode][k];
      if (!f.endsWith('.png')) continue;
      const src = join(OUT, f), dst = src.replace(/\.png$/, '.webp');
      if (!existsSync(src)) throw new Error(`없음: ${src}`);
      await sharp(src).grayscale().webp({ quality: 85 }).toFile(dst);
      unlinkSync(src);
      v.lightmaps[mode][k] = f.replace(/\.png$/, '.webp');
      total += statSync(dst).size;
    }
  }
}
writeFileSync(join(OUT, 'manifest.json'), JSON.stringify(mf, null, 1));
console.log(`라이트맵 WebP ${Math.round(total / 1024)}KB, glb ${Math.round(mf.variants.reduce((a, v) => a + v.bytes, 0) / 1024)}KB, 종류 ${mf.variants.length}`);
