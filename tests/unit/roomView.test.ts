// 기기별 프로젝트 화면 기억 (2026-10-25 사용자: "기기별로 사용자 설정을 기록해서 다시 돌아올때 해당 셋팅으로 돌아오게 해줘
// 헤더 텝의 상태를 돌아왔을때 복원하고 뷰도 떠날때 위치로")
import { describe, expect, it } from 'vitest';
import { parseRoomView, roomViewKey } from '../../src/lib/core/roomView';

describe('프로젝트 화면 기억', () => {
  it('키는 프로젝트별', () => {
    expect(roomViewKey('abc')).toBe('ganpanda.roomView.abc');
  });
  it('탭과 뷰포트를 돌려준다', () => {
    expect(parseRoomView(JSON.stringify({ tab: 'list', viewport: { x: 10, y: -20, zoom: 0.7 } }))).toEqual({ tab: 'list', viewport: { x: 10, y: -20, zoom: 0.7 } });
  });
  it('모르는 탭·깨진 뷰포트는 버린다 (나머지는 살린다)', () => {
    expect(parseRoomView(JSON.stringify({ tab: 'nope', viewport: { x: 1, y: 2, zoom: 0 } }))).toEqual({});
    expect(parseRoomView(JSON.stringify({ tab: '2d', viewport: { x: 'a' } }))).toEqual({ tab: '2d' });
    expect(parseRoomView(JSON.stringify({ viewport: { x: 1, y: 2, zoom: 999 } }))).toEqual({}); // ZOOM_MAX 밖
  });
  it('없거나 JSON 이 아니면 빈 값', () => {
    expect(parseRoomView(null)).toEqual({});
    expect(parseRoomView('{')).toEqual({});
    expect(parseRoomView('[]')).toEqual({});
  });
});
