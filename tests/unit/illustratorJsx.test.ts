// 일러스트 스크립트(src/lib/illustrator/ganpanda.jsx)를 가짜 일러스트레이터 위에서 돌려 본다 — 실제 일러스트는 CI 에 없다 (2026-11-05)
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import vm from 'vm';
import { illustratorPackage, jsxWithData } from '../../src/lib/core/illustrator';

const TEMPLATE = readFileSync(new URL('../../src/lib/illustrator/ganpanda.jsx', import.meta.url), 'utf8');
const PT = 72 / 25.4;
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

/** 아주 작은 가짜 일러스트레이터 DOM — 레이어 안 하위 레이어, 페이지 항목 복제·이동, 내보내기, 파일 읽기 */
type Rec = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
function fakeIllustrator(opts: { confirm?: boolean; existing?: { names: string[]; layers?: { name: string; subs: { name: string; items: number }[] }[] } } = {}) {
  const log: string[] = [];
  const written: Record<string, string> = {};
  const mkItems = (kind: string, layer: Rec) => {
    const arr: Rec[] = [];
    return Object.assign(arr, {
      add() { const it: Rec = { kind, layer: layer.name, position: [0, 0], width: 1, height: 1, embed() { it.embedded = true; } }; arr.push(it); return it; },
      createFromFile(f: { fsName: string }) { const it: Rec = { kind: 'svgGroup', file: f.fsName, layer: layer.name, position: [0, 0], width: 100, height: 50, clipped: false }; arr.push(it); return it; },
    });
  };
  const pageItem = (): Rec => ({ duplicate(target: Rec) { const d: Rec = { translated: [0, 0], translate(dx: number, dy: number) { d.translated = [dx, dy]; } }; target.pageItems.push(d); return d; } });
  const mkLayer = (name: string): Rec => {
    const l: Rec = { name, locked: false, pageItems: [] as Rec[] };
    l.placedItems = mkItems('placed', l); l.groupItems = mkItems('group', l);
    l.pathItems = Object.assign([], { rectangle(top: number, left: number, w: number, h: number) { return { top, left, w, h, clipping: false }; } });
    const subs: Rec[] = [];
    l.layers = Object.assign(subs, { add() { const c = mkLayer('새 레이어'); subs.unshift(c); return c; } });
    return l;
  };
  const mkDoc = (w: number, h: number, names: string[] = []) => {
    const abs: { artboardRect: number[]; name: string }[] = names.length ? names.map((n, i) => ({ artboardRect: [i * 100, 0, i * 100 + 90, -90], name: n })) : [{ artboardRect: [0, 0, w, -h], name: '대지 1' }];
    const layers: Rec[] = [mkLayer('레이어 1')];
    const doc: Rec = {
      width: w, height: h, XMPString: '<x:xmpmeta/>', saved: null, fullName: names.length ? { fsName: '/tmp/existing.ai' } : undefined, closed: false,
      artboards: Object.assign(abs, { add(r: number[]) { const a = { artboardRect: r, name: '' }; abs.push(a); return a; }, remove(i: number) { abs.splice(i, 1); } }),
      layers: Object.assign(layers, { add() { const l = mkLayer('새 레이어'); layers.unshift(l); return l; } }),
      saveAs(f: { fsName: string }, o: { pdfCompatible: boolean }) { doc.saved = { file: f.fsName, pdf: o.pdfCompatible }; doc.fullName = f; },
      save() { doc.saved = { file: 'same', pdf: true }; },
      exportFile(f: { fsName: string }, type: string, o: Rec) { written[f.fsName] = type === 'SVG' ? 'SVGDATA' : 'PNGDATA'; doc.exported = { type, o }; },
      close() { doc.closed = true; }, activate() {},
    };
    return doc;
  };
  const docs: Rec[] = [];
  if (opts.existing) {
    const d = mkDoc(1000, 1000, opts.existing.names);
    for (const L of opts.existing.layers ?? []) {
      const l = d.layers.add(); l.name = L.name;
      for (const S of L.subs) { const c = l.layers.add(); c.name = S.name; for (let i = 0; i < S.items; i++) c.pageItems.push(pageItem()); }
    }
    docs.push(d);
  }
  class FakeFile { fsName: string; encoding = ''; constructor(p: string) { this.fsName = p; } open() { return true; } write(s: string) { written[this.fsName] = (written[this.fsName] ?? '') + s; } read() { return written[this.fsName] ?? ''; } close() {} remove() {} static saveDialog() { return new FakeFile('/tmp/out.ai'); } }
  class XMPMeta { props: Record<string, string> = {}; constructor(_s: string) {} static registerNamespace() {} setProperty(_ns: string, k: string, v: string) { this.props[k] = v; } serialize() { const [k, v] = Object.entries(this.props)[0]; return `<x:xmpmeta><ganpanda:${k}>${v}</ganpanda:${k}></x:xmpmeta>`; } }
  const ctx: Rec = {
    app: { documents: Object.assign(docs, { add(_cs: unknown, w: number, h: number) { const d = mkDoc(w, h); docs.push(d); ctx.app.activeDocument = d; return d; } }), activeDocument: docs[0], coordinateSystem: null },
    DocumentColorSpace: { RGB: 'RGB', CMYK: 'CMYK' }, CoordinateSystem: { DOCUMENTCOORDINATESYSTEM: 'doc' },
    IllustratorSaveOptions: function (this: Rec) { this.pdfCompatible = false; },
    ExportOptionsSVG: function (this: Rec) { this.fontType = null; }, ExportOptionsPNG24: function (this: Rec) { this.transparency = false; },
    ExportType: { SVG: 'SVG', PNG24: 'PNG24' }, SVGFontType: { OUTLINEFONT: 'outline' }, SaveOptions: { DONOTSAVECHANGES: 'no' }, ElementPlacement: { PLACEATEND: 'end', PLACEATBEGINNING: 'begin' },
    ExternalObject: function () {}, XMPMeta, File: FakeFile, Folder: { temp: { fsName: '/tmp' } },
    alert: (m: string) => log.push('alert:' + m), confirm: (m: string) => { log.push('confirm:' + m); return opts.confirm ?? true; },
    String, Math, Number, parseInt, isNaN,
  };
  ctx.ExternalObject.AdobeXMPScript = undefined;
  return { ctx, docs, log, written };
}
const b64 = (s: string) => Buffer.from(s, 'latin1').toString('base64');

