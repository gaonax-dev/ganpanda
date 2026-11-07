// 일러스트 스크립트(src/lib/illustrator/ganpanda.jsx)를 가짜 일러스트레이터 위에서 돌려 본다 — 실제 일러스트는 CI 에 없다 (2026-11-05)
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import vm from 'vm';
import { illustratorPackage, jsxWithData } from '../../src/lib/core/illustrator';

const TEMPLATE = readFileSync(new URL('../../src/lib/illustrator/ganpanda.jsx', import.meta.url), 'utf8');
const PT = 72 / 25.4;

/** 아주 작은 가짜 일러스트레이터 DOM — 레이어 안 하위 레이어, 페이지 항목 복제·이동, 내보내기, 파일 읽기 */
type Rec = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
function fakeIllustrator(opts: { choose?: 'import' | 'export' | 'cancel'; failPng?: boolean; failPdf?: boolean; confirm?: boolean; missing?: string[]; scriptDir?: string; pick?: string | null; files?: Record<string, string>; existing?: { texts?: { layer: string; locked?: boolean }[]; names: string[]; layers?: { name: string; subs?: { name: string; items: number }[]; items?: number[][]; nested?: number[][] }[] } } = {}) {
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
    const l: Rec = { name, locked: false, visible: true, pageItems: [] as Rec[] };
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
      artboards: Object.assign(abs, { add(r: number[]) { const a = { artboardRect: r, name: '' }; abs.push(a); return a; }, remove(i: number) { abs.splice(i, 1); }, setActiveArtboardIndex(i: number) { doc.activeAb = i; } }),
      layers: Object.assign(layers, { add() { const l = mkLayer('새 레이어'); layers.unshift(l); return l; } }),
      saves: [] as Rec[],
      saveAs(f: { fsName: string }, o: Rec) { if (opts.failPdf && o.kind === 'pdf') throw new Error('PDF 못 씀'); doc.saves.push({ file: f.fsName, ...o, outlinedNow: doc.outlined ?? 0, textsLeft: (doc.textFrames ?? []).length }); if (o.kind !== 'pdf') doc.saved = { file: f.fsName, pdf: o.pdfCompatible }; doc.fullName = f; },
      save() { doc.saved = { file: 'same', pdf: true }; },
      exports: [] as Rec[],
      exportFile(f: { fsName: string }, type: string, o: Rec) { if (opts.failPng && type === 'PNG24') throw new Error('MRAP'); doc.coordAtExport = ctx.app.coordinateSystem; written[f.fsName] = type === 'SVG' ? 'SVGDATA' : 'PNGDATA'; doc.exported = { type, o }; doc.exports.push({ type, o, active: doc.activeAb, visible: doc.layers.filter((l: Rec) => l.visible).map((l: Rec) => l.name) }); },
      close(o: unknown) { doc.closed = true; doc.closedWith = o; }, activate() {},
    };
    return doc;
  };
  const docs: Rec[] = [];
  if (opts.existing) {
    const d = mkDoc(1000, 1000, opts.existing.names);
    for (const L of opts.existing.layers ?? []) {
      const l = d.layers.add(); l.name = L.name;
      for (const S of L.subs ?? []) { const c = l.layers.add(); c.name = S.name; for (let i = 0; i < S.items; i++) c.pageItems.push(pageItem([0, 0, 1, -1], c)); }
      for (const b of L.items ?? []) l.pageItems.push(pageItem(b, { typename: 'Layer', name: l.name })); // 실제 일러스트처럼 부모 참조는 매번 다른 객체
      for (const b of (L as Rec).nested ?? []) l.pageItems.push(pageItem(b, { typename: 'GroupItem' })); // 그룹 안 항목
    }
    // 글자 (2026-11-07): createOutline() 하면 글자 목록에서 빠지고 윤곽선 수가 는다. 잠긴 레이어·글자면 실패(실제 일러스트처럼)
    d.outlined = 0;
    d.textFrames = [] as Rec[];
    for (const t of opts.existing.texts ?? []) {
      const layer = d.layers.find((x: Rec) => x.name === t.layer);
      const tf: Rec = { locked: !!t.locked, layer, createOutline() { if (tf.locked || tf.layer?.locked) throw new Error('잠김'); d.textFrames.splice(d.textFrames.indexOf(tf), 1); d.outlined++; return {}; } };
      d.textFrames.push(tf);
    }
    docs.push(d);
  }
  class FakeFile { fsName: string; encoding = ''; constructor(p: string) { this.fsName = p; } get exists() { return !(opts.missing ?? []).includes(this.fsName) && (!this.fsName.endsWith('.json') || this.fsName in written); } get parent() { return { fsName: this.fsName.replace(/\/[^/]*$/, '') }; } open() { return true; } write(s: string) { written[this.fsName] = (written[this.fsName] ?? '') + s; } read() { return written[this.fsName] ?? ''; } close() {} remove() {} static saveDialog() { return new FakeFile('/tmp/out.ai'); } }
  class XMPMeta { props: Record<string, string> = {}; constructor(_s: string) {} static registerNamespace() {} setProperty(_ns: string, k: string, v: string) { this.props[k] = v; } serialize() { const [k, v] = Object.entries(this.props)[0]; return `<x:xmpmeta><ganpanda:${k}>${v}</ganpanda:${k}></x:xmpmeta>`; } }
  const ctx: Rec = {
    app: { open(f: { fsName: string }) { const d = mkDoc(1000, 1000, (opts.existing?.names) ?? []); d.fullName = f; d.reopened = true; docs.push(d); ctx.app.activeDocument = d; return d; }, startupPresetsList: ['Print', 'Web'], coordinateSystem: 'artboard', documents: Object.assign(docs, { add(_cs: unknown, w: number, h: number) { const d = mkDoc(w, h); docs.push(d); ctx.app.activeDocument = d; return d; }, addDocument(startup: string, p: Rec) { const d = mkDoc(p.width, p.height); d.rulerUnits = p.units; d.colorMode = p.colorMode; d.startup = startup; docs.push(d); ctx.app.activeDocument = d; return d; } }), activeDocument: docs[0] },
    DocumentColorSpace: { RGB: 'RGB', CMYK: 'CMYK' }, DocumentPreset: function (this: Rec) { this.units = null; }, RulerUnits: { Millimeters: 'mm', Points: 'pt' }, CoordinateSystem: { DOCUMENTCOORDINATESYSTEM: 'doc', ARTBOARDCOORDINATESYSTEM: 'artboard' },
    IllustratorSaveOptions: function (this: Rec) { this.pdfCompatible = false; },
    PDFSaveOptions: function (this: Rec) { this.kind = 'pdf'; this.acrobatLayers = false; this.preserveEditability = false; }, PDFCompatibility: { ACROBAT7: 'acrobat7' },
    ExportOptionsSVG: function (this: Rec) { this.fontType = null; }, ExportOptionsPNG24: function (this: Rec) { this.transparency = false; },
    ExportType: { SVG: 'SVG', PNG24: 'PNG24' }, SVGFontType: { OUTLINEFONT: 'outline' }, SaveOptions: { DONOTSAVECHANGES: 'no' }, ElementPlacement: { PLACEATEND: 'end', PLACEATBEGINNING: 'begin' },
    ExternalObject: function () {}, XMPMeta, File: FakeFile, Folder: { temp: { fsName: '/tmp' }, selectDialog: (m: string) => { log.push('pick:' + m); return opts.pick ? { fsName: opts.pick } : null; } }, $: { fileName: (opts.scriptDir ?? '/tmp/pkg') + '/ganpanda.jsx' },
    alert: (m: string) => log.push('alert:' + m), confirm: (m: string) => { log.push('confirm:' + m); return opts.confirm ?? true; },
    String, Math, Number, parseInt, isNaN,
  };
  // ScriptUI 창 (2026-11-07 "스크립트 버튼에 가져오기 내보내기 버튼으로"): 단추를 기록하고, show() 때 고른 단추(opts.choose, 기본 = 열린 간판다 문서면 내보내기)를 누른다
  const LABEL = { import: '가져오기', export: '내보내기', cancel: '취소' } as const;
  ctx.Window = function (this: Rec, type: string, title: string) {
    const w = this; w.type = type; w.title = title; w.buttons = [] as Rec[]; w.texts = [] as string[]; ctx.lastWindow = w;
    w.add = (kind: string, _b: unknown, text: string) => { const c: Rec = { kind, text, enabled: true }; if (kind === 'button') w.buttons.push(c); else w.texts.push(text); return c; };
    w.close = () => { w.closed = true; };
    w.show = () => { const want = LABEL[opts.choose ?? (opts.existing ? 'export' : 'import')]; const b = w.buttons.find((x: Rec) => String(x.text).startsWith(want)); log.push('window:' + want + (b && !b.enabled ? ':disabled' : '')); if (b && b.enabled && b.onClick) b.onClick(); return 1; };
  };
  ctx.ExternalObject.AdobeXMPScript = undefined;
  return { ctx, docs, log, written };
}

