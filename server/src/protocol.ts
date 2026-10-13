// y-websocket 호환 메시지 규격 (클라이언트는 공식 y-websocket 라이브러리 사용)
import * as encoding from 'lib0/encoding';
import * as decoding from 'lib0/decoding';

export const MSG_SYNC = 0;
export const MSG_AWARENESS = 1;
export const MSG_QUERY_AWARENESS = 3;

/**
 * 접속자 상태(awareness) 메시지로부터 "퇴장" 메시지를 만든다.
 * 형식: [MSG_AWARENESS][len][count]{clientID, clock, stateJSON}* → 같은 clientID, clock+1, "null"
 */
export function awarenessRemoval(message: Uint8Array): Uint8Array | null {
  try {
    const dec = decoding.createDecoder(message);
    if (decoding.readVarUint(dec) !== MSG_AWARENESS) return null;
    const upd = decoding.createDecoder(decoding.readVarUint8Array(dec));
    const n = decoding.readVarUint(upd);
    const inner = encoding.createEncoder();
    encoding.writeVarUint(inner, n);
    for (let i = 0; i < n; i++) {
      const clientID = decoding.readVarUint(upd);
      const clock = decoding.readVarUint(upd);
      decoding.readVarString(upd);
      encoding.writeVarUint(inner, clientID);
      encoding.writeVarUint(inner, clock + 1);
      encoding.writeVarString(inner, 'null');
    }
    const out = encoding.createEncoder();
    encoding.writeVarUint(out, MSG_AWARENESS);
    encoding.writeVarUint8Array(out, encoding.toUint8Array(inner));
    return encoding.toUint8Array(out);
  } catch {
    return null;
  }
}
