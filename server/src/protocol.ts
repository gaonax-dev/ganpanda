// y-websocket 호환 메시지 규격 (클라이언트는 공식 y-websocket 라이브러리 사용)
import * as encoding from 'lib0/encoding';
import * as decoding from 'lib0/decoding';

export const MSG_SYNC = 0;
export const MSG_AWARENESS = 1;
export const MSG_QUERY_AWARENESS = 3;

/** awareness 항목: clientID, clock, 상태 JSON ("null" = 퇴장) */
export interface AwarenessEntry { clientId: number; clock: number; state: string }

/** [MSG_AWARENESS][len][count]{clientID, clock, stateJSON}* → 항목 배열. 형식이 깨졌으면 null */
export function parseAwareness(message: Uint8Array): AwarenessEntry[] | null {
  try {
    const dec = decoding.createDecoder(message);
    if (decoding.readVarUint(dec) !== MSG_AWARENESS) return null;
    const upd = decoding.createDecoder(decoding.readVarUint8Array(dec));
    const n = decoding.readVarUint(upd);
    const out: AwarenessEntry[] = [];
    for (let i = 0; i < n; i++) {
      out.push({ clientId: decoding.readVarUint(upd), clock: decoding.readVarUint(upd), state: decoding.readVarString(upd) });
    }
    return out;
  } catch {
    return null;
  }
}

export function encodeAwareness(entries: AwarenessEntry[]): Uint8Array {
  const inner = encoding.createEncoder();
  encoding.writeVarUint(inner, entries.length);
  for (const e of entries) {
    encoding.writeVarUint(inner, e.clientId);
    encoding.writeVarUint(inner, e.clock);
    encoding.writeVarString(inner, e.state);
  }
  const out = encoding.createEncoder();
  encoding.writeVarUint(out, MSG_AWARENESS);
  encoding.writeVarUint8Array(out, encoding.toUint8Array(inner));
  return encoding.toUint8Array(out);
}

/** 퇴장 알림: 같은 clientID, clock + 1, 상태 null */
export const removalOf = (e: { clientId: number; clock: number }): AwarenessEntry => ({ clientId: e.clientId, clock: e.clock + 1, state: 'null' });
