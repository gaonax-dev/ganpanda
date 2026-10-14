import { describe, expect, it } from 'vitest';
import { lightboxGeometry } from '../../src/lib/sim/signs';

describe('박스 간판 형상 (둥근 모서리)', () => {
  it('모서리 비율 0 → 상자 (8 꼭짓점 영역), 0.5 → 모서리가 깎여 외곽은 같고 꼭짓점이 많다', () => {
    const box = lightboxGeometry(2000, 1000, 100, 0);
    box.computeBoundingBox();
    const bb = box.boundingBox!;
    expect(bb.max.x - bb.min.x).toBeCloseTo(2000, 3); expect(bb.max.y - bb.min.y).toBeCloseTo(1000, 3); expect(bb.max.z - bb.min.z).toBeCloseTo(100, 3);
    const round = lightboxGeometry(2000, 1000, 100, 0.5);
    round.computeBoundingBox();
    const rb = round.boundingBox!;
    expect(rb.max.x - rb.min.x).toBeCloseTo(2000, 3); expect(rb.max.y - rb.min.y).toBeCloseTo(1000, 3);
    expect(round.attributes.position.count).toBeGreaterThan(box.attributes.position.count);
    // 모서리 (±1000, ±500) 근처에는 꼭짓점이 없다 (반지름 500 으로 깎임)
    const pos = round.attributes.position;
    for (let i = 0; i < pos.count; i++) expect(Math.abs(pos.getX(i)) > 990 && Math.abs(pos.getY(i)) > 490).toBe(false);
    // 앞면은 z = depth, 뒷면은 z = 0 (벽)
    expect(rb.min.z).toBeCloseTo(0, 3); expect(rb.max.z).toBeCloseTo(100, 3);
    expect(bb.min.z).toBeCloseTo(0, 3);
  });
});
