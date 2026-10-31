// 프로젝트 컬러 (2026-10-31 사용자: "색상을 개별구성에서 선택하지 않고 전체 사인물이 공유해야함으로 … 프로젝트 컬러 메인컬러, 배경컬러, 포인트컬러 …
// 시트는 lx c3940 페인트는 pantone … 해당 컬러를 변경하면 전부 변경 · 프로젝트 컬러셋을 추가하면 복제는 기존의 컬러 구성과 연결을 받아서")
import { describe, expect, it } from 'vitest';
import { activeSlot, addSlot, colorPatch, duplicateSet, newProjectColors, refreshColorPatches, setSlot, slotOfOptions, switchSet } from '../../src/lib/core/projectColors';
import { paintHex } from '../../src/lib/core/materials';

describe('프로젝트 컬러', () => {
  it('처음에는 메인·배경·포인트 칸 — 색은 아직 없음', () => {
    const pc = newProjectColors();
    expect(pc.sets).toHaveLength(1);
    expect(pc.sets[0].slots.map((s) => s.name)).toEqual(['메인', '배경', '포인트']);
    expect(pc.sets[0].slots.every((s) => !s.hex)).toBe(true);
  });
  it('칸에 미리보기 색과 제작 코드(시트·필름·원단·페인트)를 적는다, 칸을 더할 수 있다', () => {
    let pc = newProjectColors();
    const main = pc.sets[0].slots[0].id;
    pc = setSlot(pc, pc.active, main, { label: '앰버', hex: '#ffbf00', uses: { sheet: 'LX C3940', paint: 'PANTONE 7408 C' } });
    expect(activeSlot(pc, main)).toMatchObject({ label: '앰버', hex: '#ffbf00', uses: { sheet: 'LX C3940', paint: 'PANTONE 7408 C' } });
    pc = addSlot(pc, '보조');
    expect(pc.sets[0].slots.map((s) => s.name)).toEqual(['메인', '배경', '포인트', '보조']);
  });
  it('사인물 면에는 칸을 연결 — 3D·칩은 지금 색(hex)으로, 칸 이름·코드도 남는다', () => {
    let pc = newProjectColors();
    const main = pc.sets[0].slots[0].id;
    pc = setSlot(pc, pc.active, main, { label: '앰버', hex: '#ffbf00', uses: { sheet: 'LX C3940' } });
    const opts = colorPatch('face', pc, main, 'sheet');
    expect(paintHex(opts, 'face')).toBe('#ffbf00');
    expect(slotOfOptions(opts, 'face')).toBe(main);
    expect(String(opts.faceRef)).toContain('LX C3940');
  });
  it('칸 색을 바꾸면 그 칸을 쓰는 모든 사인물·구성 요소가 바뀐다', () => {
    let pc = newProjectColors();
    const main = pc.sets[0].slots[0].id, point = pc.sets[0].slots[2].id;
    pc = setSlot(pc, pc.active, main, { hex: '#ffbf00' });
    pc = setSlot(pc, pc.active, point, { hex: '#222222' });
    const objects = [
      { id: 'a', options: { ...colorPatch('body', pc, main) }, parts: [{ options: { ...colorPatch('face', pc, point) } }, { options: { faceSystem: '기본색', faceCode: '빨강' } }] },
      { id: 'b', options: { bodySystem: '기본색', bodyCode: '검정' } },
    ];
    pc = setSlot(pc, pc.active, main, { hex: '#00aa55' });
    const patches = refreshColorPatches(objects as never, pc);
    expect(patches.map((p) => p.id)).toEqual(['a']);
    expect(patches[0].patch.options?.bodyHex).toBe('#00aa55');
    expect(patches[0].patch.parts).toBeUndefined(); // 구성 요소는 포인트 칸(그대로) · 기본색 — 바뀐 게 없어 안 적는다
    pc = setSlot(pc, pc.active, point, { hex: '#444444' });
    const p2 = refreshColorPatches(objects as never, pc);
    expect(p2[0].patch.parts?.[0].options?.faceHex).toBe('#444444');
    expect(p2[0].patch.parts?.[1].options?.faceCode).toBe('빨강'); // 프로젝트 칸이 아닌 것은 그대로
  });
  it('컬러셋을 더하면 지금 셋을 복제(칸 연결 그대로) — 셋을 바꾸면 모든 사인물이 그 셋의 색으로', () => {
    let pc = newProjectColors();
    const main = pc.sets[0].slots[0].id;
    pc = setSlot(pc, pc.active, main, { label: '앰버', hex: '#ffbf00' });
    const first = pc.active;
    pc = duplicateSet(pc, first, '야간 시안');
    const second = pc.sets[1].id;
    expect(pc.sets[1].slots.map((s) => s.id)).toEqual(pc.sets[0].slots.map((s) => s.id)); // 같은 칸
    expect(pc.active).toBe(second);
    pc = setSlot(pc, second, main, { hex: '#3355ff' });
    expect(activeSlot(pc, main)?.hex).toBe('#3355ff');
    const objects = [{ id: 'a', options: { ...colorPatch('face', switchSet(pc, first), main) } }];
    expect(refreshColorPatches(objects as never, pc)[0].patch.options?.faceHex).toBe('#3355ff');
    expect(refreshColorPatches(objects as never, switchSet(pc, first))).toEqual([]); // 이미 그 색
  });
});
