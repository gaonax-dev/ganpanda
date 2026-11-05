// 일러스트 스크립트(src/lib/illustrator/ganpanda.jsx)를 가짜 일러스트레이터 위에서 돌려 본다 — 실제 일러스트는 CI 에 없다 (2026-11-05)
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import vm from 'vm';
import { illustratorPackage, jsxWithData } from '../../src/lib/core/illustrator';

const TEMPLATE = readFileSync(new URL('../../src/lib/illustrator/ganpanda.jsx', import.meta.url), 'utf8');
const PT = 72 / 25.4;
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

/** 아주 작은 가짜 일러스트레이터 DOM */
function fakeIllustrator(opts: { confirm?: boolean; existing?: { names: string[] } } = {}) {
  const log: string[] = [];
  const written: Record<string, string> = {};
  const mkItems = (kind: string, layer: { name: string }) => {
    const arr: Record<string, unknown>[] = [];
    return Object.assign(arr, {
      add() { const it: Record<string, unknown> = { kind, layer: layer.name, position: [0, 0], width: 1, height: 1, embed() { it.embedded = true; } }; arr.push(it); return it; },
      createFromFile(f: { fsName: string }) { const it: Record<string, unknown> = { kind: 'svgGroup', file: f.fsName, layer: layer.name, position: [0, 0], width: 100, height: 50, clipped: false }; arr.push(it); return it; },
    });
  };
  const mkLayer = (name: string) => { const l: Record<string, unknown> = { name, locked: false }; l.placedItems = mkItems('placed', l as { name: string }); l.groupItems = mkItems('group', l as { name: string }); l.pathItems = Object.assign([], { rectangle(top: number, left: number, w: number, h: number) { const r = { top, left, w, h, clipping: false }; return r; } }); return l; };
  const mkDoc = (w: number, h: number, names: string[] = []) => {
    const abs: { artboardRect: number[]; name: string }[] = names.length ? names.map((n, i) => ({ artboardRect: [i * 100, 0, i * 100 + 90, -90], name: n })) : [{ artboardRect: [0, 0, w, -h], name: '대지 1' }];
    const layers: Record<string, unknown>[] = [mkLayer('레이어 1')];
    const doc: Record<string, unknown> = {
      width: w, height: h, XMPString: '<x:xmpmeta/>', saved: null as unknown, fullName: names.length ? { fsName: '/tmp/existing.ai' } : undefined,
      artboards: Object.assign(abs, { add(r: number[]) { const a = { artboardRect: r, name: '' }; abs.push(a); return a; }, remove(i: number) { abs.splice(i, 1); } }),
      layers: Object.assign(layers, { add() { const l = mkLayer('새 레이어'); layers.unshift(l); return l; } }),
      saveAs(f: { fsName: string }, o: { pdfCompatible: boolean }) { doc.saved = { file: f.fsName, pdf: o.pdfCompatible }; },
      save() { doc.saved = { file: 'same', pdf: true }; },
    };
    return doc;
  };
  const docs: Record<string, unknown>[] = opts.existing ? [mkDoc(1000, 1000, opts.existing.names)] : [];
  class FakeFile { fsName: string; encoding = ''; constructor(p: string) { this.fsName = p; } open() { return true; } write(s: string) { written[this.fsName] = (written[this.fsName] ?? '') + s; } close() {} remove() {} static saveDialog(_m: string, _f?: string) { return new FakeFile('/tmp/out.ai'); } }
  class XMPMeta { s: string; props: Record<string, string> = {}; constructor(s: string) { this.s = s; } static registerNamespace() {} setProperty(_ns: string, k: string, v: string) { this.props[k] = v; } serialize() { return `<x:xmpmeta><ganpanda:${Object.keys(this.props)[0]}>${Object.values(this.props)[0]}</ganpanda:${Object.keys(this.props)[0]}></x:xmpmeta>`; } }
  const ctx: Record<string, unknown> = {
    app: { documents: Object.assign(docs, { add(_cs: unknown, w: number, h: number) { const d = mkDoc(w, h); docs.push(d); (ctx.app as Record<string, unknown>).activeDocument = d; return d; } }), activeDocument: docs[0], coordinateSystem: null },
    DocumentColorSpace: { RGB: 'RGB', CMYK: 'CMYK' }, CoordinateSystem: { DOCUMENTCOORDINATESYSTEM: 'doc' },
    IllustratorSaveOptions: function (this: Record<string, unknown>) { this.pdfCompatible = false; },
    ExternalObject: function () {}, XMPMeta, File: FakeFile, Folder: { temp: { fsName: '/tmp' } },
    alert: (m: string) => log.push('alert:' + m), confirm: (m: string) => { log.push('confirm:' + m); return opts.confirm ?? true; },
    String, Math, Number, parseInt, isNaN,
  };
  (ctx.ExternalObject as Record<string, unknown>).AdobeXMPScript = undefined;
  return { ctx, docs, log, written };
}

