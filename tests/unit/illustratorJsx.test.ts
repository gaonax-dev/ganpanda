// 일러스트 스크립트(src/lib/illustrator/ganpanda.jsx)를 가짜 일러스트레이터 위에서 돌려 본다 — 실제 일러스트는 CI 에 없다 (2026-11-05)
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import vm from 'vm';
import { illustratorPackage, jsxWithData } from '../../src/lib/core/illustrator';

const TEMPLATE = readFileSync(new URL('../../src/lib/illustrator/ganpanda.jsx', import.meta.url), 'utf8');
const PT = 72 / 25.4;

/** 아주 작은 가짜 일러스트레이터 DOM — 레이어 안 하위 레이어, 페이지 항목 복제·이동, 내보내기, 파일 읽기 */
type Rec = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
function fakeIllustrator(opts: { confirm?: boolean; missing?: string[]; scriptDir?: string; pick?: string | null; files?: Record<string, string>; existing?: { names: string[]; layers?: { name: string; subs?: { name: string; items: number }[]; items?: number[][] }[] } } = {}) {
  const log: string[] = [];
  const written: Record<string, string> = { ...(opts.files ?? {}) };
  const mkItems = (kind: string, layer: Rec) => {
    const arr: Rec[] = [];
    return Object.assign(arr, {
      add() { const it: Rec = { kind, layer: layer.name, position: [0, 0], width: 1, height: 1, embed() { it.embedded = true; } }; arr.push(it); return it; },
      createFromFile(f: { fsName: string }) { const it: Rec = { kind: 'svgGroup', file: f.fsName, layer: layer.name, position: [0, 0], width: 100, height: 50, clipped: false }; arr.push(it); return it; },
    });
  };
  const pageItem = (bounds: number[] = [0, 0, 1, -1], parent?: Rec): Rec => ({ geometricBounds: bounds, parent, duplicate(target: Rec) { const d: Rec = { translated: [0, 0], translate(dx: number, dy: number) { d.translated = [dx, dy]; } }; target.pageItems.push(d); return d; } });
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
      for (const S of L.subs ?? []) { const c = l.layers.add(); c.name = S.name; for (let i = 0; i < S.items; i++) c.pageItems.push(pageItem([0, 0, 1, -1], c)); }
      for (const b of L.items ?? []) l.pageItems.push(pageItem(b, l));
    }
    docs.push(d);
  }
  class FakeFile { fsName: string; encoding = ''; constructor(p: string) { this.fsName = p; } get exists() { return !(opts.missing ?? []).includes(this.fsName) && (!this.fsName.endsWith('.json') || this.fsName in written); } get parent() { return { fsName: this.fsName.replace(/\/[^/]*$/, '') }; } open() { return true; } write(s: string) { written[this.fsName] = (written[this.fsName] ?? '') + s; } read() { return written[this.fsName] ?? ''; } close() {} remove() {} static saveDialog() { return new FakeFile('/tmp/out.ai'); } }
  class XMPMeta { props: Record<string, string> = {}; constructor(_s: string) {} static registerNamespace() {} setProperty(_ns: string, k: string, v: string) { this.props[k] = v; } serialize() { const [k, v] = Object.entries(this.props)[0]; return `<x:xmpmeta><ganpanda:${k}>${v}</ganpanda:${k}></x:xmpmeta>`; } }
  const ctx: Rec = {
    app: { documents: Object.assign(docs, { add(_cs: unknown, w: number, h: number) { const d = mkDoc(w, h); docs.push(d); ctx.app.activeDocument = d; return d; } }), activeDocument: docs[0], coordinateSystem: null },
    DocumentColorSpace: { RGB: 'RGB', CMYK: 'CMYK' }, CoordinateSystem: { DOCUMENTCOORDINATESYSTEM: 'doc' },
    IllustratorSaveOptions: function (this: Rec) { this.pdfCompatible = false; },
    ExportOptionsSVG: function (this: Rec) { this.fontType = null; }, ExportOptionsPNG24: function (this: Rec) { this.transparency = false; },
    ExportType: { SVG: 'SVG', PNG24: 'PNG24' }, SVGFontType: { OUTLINEFONT: 'outline' }, SaveOptions: { DONOTSAVECHANGES: 'no' }, ElementPlacement: { PLACEATEND: 'end', PLACEATBEGINNING: 'begin' },
    ExternalObject: function () {}, XMPMeta, File: FakeFile, Folder: { temp: { fsName: '/tmp' }, selectDialog: (m: string) => { log.push('pick:' + m); return opts.pick ? { fsName: opts.pick } : null; } }, $: { fileName: (opts.scriptDir ?? '/tmp/pkg') + '/ganpanda.jsx' },
    alert: (m: string) => log.push('alert:' + m), confirm: (m: string) => { log.push('confirm:' + m); return opts.confirm ?? true; },
    String, Math, Number, parseInt, isNaN,
  };
  ctx.ExternalObject.AdobeXMPScript = undefined;
  return { ctx, docs, log, written };
}
const b64 = (s: string) => Buffer.from(s, 'latin1').toString('base64');

