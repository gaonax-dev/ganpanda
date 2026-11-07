// 맥 앱(시스템 WebKit, macOS 26.1) 에서 PDF 받기 (2026-11-07 사용자: "파일 고르기 -> 파일을 처리하지 못했습니다.")
// 원인: pdf.js 6.x 일반 빌드는 Map.prototype.getOrInsertComputed · Math.sumPrecise · Uint8Array.toHex 등 아주 새 기능을 대체 코드 없이 쓴다 —
// 시스템 JavaScriptCore 에는 앞의 둘이 없다. legacy 빌드는 대체 코드(core-js)를 담는다
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';

const utf16 = (s: string) => 'þÿ' + Buffer.from(s, 'utf16le').swap16().toString('latin1');
function ocPdf(): Uint8Array {
  const content = '/OC /MC0 BDC 1 0 0 rg 0 0 200 100 re f EMC /OC /MC1 BDC 0 0 1 rg 10 10 30 20 re f EMC';
  const objs = [
    '<< /Type /Catalog /Pages 2 0 R /OCProperties << /OCGs [5 0 R 6 0 R] /D << /Order [5 0 R 6 0 R] /ON [5 0 R 6 0 R] >> >> >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 100] /Contents 4 0 R /Resources << /Properties << /MC0 5 0 R /MC1 6 0 R >> >> >>',
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
    `<< /Type /OCG /Name (${utf16('받은 이미지')}) >>`, `<< /Type /OCG /Name (${utf16('채널')}) >>`,
  ];
  let out = '%PDF-1.6\n'; const off: number[] = [];
  objs.forEach((o, i) => { off.push(Buffer.byteLength(out, 'latin1')); out += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const x = Buffer.byteLength(out, 'latin1');
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n` + off.map((o) => String(o).padStart(10, '0') + ' 00000 n \n').join('') + `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${x}\n%%EOF`;
  return new Uint8Array(Buffer.from(out, 'latin1'));
}

describe('pdf.js — 맥 앱 엔진에 없는 기능 없이도 PDF·레이어를 읽는다', () => {
  it('convert.ts 는 legacy 빌드(대체 코드 포함)와 그 worker 를 쓴다', () => {
    const src = readFileSync(new URL('../../src/lib/design/convert.ts', import.meta.url), 'utf8');
    expect(src).toContain("import('pdfjs-dist/legacy/build/pdf.mjs')");
    expect(src).toContain("import('pdfjs-dist/legacy/build/pdf.worker.min.mjs?url')");
    expect(src).not.toMatch(/import\('pdfjs-dist'\)/);
  });
  it('getOrInsertComputed · sumPrecise · toHex 를 지운 채 legacy 빌드로 PDF 를 열고 레이어·연산 목록을 읽는다', async () => {
    const saved = { m: (Map.prototype as any).getOrInsertComputed, w: (WeakMap.prototype as any).getOrInsertComputed, s: (Math as any).sumPrecise, h: (Uint8Array.prototype as any).toHex }; // eslint-disable-line @typescript-eslint/no-explicit-any
    delete (Map.prototype as any).getOrInsertComputed; delete (WeakMap.prototype as any).getOrInsertComputed; delete (Math as any).sumPrecise; delete (Uint8Array.prototype as any).toHex; // eslint-disable-line @typescript-eslint/no-explicit-any
    try {
      const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
      const doc = await pdfjs.getDocument({ data: ocPdf() }).promise;
      const cfg = await doc.getOptionalContentConfig();
      expect([...cfg].map(([, g]) => g.name)).toEqual(['받은 이미지', '채널']);
      const ol = await (await doc.getPage(1)).getOperatorList();
      expect(ol.fnArray.length).toBeGreaterThan(5);
      await doc.cleanup();
    } finally {
      if (saved.m) (Map.prototype as any).getOrInsertComputed = saved.m; if (saved.w) (WeakMap.prototype as any).getOrInsertComputed = saved.w; if (saved.s) (Math as any).sumPrecise = saved.s; if (saved.h) (Uint8Array.prototype as any).toHex = saved.h; // eslint-disable-line @typescript-eslint/no-explicit-any
    }
  });
});
