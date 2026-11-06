// 프로젝트 카드 실측 상태 (2026-10-21 → "실측 안내 없이 숫자만")
import { describe, expect, it } from 'vitest';
import { designCounts, designLabel, measureLabel } from '../../src/lib/core/measureSummary';

describe('카드 숫자', () => {
  it('사인물이 없으면 숫자 없음', () => {
    expect(measureLabel({ status: 'waiting' }, '대기')).toMatchObject({ kind: 'none', label: '대기', count: '' });
  });
  it('미측정이 있으면 미측정/전체, 다 재면 전체 수만', () => {
    expect(measureLabel({ status: 'waiting', signTotal: 3, signUnmeasured: 3 }, '대기')).toMatchObject({ kind: 'waiting', count: '3/3' });
    expect(measureLabel({ status: 'waiting', signTotal: 3, signUnmeasured: 1 }, '대기')).toMatchObject({ kind: 'measuring', count: '1/3' });
    expect(measureLabel({ status: 'waiting', signTotal: 3, signUnmeasured: 0 }, '대기')).toMatchObject({ kind: 'measured', count: '3', label: '대기' });
    expect(measureLabel({ status: 'done', signTotal: 2, signUnmeasured: 0 }, '완료').count).toBe('2');
  });
  it('설명 글(title)에는 뜻이 있다', () => {
    expect(measureLabel({ status: 'waiting', signTotal: 2, signUnmeasured: 1 }, '대기').title).toBe('미측정 1 / 사인물 2');
    expect(measureLabel({ status: 'waiting', signTotal: 2, signUnmeasured: 5 }, '대기').count).toBe('2/2'); // 전체로 자른다
  });
});

// 홈 프로젝트 카드의 디자인 진행 (2026-11-06 사용자: "디지인 내보내면 번호생성하고 배지로 사인물카드에 작게넣어줘 이걸로 상태를 디자인 진행으로 표시" → "상태 표시는 홈의 프로젝트 카드를 말한거야")
describe('designLabel — 일러스트로 보낸(대지 번호) 사인물 수 · 그중 디자인을 받은 수', () => {
  it('보낸 것이 없으면 표시 없음', () => expect(designLabel({ signDesign: 0, signDesigned: 0 })).toBeNull());
  it('받는 중 = "디자인 진행" + 받은/보낸', () => expect(designLabel({ signDesign: 5, signDesigned: 2 })).toEqual({ kind: 'designing', label: '디자인 진행', count: '2/5', title: '디자인 받음 2 / 보냄 5' }));
  it('다 받으면 "디자인 완료" + 수', () => expect(designLabel({ signDesign: 3, signDesigned: 3 })).toEqual({ kind: 'designed', label: '디자인 완료', count: '3', title: '디자인 받음 3 / 보냄 3' }));
  it('받은 수가 보낸 수를 넘으면 보낸 수로', () => expect(designLabel({ signDesign: 2, signDesigned: 9 })?.count).toBe('2'));
});

describe('designCounts — 사인물에서 셈', () => {
  it('대지 번호가 있는 사인물 = 보냄, 그중 디자인이 있으면 받음', () => {
    expect(designCounts([{ artNo: 1, design: {} }, { artNo: 2 }, { design: {} }, {}])).toEqual({ signDesign: 2, signDesigned: 1 });
  });
});