describe('ganpanda.jsx — 간판다 → 일러스트 (대지 만들기, 2026-11-06 정의)', () => {
  // 사용자: "일러스트 스크립트는 크기별로 대지를 생성하고 레이어를 생성한다. 받은이미지(최종이미지), 디자인(일러스트에서 작성된 이미지), path(3d 변환용)"
  const pkg = illustratorPackage({ project: '테스트 매장', cards: [
    { id: 'a1', no: 1, name: '정면 간판', x: 1000, y: 500, w: 3000, h: 600, image: 'images/a1.png' },
    { id: 'b2', no: 2, name: '돌출', x: 4500, y: 700, w: 600, h: 900, image: 'images/b2.png' },
  ] });
  it('사인물마다 크기대로 대지("프로젝트명 #번호" — 2026-11-06 "대지 #id로 추적하고 프로젝트명+숫자 간단하게") — 레이어는 아래부터 받은 이미지(잠금, 최종 이미지) · 디자인, XMP, PDF 호환 .ai', () => {
    const f = fakeIllustrator();
    vm.runInNewContext(jsxWithData(TEMPLATE, pkg), f.ctx);
    const doc = f.docs[0];
    expect(doc.artboards.map((a: Rec) => a.name)).toEqual(['테스트 매장 #1', '테스트 매장 #2']);
    const [r0, r1] = doc.artboards.map((a: Rec) => a.artboardRect);
    expect(r0[0]).toBeCloseTo(0, 6); expect(r0[1]).toBeCloseTo(0, 6); expect(r0[2]).toBeCloseTo(3000 * PT, 4); expect(r0[3]).toBeCloseTo(-600 * PT, 4);
    expect(r1[0]).toBeCloseTo(3500 * PT, 4); expect(r1[1]).toBeCloseTo(-200 * PT, 4); expect(r1[2]).toBeCloseTo(4100 * PT, 4); expect(r1[3]).toBeCloseTo(-1100 * PT, 4);
    expect(doc.layers.map((l: Rec) => l.name)).toEqual(['디자인', '받은 이미지']); // 위 → 아래 (입체는 디자이너가 "채널"·"스카시" 레이어로 — 2026-11-07)
    // 새 문서 단위 = mm (2026-11-07 "일러스트 새문서 치수 단위를 mm으로 설정되게"), 크기는 전체 배치 그대로(pt), RGB
    expect(doc.rulerUnits).toBe('mm');
    expect(doc.colorMode).toBe('RGB');
    expect(doc.width).toBeCloseTo(4100 * PT, 4);
    const recv = doc.layers.find((l: Rec) => l.name === '받은 이미지');
    expect(recv.locked).toBe(true);
    expect(recv.placedItems.map((it: Rec) => it.file.fsName)).toEqual(['/tmp/pkg/images/a1.png', '/tmp/pkg/images/b2.png']); // 폴더의 파일을 연결
    expect(recv.placedItems.every((it: Rec) => !it.embedded)).toBe(true);
    expect(recv.placedItems[1].position).toEqual([3500 * PT, -200 * PT].map((v) => expect.closeTo(v, 4)));
    expect(recv.placedItems[1].width).toBeCloseTo(600 * PT, 4);
    expect(doc.layers.find((l: Rec) => l.name === '디자인').pageItems).toHaveLength(0);
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

describe('ganpanda.jsx — [내보내기] = 레이어가 살아 있는 PDF 저장 (2026-11-07)', () => {
  // 사용자: "pdf로 내보내면 어떤가?" → "pdf를 직접 편집가능하다면 굿이 path를 따로 둘 이유가 없고 연결된 pdf를 통해 path를 추출해 바로 연결 후 3d로" → 레이어로 고르기
  it('대지 번호 XMP → 원본 .ai 저장(글자 그대로) → 글자를 윤곽선으로 → 같은 이름 .pdf(Acrobat 레이어·편집 유지) → 원본은 저장 없이 닫고 .ai 다시 열기 (2026-11-07 "글자를 아웃라인으로 변경하고 내보내기 하는데 원파일은 아웃라인 변환안된 상태 유지하게")', () => {
    const f = fakeIllustrator({ existing: { names: ['매장 #1', '대지 3', '매장 #2'], layers: [{ name: '디자인', items: [[10, -10, 50, -50]] }, { name: '채널', items: [[110, -10, 150, -60]] }], texts: [{ layer: '디자인' }, { layer: '채널' }, { layer: '채널', locked: true }] } });
    f.docs[0].layers.find((l: Rec) => l.name === '채널').locked = true; // 잠긴 레이어의 글자도
    vm.runInNewContext(jsxWithData(TEMPLATE, illustratorPackage({ project: 'p', cards: [] })), f.ctx);
    const doc = f.docs[0];
    expect(doc.XMPString).toContain('<ganpanda:artboards>1||2</ganpanda:artboards>');
    expect(doc.saves.map((x: Rec) => [x.file, x.kind ?? 'ai'])).toEqual([['/tmp/existing.ai', 'ai'], ['/tmp/existing.pdf', 'pdf']]);
    expect(doc.saves[0]).toMatchObject({ outlinedNow: 0, textsLeft: 3 }); // 원본 .ai = 글자 그대로
    expect(doc.saves[1]).toMatchObject({ acrobatLayers: true, preserveEditability: true, outlinedNow: 3, textsLeft: 0 }); // PDF = 전부 윤곽선
    expect(doc.closed).toBe(true);
    expect(doc.closedWith).toBe('no'); // 윤곽선으로 바꾼 문서는 저장하지 않는다
    const re = f.docs[f.docs.length - 1];
    expect(re.reopened).toBe(true);
    expect(re.fullName.fsName).toBe('/tmp/existing.ai'); // 원본을 다시 열어 둔다
    expect(f.docs.filter((d: Rec) => !d.reopened)).toHaveLength(1); // 임시 문서 없음
    const alert = f.log.find((l) => l.startsWith('alert:'))!;
    expect(alert).toContain('existing.pdf');
    expect(alert).toContain('글자 3개');
    expect(alert).toContain('채널');
  });
  it('PDF 저장이 실패하면 단계·오류를 알림과 로그 파일로', () => {
    const f = fakeIllustrator({ failPdf: true, existing: { names: ['매장 #1'] } });
    vm.runInNewContext(jsxWithData(TEMPLATE, illustratorPackage({ project: 'p', cards: [] })), f.ctx);
    const alert = f.log.find((l) => l.startsWith('alert:'))!;
    expect(alert).toContain('PDF 저장');
    expect(alert).toContain('PDF 못 씀');
    expect(f.written['/tmp/existing.ganpanda-log.txt']).toContain('PDF 저장');
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

describe('ganpanda.jsx — 실행하면 [가져오기]·[내보내기] 단추 (2026-11-07 "스크립트 버튼에 가져오기 내보내기 버튼으로 변경해줘")', () => {
  const data = illustratorPackage({ project: '매장', cards: [{ id: 'a1', no: 1, name: '정면', x: 0, y: 0, w: 1000, h: 500 }] });
  it('창에 가져오기·내보내기·취소 — 간판다 대지 문서가 없으면 내보내기는 꺼짐', () => {
    const f = fakeIllustrator({ choose: 'export' });
    vm.runInNewContext(jsxWithData(TEMPLATE, data), f.ctx);
    const w = f.ctx.lastWindow;
    expect(w.buttons.map((b: Rec) => String(b.text).split(' ')[0])).toEqual(['가져오기', '내보내기', '취소']);
    expect(w.buttons[1].enabled).toBe(false);
    expect(f.log).toContain('window:내보내기:disabled');
    expect(f.docs).toHaveLength(0); // 아무것도 안 함
    expect(f.log.some((l) => l.startsWith('confirm:'))).toBe(false); // 예전 확인 창 없음
  });
  it('간판다 대지 문서를 연 채 [가져오기] → 새 대지 문서 (보내지 않음)', () => {
    const f = fakeIllustrator({ choose: 'import', existing: { names: ['매장 #1'] } });
    vm.runInNewContext(jsxWithData(TEMPLATE, data), f.ctx);
    expect(f.ctx.lastWindow.buttons[1].enabled).toBe(true);
    expect(f.docs).toHaveLength(2);
    expect(f.docs[1].artboards.map((a: Rec) => a.name)).toEqual(['매장 #1']);
    expect(f.written['/tmp/existing.ganpanda']).toBeUndefined();
  });
  it('[취소] → 아무것도 안 함', () => {
    const f = fakeIllustrator({ choose: 'cancel', existing: { names: ['매장 #1'], layers: [{ name: '디자인', items: [[10, -10, 50, -50]] }] } });
    vm.runInNewContext(jsxWithData(TEMPLATE, data), f.ctx);
    expect(f.docs).toHaveLength(1);
    expect(f.docs[0].saved).toBeNull();
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
