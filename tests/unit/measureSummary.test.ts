// 프로젝트 카드 실측 상태 (2026-10-21)
import { describe, expect, it } from 'vitest';
import { measureLabel } from '../../src/lib/core/measureSummary';

describe('카드 글자', () => {
  it('사인물이 없으면 상태 이름만', () => {
    expect(measureLabel({ status: 'waiting' }, '대기')).toEqual({ kind: 'none', label: '대기' });
    expect(measureLabel({ status: 'waiting', signTotal: 0 }, '대기')).toEqual({ kind: 'none', label: '대기' });
  });
  it('대기: 치수가 하나도 없으면 대기 · 사인물 N, 하나라도 있으면 실측중 · 미측정 u/N, 다 있으면 실측완료 N', () => {
    expect(measureLabel({ status: 'waiting', signTotal: 3, signUnmeasured: 3 }, '대기')).toEqual({ kind: 'waiting', label: '대기 · 사인물 3' });
    expect(measureLabel({ status: 'waiting', signTotal: 3, signUnmeasured: 1 }, '대기')).toEqual({ kind: 'measuring', label: '실측중 · 미측정 1/3' });
    expect(measureLabel({ status: 'waiting', signTotal: 3, signUnmeasured: 0 }, '대기')).toEqual({ kind: 'measured', label: '실측완료 3' });
  });
  it('다른 상태는 상태 이름 뒤에 실측 수', () => {
    expect(measureLabel({ status: 'ongoing', signTotal: 2, signUnmeasured: 1 }, '진행중').label).toBe('진행중 · 미측정 1/2');
    expect(measureLabel({ status: 'done', signTotal: 2, signUnmeasured: 0 }, '완료').label).toBe('완료 · 실측완료 2');
  });
  it('미측정이 전체보다 크게 들어와도 전체로 자른다', () => {
    expect(measureLabel({ status: 'waiting', signTotal: 2, signUnmeasured: 5 }, '대기').label).toBe('대기 · 사인물 2');
  });
});