describe('ganpanda.jsx — 간판다 → 일러스트 (대지 만들기)', () => {
  const pkg = illustratorPackage({ project: '테스트 매장', cards: [
    { id: 'a1', name: '정면 간판', x: 1000, y: 500, w: 3000, h: 600, face: PNG },
    { id: 'b2', name: '돌출', x: 4500, y: 700, w: 600, h: 900, face: PNG, design: { png: PNG } },
  ] });
  it('사인물마다 대지(자리·크기 mm → pt, 이름 "이름 #id"), 처음 대지는 지우고, 사진은 잠긴 레이어, 디자인은 디자인 레이어, XMP 짝, PDF 호환 .ai 저장', () => {
    const f = fakeIllustrator();
    vm.runInNewContext(jsxWithData(TEMPLATE, pkg), f.ctx);
    const doc = f.docs[0] as { artboards: { artboardRect: number[]; name: string }[]; layers: Record<string, unknown>[]; XMPString: string; saved: { file: string; pdf: boolean } };
    expect(doc.artboards.map((a) => a.name)).toEqual(['정면 간판 #a1', '돌출 #b2']);
    const [r0, r1] = doc.artboards.map((a) => a.artboardRect);
    expect(r0[0]).toBeCloseTo(0, 6); expect(r0[1]).toBeCloseTo(0, 6); expect(r0[2]).toBeCloseTo(3000 * PT, 4); expect(r0[3]).toBeCloseTo(-600 * PT, 4);
    expect(r1[0]).toBeCloseTo(3500 * PT, 4); expect(r1[1]).toBeCloseTo(-200 * PT, 4); expect(r1[2]).toBeCloseTo(4100 * PT, 4); expect(r1[3]).toBeCloseTo(-1100 * PT, 4);
    const photo = doc.layers.find((l) => l.name === '간판다 사진')! as { locked: boolean; placedItems: Record<string, unknown>[] };
    expect(photo.locked).toBe(true);
    expect(photo.placedItems).toHaveLength(2);
    expect(photo.placedItems[1].position).toEqual([3500 * PT, -200 * PT].map((v) => expect.closeTo(v, 4)));
    expect(photo.placedItems[1].embedded).toBe(true);
    const design = doc.layers.find((l) => l.name === '디자인')! as { placedItems: unknown[] };
    expect(design.placedItems).toHaveLength(1);
    expect(doc.XMPString).toContain('<ganpanda:artboards>a1|b2</ganpanda:artboards>');
    expect(doc.saved).toEqual({ file: '/tmp/out.ai', pdf: true });
  });
  it('전체가 5.5m 를 넘으면 1:10 으로 그린다', () => {
    const big = illustratorPackage({ project: 'p', cards: [{ id: 'a', name: 'a', x: 0, y: 0, w: 9000, h: 900 }] });
    const f = fakeIllustrator();
    vm.runInNewContext(jsxWithData(TEMPLATE, big), f.ctx);
    const r = (f.docs[0] as { artboards: { artboardRect: number[] }[] }).artboards[0].artboardRect;
    expect(r[2]).toBeCloseTo(900 * PT, 4);
  });
});

describe('ganpanda.jsx — 일러스트 → 간판다 (보내기)', () => {
  it('열린 문서에 "#id" 대지가 있으면 지금 대지 순서대로 XMP 짝을 다시 적고 저장 (간판다 대지가 아닌 것은 빈 칸)', () => {
    const f = fakeIllustrator({ existing: { names: ['정면 간판 #a1', '대지 3', '돌출 #b2'] } });
    vm.runInNewContext(jsxWithData(TEMPLATE, illustratorPackage({ project: 'p', cards: [] })), f.ctx);
    const doc = f.docs[0] as { XMPString: string; saved: { pdf: boolean } };
    expect(doc.XMPString).toContain('<ganpanda:artboards>a1||b2</ganpanda:artboards>');
    expect(doc.saved).toEqual({ file: '/tmp/existing.ai', pdf: true }); // 같은 파일에 PDF 호환으로
    expect(f.log.some((l) => l.startsWith('alert:') && l.includes('간판다'))).toBe(true);
  });
});
