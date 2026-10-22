// 멤버 컨펌 (2026-10-22 사용자: "컨펌에 맴버컴펌도 필요하다") — 고객에게 보내기 전 팀 안 확인
import { describe, expect, it } from 'vitest';
import { addMemberCheck, memberCheckState } from '../../src/lib/core/proposal';

describe('멤버 확인', () => {
  it('같은 사람은 마지막 것만, 지금 내용 해시와 같으면 유효·다르면 다시 확인', () => {
    let checks = addMemberCheck(undefined, { by: '김실측', at: 1, hash: 'h1' });
    checks = addMemberCheck(checks, { by: '이디자인', at: 2, hash: 'h1' });
    checks = addMemberCheck(checks, { by: '김실측', at: 3, hash: 'h2' });
    expect(checks.map((c) => `${c.by}:${c.hash}`)).toEqual(['이디자인:h1', '김실측:h2']);
    const st = memberCheckState(checks, 'h2');
    expect(st.valid.map((c) => c.by)).toEqual(['김실측']);
    expect(st.stale.map((c) => c.by)).toEqual(['이디자인']);
    expect(memberCheckState(undefined, 'h2')).toEqual({ valid: [], stale: [] });
  });
});
