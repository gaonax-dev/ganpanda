// 구성 요소 레지스트리 (레이어 구조 0단계, 2026-10-18). 새 종류: 모듈을 만들고 여기 한 줄 — 코어·UI·3D 는 종류 이름으로 분기하지 않는다
import type { SignPart } from '../model';
import type { Component } from './types';
import { channel } from './channel';
import { scashi } from './scashi';
import { sheet } from './sheet';
import { light } from './light';
import { ledModule, molding, pole } from './accessories';

export type { Accessory, Component, PartPriceCtx } from './types';

export const COMPONENTS: readonly Component[] = [channel, scashi, sheet, light, molding, pole, ledModule];
const BY_KIND = new Map(COMPONENTS.map((c) => [c.kind, c]));

/** 종류 모듈. 모르는 종류(옛 데이터·앞으로의 종류)는 시트처럼 평면·면적 없는 기본 동작 대신 오류로 — 데이터는 모델 유니온이 지킨다 */
export function componentOf(kind: SignPart['kind'] | string): Component {
  const c = BY_KIND.get(kind as SignPart['kind']);
  if (!c) throw new Error(`모르는 구성 요소 종류: ${kind}`);
  return c;
}
export const componentKinds = (): SignPart['kind'][] => COMPONENTS.map((c) => c.kind);