describe('ganpanda.jsx — 간판다 → 일러스트 (대지 만들기)', () => {
  const pkg = illustratorPackage({ project: '테스트 매장', cards: [
    { id: 'a1', name: '정면 간판', x: 1000, y: 500, w: 3000, h: 600, face: PNG, parts: [{ id: 'c1', label: '채널 (입체)', mode: 'vector' }, { id: 's1', label: '시트 (인쇄)', mode: 'print' }] },
    { id: 'b2', name: '돌출', x: 4500, y: 700, w: 600, h: 900, face: PNG, design: { png: PNG } },
  ] });
  it('사인물마다 대지(자리·크기 mm → pt, "이름 #id")와 레이어("이름 #id") — 안에 바탕(인쇄)·구성 요소 하위 레이어("#사인물:구성 요소"). 사진은 잠긴 레이어, 바탕 디자인은 바탕 레이어, XMP, PDF 호환 .ai', () => {
    const f = fakeIllustrator();
    vm.runInNewContext(jsxWithData(TEMPLATE, pkg), f.ctx);
    const doc = f.docs[0];
    expect(doc.artboards.map((a: Rec) => a.name)).toEqual(['정면 간판 #a1', '돌출 #b2']);
    const [r0, r1] = doc.artboards.map((a: Rec) => a.artboardRect);
    expect(r0[0]).toBeCloseTo(0, 6); expect(r0[1]).toBeCloseTo(0, 6); expect(r0[2]).toBeCloseTo(3000 * PT, 4); expect(r0[3]).toBeCloseTo(-600 * PT, 4);
    expect(r1[0]).toBeCloseTo(3500 * PT, 4); expect(r1[1]).toBeCloseTo(-200 * PT, 4); expect(r1[2]).toBeCloseTo(4100 * PT, 4); expect(r1[3]).toBeCloseTo(-1100 * PT, 4);
    const photo = doc.layers.find((l: Rec) => l.name === '간판다 사진');
    expect(photo.locked).toBe(true);
    expect(photo.placedItems).toHaveLength(2);
    expect(photo.placedItems[1].position).toEqual([3500 * PT, -200 * PT].map((v) => expect.closeTo(v, 4)));
    expect(photo.placedItems[1].embedded).toBe(true);
    const a1 = doc.layers.find((l: Rec) => l.name === '정면 간판 #a1');
    expect(a1.layers.map((l: Rec) => l.name).sort()).toEqual(['바탕 (인쇄) #a1:frame', '시트 (인쇄) #a1:s1', '채널 (입체) #a1:c1'].sort());
    const b2 = doc.layers.find((l: Rec) => l.name === '돌출 #b2');
    expect(b2.layers.map((l: Rec) => l.name)).toEqual(['바탕 (인쇄) #b2:frame']);
    expect(b2.layers[0].placedItems).toHaveLength(1); // 바탕 디자인
    expect(doc.XMPString).toContain('<ganpanda:artboards>a1|b2</ganpanda:artboards>');
    expect(doc.saved).toEqual({ file: '/tmp/out.ai', pdf: true });
  });
  it('전체가 5.5m 를 넘으면 1:10 으로 그린다', () => {
    const big = illustratorPackage({ project: 'p', cards: [{ id: 'a', name: 'a', x: 0, y: 0, w: 9000, h: 900 }] });
    const f = fakeIllustrator();
    vm.runInNewContext(jsxWithData(TEMPLATE, big), f.ctx);
    expect(f.docs[0].artboards[0].artboardRect[2]).toBeCloseTo(900 * PT, 4);
  });
});