describe('ganpanda.jsx — 간판다 → 일러스트 (대지 만들기, 2026-11-06 정의)', () => {
  // 사용자: "일러스트 스크립트는 크기별로 대지를 생성하고 레이어를 생성한다. 받은이미지(최종이미지), 디자인(일러스트에서 작성된 이미지), path(3d 변환용)"
  const pkg = illustratorPackage({ project: '테스트 매장', cards: [
    { id: 'a1', no: 1, name: '정면 간판', x: 1000, y: 500, w: 3000, h: 600, image: 'images/a1.png' },
    { id: 'b2', no: 2, name: '돌출', x: 4500, y: 700, w: 600, h: 900, image: 'images/b2.png' },
  ] });
  it('사인물마다 크기대로 대지("프로젝트명 #번호" — 2026-11-06 "대지 #id로 추적하고 프로젝트명+숫자 간단하게") — 레이어는 아래부터 받은 이미지(잠금, 최종 이미지) · 디자인 · path, XMP, PDF 호환 .ai', () => {
    const f = fakeIllustrator();
    vm.runInNewContext(jsxWithData(TEMPLATE, pkg), f.ctx);
    const doc = f.docs[0];
    expect(doc.artboards.map((a: Rec) => a.name)).toEqual(['테스트 매장 #1', '테스트 매장 #2']);
    const [r0, r1] = doc.artboards.map((a: Rec) => a.artboardRect);
    expect(r0[0]).toBeCloseTo(0, 6); expect(r0[1]).toBeCloseTo(0, 6); expect(r0[2]).toBeCloseTo(3000 * PT, 4); expect(r0[3]).toBeCloseTo(-600 * PT, 4);
    expect(r1[0]).toBeCloseTo(3500 * PT, 4); expect(r1[1]).toBeCloseTo(-200 * PT, 4); expect(r1[2]).toBeCloseTo(4100 * PT, 4); expect(r1[3]).toBeCloseTo(-1100 * PT, 4);
    expect(doc.layers.map((l: Rec) => l.name)).toEqual(['path', '디자인', '받은 이미지']); // 위 → 아래
    const recv = doc.layers.find((l: Rec) => l.name === '받은 이미지');
    expect(recv.locked).toBe(true);
    expect(recv.placedItems.map((it: Rec) => it.file.fsName)).toEqual(['/tmp/pkg/images/a1.png', '/tmp/pkg/images/b2.png']); // 폴더의 파일을 연결
    expect(recv.placedItems.every((it: Rec) => !it.embedded)).toBe(true);
    expect(recv.placedItems[1].position).toEqual([3500 * PT, -200 * PT].map((v) => expect.closeTo(v, 4)));
    expect(recv.placedItems[1].width).toBeCloseTo(600 * PT, 4);
    expect(doc.layers.find((l: Rec) => l.name === '디자인').pageItems).toHaveLength(0);
    expect(doc.layers.find((l: Rec) => l.name === 'path').pageItems).toHaveLength(0);
    expect(doc.XMPString).toContain('<ganpanda:artboards>1|2</ganpanda:artboards>');
    expect(doc.saved).toEqual({ file: '/tmp/out.ai', pdf: true });
    expect(f.log.some((l) => l.startsWith('confirm:'))).toBe(false);
  });
  it('전체가 5.5m 를 넘으면 1:10 으로 그린다', () => {
    const big = illustratorPackage({ project: 'p', cards: [{ id: 'a', name: 'a', x: 0, y: 0, w: 9000, h: 900 }] });
    const f = fakeIllustrator();
    vm.runInNewContext(jsxWithData(TEMPLATE, big), f.ctx);
    expect(f.docs[0].artboards[0].artboardRect[2]).toBeCloseTo(900 * PT, 4);
  });
  it('폴더에 없는 그림은 건너뛰고 알린다 (zip 을 풀어 그 폴더에서 실행)', () => {
    const f = fakeIllustrator({ missing: ['/tmp/pkg/images/a1.png'] });
    vm.runInNewContext(jsxWithData(TEMPLATE, pkg), f.ctx);
    expect(f.docs[0].layers.find((l: Rec) => l.name === '받은 이미지').placedItems).toHaveLength(1);
    expect(f.log.some((l) => l.startsWith('alert:') && l.includes('찾지 못했습니다'))).toBe(true);
  });
});

