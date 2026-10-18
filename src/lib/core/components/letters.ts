// 입체 글자(채널·스카시) 공통 단가: 글자 객체마다 (글자수 × 높이 cm × 원/자·cm) 또는 공급사 계산법(글자 크기 구간 자당)
import type { SignPart } from '../model';
import type { PartPriceCtx } from './types';
import { charCountOf } from '../charCount';
import { evalLetter, findMethod } from '../calcMethods';
import { markupFor } from '../markup';
import { fmt } from '../priceFormat';

export function lettersPrice(p: SignPart, label: string, ctx: PartPriceCtx): void {
  const { o, prices } = ctx;
  const unit = prices.products[p.type] ?? 0;
  const texts = p.items.filter((it) => it.kind === 'text').map((it) => ({ t: (it.text ?? '').trim(), n: it.count ?? charCountOf({ text: it.text }), h: it.h || o.heightMm || 0 })).filter((x) => x.n > 0);
  if (!texts.length) { ctx.need(label, o.heightMm || p.items.some((it) => it.h) ? '문구 또는 글자수 필요' : '치수 필요'); return; }
  if (texts.some((x) => !x.h)) { ctx.need(label, '치수 필요'); return; }
  const method = findMethod(prices.methods?.[p.type]);
  if (method && method.kind === 'letters') {
    // 공급사 계산법: 글자 크기 구간 자당 × 배수
    const rs = texts.map((x) => { const r = evalLetter(method, x.h, x.t)!; const each = r.item.price * markupFor(prices, r.item); return { ...x, r, each }; });
    const desc = (x: (typeof rs)[number]) => `${x.r.item.option} ${fmt(x.each)}원/자${x.r.over ? ' (최대 구간 초과)' : ''}`;
    const detail = rs.length === 1 ? `${rs[0].n}자 × ${desc(rs[0])}` : rs.map((x) => `"${x.t}" ${x.n}자 × ${desc(x)}`).join(' + ');
    ctx.finish(label, detail, rs.reduce((a, x) => a + x.n * x.each, 0), p.type, rs.reduce((a, x) => a + x.n * x.r.item.price, 0));
    return;
  }
  const raw = texts.reduce((a, x) => a + x.n * (x.h / 10) * unit, 0);
  const detail = texts.length === 1 ? `${texts[0].n}자 × 높이 ${fmt(texts[0].h)}mm × ${fmt(unit)}원/자·cm` : `${texts.map((x) => `"${x.t}" ${x.n}자×${fmt(x.h)}mm`).join(' + ')} × ${fmt(unit)}원/자·cm`;
  ctx.finish(label, detail, raw, p.type);
}