describe('ganpanda.jsx — 일러스트 → 간판다 (보내기)', () => {
  it('XMP 짝을 다시 적고 저장 + 내용이 있는 구성 요소 레이어마다 대지 크기로 내보내 .ganpanda 묶음(입체 = SVG 글자 윤곽선, 인쇄 = PNG)', () => {
    const f = fakeIllustrator({ existing: { names: ['정면 간판 #a1', '대지 3', '돌출 #b2'], layers: [
      { name: '정면 간판 #a1', subs: [{ name: '바탕 (인쇄) #a1:frame', items: 2 }, { name: '채널 (입체) #a1:c1', items: 1 }, { name: '시트 (인쇄) #a1:s1', items: 0 }] },
      { name: '메모', subs: [{ name: '아무거나', items: 3 }] },
    ] } });
    vm.runInNewContext(jsxWithData(TEMPLATE, illustratorPackage({ project: 'p', cards: [] })), f.ctx);
    const doc = f.docs[0];
    expect(doc.XMPString).toContain('<ganpanda:artboards>a1||b2</ganpanda:artboards>');
    expect(doc.saved).toEqual({ file: '/tmp/existing.ai', pdf: true }); // 같은 파일에 PDF 호환으로
    const bundle = JSON.parse(f.written['/tmp/existing.ganpanda']);
    expect(bundle.format).toBe('ganpanda-illustrator-bundle');
    expect(bundle.items).toHaveLength(2); // 위 레이어부터 (순서 무관)
    expect(bundle.items).toEqual(expect.arrayContaining([
      { sign: 'a1', part: 'frame', kind: 'png', data: b64('PNGDATA') },
      { sign: 'a1', part: 'c1', kind: 'svg', data: b64('SVGDATA') },
    ]));
    const temps = f.docs.slice(1);
    expect(temps).toHaveLength(2);
    expect(temps.every((t: Rec) => t.closed)).toBe(true);
    const svgDoc = temps.find((t: Rec) => t.exported.type === 'SVG')!, pngDoc = temps.find((t: Rec) => t.exported.type === 'PNG24')!;
    expect(svgDoc.exported.o.fontType).toBe('outline'); // 글자는 윤곽선으로
    expect(svgDoc.layers[0].pageItems).toHaveLength(1); // 그 레이어 내용만 복제
    expect(pngDoc.layers[0].pageItems).toHaveLength(2);
    expect(pngDoc.exported.o.transparency).toBe(true);
    expect(f.log.some((l) => l.startsWith('alert:') && l.includes('.ganpanda'))).toBe(true);
  });
});

describe('ganpanda.jsx — 그림 해독 (2026-11-05 "일러스트에서 .jsx를 가져오는데 많은 시간이 걸린다")', () => {
  it('카드 사진 base64 를 바이트 그대로 파일로 — 길이가 3의 배수가 아니어도(= 채움)', () => {
    const bytes = [10, 11, 12, 300].map((n, k) => Buffer.from(Array.from({ length: n }, (_, i) => (i * 37 + k * 11) % 256)));
    const pkg = illustratorPackage({ project: 'p', cards: bytes.map((b, i) => ({ id: `c${i}`, name: `n${i}`, x: i * 100, y: 0, w: 50, h: 50, face: `data:image/jpeg;base64,${b.toString('base64')}` })) });
    const f = fakeIllustrator();
    vm.runInNewContext(jsxWithData(TEMPLATE, pkg), f.ctx);
    const files = Object.keys(f.written).filter((k) => /ganpanda-\d+\.jpg$/.test(k)).sort((a, b) => Number(/(\d+)\.jpg/.exec(a)![1]) - Number(/(\d+)\.jpg/.exec(b)![1]));
    expect(files).toHaveLength(4);
    files.forEach((k, i) => expect(Buffer.from(f.written[k], 'latin1').equals(bytes[i]), k).toBe(true));
  });
});

describe('ganpanda.jsx — 카드 사진은 물어보고 (2026-11-05 "많은 시간이 걸린다")', () => {
  const pkg = illustratorPackage({ project: 'p', cards: [{ id: 'a', name: 'a', x: 0, y: 0, w: 50, h: 50, face: PNG }, { id: 'b', name: 'b', x: 100, y: 0, w: 50, h: 50, face: PNG }] });
  it('[아니요] → 사진을 풀지도 넣지도 않는다 (대지·레이어는 그대로)', () => {
    const f = fakeIllustrator({ confirm: false });
    vm.runInNewContext(jsxWithData(TEMPLATE, pkg), f.ctx);
    const doc = f.docs[0];
    expect(doc.artboards).toHaveLength(2);
    expect(doc.layers.find((l: Rec) => l.name === '간판다 사진').placedItems).toHaveLength(0);
    expect(Object.keys(f.written).some((k) => /ganpanda-\d+\.(png|jpg)$/.test(k))).toBe(false);
    expect(f.log.some((l) => l.startsWith('confirm:') && l.includes('사진'))).toBe(true);
  });
  it('사진이 없는 데이터면 묻지 않는다', () => {
    const f = fakeIllustrator();
    vm.runInNewContext(jsxWithData(TEMPLATE, illustratorPackage({ project: 'p', cards: [{ id: 'a', name: 'a', x: 0, y: 0, w: 50, h: 50 }] })), f.ctx);
    expect(f.log.some((l) => l.startsWith('confirm:'))).toBe(false);
  });
});
