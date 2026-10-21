// 견적 요청 보내기 — 빠진 것 알려 주기, 요청 페이지 진행 단계 (2026-10-22 사용자: "\"견적요청보내기\" 왜 작동안하는지 모르겠다", "견적요청 페이지는 견적 요청된 상태를 더 잘 포장해서")
import { describe, expect, it } from 'vitest';
import { missingForRequest, requestSteps } from '../../src/lib/core/estimateRequest';

describe('missingForRequest — 보내기 전에 빠진 것을 말로', () => {
  const ok = { identity: 'store' as const, store: '바로 정육점', phone: '010-1234-5678', address: '경기도 광주시 경안로 1', photos: 1 };
  it('다 채우면 빈 목록', () => expect(missingForRequest(ok)).toEqual([]));
  it('하나씩 빠진 것', () => {
    expect(missingForRequest({ ...ok, identity: null })).toEqual(['사업자 인증 또는 일반 주문 선택']);
    expect(missingForRequest({ ...ok, store: ' ' })).toEqual(['가게 이름']);
    expect(missingForRequest({ ...ok, phone: '010-12' })).toEqual(['전화번호 (숫자 9~11자리)']);
    expect(missingForRequest({ ...ok, address: '' })).toEqual(['가게 주소']);
    expect(missingForRequest({ ...ok, address: '경안로 1' })).toEqual(['가게 주소에 시/군/구 (예: 경기도 광주시 …)']);
    expect(missingForRequest({ ...ok, photos: 0 })).toEqual(['사진 (보드에 가게 사진을 올려 주세요)']);
  });
});

describe('requestSteps — 요청 페이지 진행 단계', () => {
  it('접수 → 제안 도착 → 선택(승인); 취소는 따로', () => {
    expect(requestSteps('open', 0)).toEqual([{ id: 'sent', label: '요청 접수', state: 'done' }, { id: 'offers', label: '제안 도착', state: 'now' }, { id: 'chosen', label: '간판집 선택', state: 'todo' }]);
    expect(requestSteps('open', 2).map((s) => s.state)).toEqual(['done', 'done', 'now']);
    expect(requestSteps('approved', 2).map((s) => s.state)).toEqual(['done', 'done', 'done']);
    expect(requestSteps('cancelled', 1).map((s) => s.state)).toEqual(['done', 'cancelled', 'cancelled']);
  });
});
