// 2026-11-10 사용자: "모바일에서는 굽지않고(기기확인) 데스크탑 앱에서만 굽게"
import { describe, expect, it } from 'vitest';
import { canBakeAOOn } from '../../src/lib/core/aoBake';

const MAC_APP = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15 Ganpanda-App/0.4.0';
describe('canBakeAOOn — 데스크톱 앱에서만 AO 를 굽는다', () => {
  it('데스크톱 앱(맥)은 굽는다', () => expect(canBakeAOOn(MAC_APP, 0)).toBe(true));
  it('브라우저는 굽지 않는다', () => expect(canBakeAOOn(MAC_APP.replace(' Ganpanda-App/0.4.0', ''), 0)).toBe(false));
  it('모바일 앱(아이폰·안드로이드)은 굽지 않는다', () => {
    expect(canBakeAOOn('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Ganpanda-App/0.4.0', 5)).toBe(false);
    expect(canBakeAOOn('Mozilla/5.0 (Linux; Android 14; SM-S921N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Mobile Safari/537.36 Ganpanda-App/0.4.0', 5)).toBe(false);
  });
  it('아이패드(맥처럼 보이는 UA + 터치)도 굽지 않는다', () => expect(canBakeAOOn(MAC_APP, 5)).toBe(false));
});