describe('ganpanda.jsx — 일러스트 → 간판다 (보내기, 2026-11-06 정의)', () => {
  // 사용자: "가져오기는 대지를 기준으로 디자인과 path를 가져오는데 디자인은 대지 이름별로 이미지로 변환해 사인물 카드에 바로 적용한다. path는 대지 이름을 통해 사인물을 찾고 해당 구성물의 path에 사용자가 연결한다"
  it('대지마다 그 안의 디자인 레이어 = PNG(대지로 자름), path 레이어 = SVG(글자 윤곽선) → .ganpanda. 대지 밖·간판다 대지 아닌 곳은 빠짐', () => {
    // 대지(가짜): i번째 = [i*100, 0, i*100+90, -90]
    const f = fakeIllustrator({ existing: { names: ['매장 #1', '대지 3', '매장 #2'], layers: [
      { name: '받은 이미지', items: [[0, 0, 90, -90], [200, 0, 290, -90]] },
      { name: '디자인', items: [[10, -10, 50, -50], [60, -5, 80, -40], [110, -10, 150, -50]] }, // a1 에 둘, '대지 3' 에 하나
      { name: 'path', items: [[205, -10, 250, -60]] }, // b2 에 하나
    ] } });
    vm.runInNewContext(jsxWithData(TEMPLATE, illustratorPackage({ project: 'p', cards: [] })), f.ctx);
    const doc = f.docs[0];
    expect(doc.XMPString).toContain('<ganpanda:artboards>1||2</ganpanda:artboards>');
    expect(doc.saved).toEqual({ file: '/tmp/existing.ai', pdf: true });
    const bundle = JSON.parse(f.written['/tmp/existing.ganpanda']);
    expect(bundle).toMatchObject({ format: 'ganpanda-illustrator-bundle', version: 2 });
    expect(bundle.items).toEqual([
      { sign: '1', part: 'design', kind: 'png', data: b64('PNGDATA') },
      { sign: '2', part: 'path', kind: 'svg', data: b64('SVGDATA') },
    ]);
    const temps = f.docs.slice(1);
    expect(temps).toHaveLength(2);
    expect(temps.every((t: Rec) => t.closed)).toBe(true);
    const pngDoc = temps.find((t: Rec) => t.exported.type === 'PNG24')!, svgDoc = temps.find((t: Rec) => t.exported.type === 'SVG')!;
    expect(pngDoc.layers[0].pageItems).toHaveLength(2); // 그 대지 안 디자인만
    expect(pngDoc.exported.o.artBoardClipping).toBe(true);
    expect(svgDoc.layers[0].pageItems).toHaveLength(1);
    expect(svgDoc.exported.o.fontType).toBe('outline');
    expect(f.log.some((l) => l.startsWith('alert:') && l.includes('디자인 1') && l.includes('path 1'))).toBe(true);
  });
  it('디자인·path 가 비었으면 묶음을 만들지 않고 알린다', () => {
    const f = fakeIllustrator({ existing: { names: ['정면 #a1'], layers: [{ name: '디자인' }, { name: 'path' }] } });
    vm.runInNewContext(jsxWithData(TEMPLATE, illustratorPackage({ project: 'p', cards: [] })), f.ctx);
    expect(f.written['/tmp/existing.ganpanda']).toBeUndefined();
    expect(f.log.some((l) => l.startsWith('alert:') && l.includes('디자인·path'))).toBe(true);
  });
});

describe('ganpanda.jsx — 그림 해독 (예전 data URL)', () => {
  it('base64 를 바이트 그대로 파일로 — 길이가 3의 배수가 아니어도(= 채움)', () => {
    const bytes = [10, 11, 12, 300].map((n, k) => Buffer.from(Array.from({ length: n }, (_, i) => (i * 37 + k * 11) % 256)));
    const pkg = illustratorPackage({ project: 'p', cards: bytes.map((b, i) => ({ id: `c${i}`, name: `n${i}`, x: i * 100, y: 0, w: 50, h: 50, image: `data:image/jpeg;base64,${b.toString('base64')}` })) });
    const f = fakeIllustrator();
    vm.runInNewContext(jsxWithData(TEMPLATE, pkg), f.ctx);
    const files = Object.keys(f.written).filter((k) => /ganpanda-\d+\.jpg$/.test(k)).sort((a, b) => Number(/(\d+)\.jpg/.exec(a)![1]) - Number(/(\d+)\.jpg/.exec(b)![1]));
    expect(files).toHaveLength(4);
    files.forEach((k, i) => expect(Buffer.from(f.written[k], 'latin1').equals(bytes[i]), k).toBe(true));
  });
});

describe('간판다.jsx 설치형 — 데이터 없이 실행하면 폴더를 골라 (2026-11-05 "가볍게 일러스트에 스크립트 설치하고 실행하면 폴더 선택가능하게 파인더 띄워주고 가는건")', () => {
  const data = illustratorPackage({ project: '매장', cards: [{ id: 'a1', name: '정면', x: 0, y: 0, w: 1000, h: 500, image: 'images/a1.png' }] });
  it('폴더 선택 창 → 그 폴더의 ganpanda.json 으로 대지, 그림은 그 폴더의 images/ 를 연결', () => {
    const f = fakeIllustrator({ scriptDir: '/Applications/Illustrator/Scripts', pick: '/Users/me/Downloads/매장 일러스트 대지', files: { '/Users/me/Downloads/매장 일러스트 대지/ganpanda.json': JSON.stringify(data) } });
    vm.runInNewContext(TEMPLATE, f.ctx); // 데이터 줄 없는 스크립트 그대로
    expect(f.log.some((l) => l.startsWith('pick:'))).toBe(true);
    const doc = f.docs[0];
    expect(doc.artboards.map((a: Rec) => a.name)).toEqual(['매장 #a1']); // 번호가 없으면(예전 데이터) id
    expect(doc.layers.find((l: Rec) => l.name === '받은 이미지').placedItems[0].file.fsName).toBe('/Users/me/Downloads/매장 일러스트 대지/images/a1.png');
  });
  it('취소하면 아무것도 안 함, ganpanda.json 이 없는 폴더면 알림', () => {
    const f1 = fakeIllustrator({ pick: null });
    vm.runInNewContext(TEMPLATE, f1.ctx);
    expect(f1.docs).toHaveLength(0);
    const f2 = fakeIllustrator({ pick: '/Users/me/Desktop' });
    vm.runInNewContext(TEMPLATE, f2.ctx);
    expect(f2.docs).toHaveLength(0);
    expect(f2.log.some((l) => l.startsWith('alert:') && l.includes('ganpanda.json'))).toBe(true);
  });
  it('간판다 대지가 있는 문서를 연 채 실행하면 보내기 (설치형도 같다)', () => {
    const f = fakeIllustrator({ existing: { names: ['정면 #a1'] } });
    vm.runInNewContext(TEMPLATE, f.ctx);
    expect(f.docs[0].XMPString).toContain('<ganpanda:artboards>a1</ganpanda:artboards>');
    expect(f.log.some((l) => l.startsWith('pick:'))).toBe(false);
  });
});
