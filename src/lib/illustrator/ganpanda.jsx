// 간판다 ↔ 일러스트레이터 (2026-11-05 사용자: "가장 나이스한건 일러스트 플러그인을 개발하고 우리 포맷을 일러스트에서 재구성하는 거야").
// 간판다 [⇄ 디자인 싱크] › 일러스트레이터 › [대지 받기 (zip)]의 폴더에서 실행(또는 설치형 간판다.jsx 로 폴더를 고름). 앞줄의 GANPANDA_DATA 가 프로젝트 데이터.
// 일러스트 기준 파일 싱크 (2026-11-06 정의 → 2026-11-07 PDF 로):
//  - [가져오기]: 사인물마다 크기대로 대지("프로젝트명 #번호"), 레이어 아래부터 받은 이미지(잠금 — 카드의 최종 그림) · 디자인 → .ai(PDF 호환) 저장. 단위 mm
//  - [내보내기]: 대지 번호를 XMP 에 적고 .ai 와 같은 이름의 PDF(Acrobat 레이어·일러스트 편집 유지)를 저장 — 간판다가 그 PDF 에서
//    대지별 디자인 그림(받은 이미지 레이어는 끔)과 레이어별 벡터("채널"·"스카시" 레이어 → 그 구성물의 입체)를 꺼낸다
// ExtendScript(ES3) — let·화살표 함수·JSON 없음. → docs/features/illustrator.md
(function () {
  var PT = 72 / 25.4; // mm → pt
  var NS = 'http://ns.ganpanda.co.kr/1.0/';
  var DATA = typeof GANPANDA_DATA !== 'undefined' ? GANPANDA_DATA : null;

  function idOf(name) { var m = /#([A-Za-z0-9_\-]+)\s*$/.exec(String(name)); return m ? m[1] : null; }

  function writeXmp(doc, ids) {
    try { if (ExternalObject.AdobeXMPScript == undefined) ExternalObject.AdobeXMPScript = new ExternalObject('lib:AdobeXMPScript'); } catch (e) {}
    XMPMeta.registerNamespace(NS, 'ganpanda');
    var x = new XMPMeta(doc.XMPString);
    x.setProperty(NS, 'artboards', ids.join('|'));
    doc.XMPString = x.serialize();
  }
  function pdfOptions() { var o = new IllustratorSaveOptions(); o.pdfCompatible = true; return o; }

  // ---------- base64 → 파일 ----------
  var B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  // 빠른 해독 (2026-11-05 "일러스트에서 .jsx를 가져오는데 많은 시간이 걸린다"): ExtendScript 는 느리다 — 글자마다 indexOf·바이트마다 push 하던 것을
  // 미리 만든 표 + 4글자 → 3바이트 한 번에 + 덩어리로 모아 붙이기로
  var B64T = {};
  (function () { for (var t = 0; t < 64; t++) B64T[B64.charAt(t)] = t; })();
  function b64decode(s) {
    s = String(s).replace(/[^A-Za-z0-9+\/]/g, '');
    var n = s.length, out = [], chunk = [], i, a, b, c, d;
    for (i = 0; i + 3 < n; i += 4) {
      a = B64T[s.charAt(i)]; b = B64T[s.charAt(i + 1)]; c = B64T[s.charAt(i + 2)]; d = B64T[s.charAt(i + 3)];
      chunk.push(String.fromCharCode((a << 2) | (b >> 4), ((b & 15) << 4) | (c >> 2), ((c & 3) << 6) | d));
      if (chunk.length >= 4096) { out.push(chunk.join('')); chunk = []; }
    }
    var r = n - i;
    if (r >= 2) {
      a = B64T[s.charAt(i)]; b = B64T[s.charAt(i + 1)];
      if (r === 2) chunk.push(String.fromCharCode((a << 2) | (b >> 4)));
      else { c = B64T[s.charAt(i + 2)]; chunk.push(String.fromCharCode((a << 2) | (b >> 4), ((b & 15) << 4) | (c >> 2))); }
    }
    out.push(chunk.join(''));
    return out.join('');
  }
  var tmpCount = 0;
  function dataUrlFile(url) {
    var m = /^data:([^;,]+)(;base64)?,(.*)$/.exec(url);
    if (!m) return null;
    var ext = m[1].indexOf('svg') >= 0 ? 'svg' : m[1].indexOf('jpeg') >= 0 ? 'jpg' : m[1].indexOf('webp') >= 0 ? 'webp' : 'png';
    var f = new File(Folder.temp.fsName + '/ganpanda-' + (tmpCount++) + '.' + ext);
    f.encoding = 'BINARY';
    f.open('w');
    f.write(m[2] ? b64decode(m[3]) : decodeURIComponent(m[3]));
    f.close();
    return f;
  }
  // 그림 파일 (2026-11-05 "5분정도 걸린다. 차라리 이미지들을 따로 폴더에 넣고 연결하는게 좋을 거 같은데"): 간판다가 내려준 zip 을 푼 폴더의 images/… 를
  // 그대로 연결한다 — 풀기·묻기 없음. 예전 data URL 이면 풀어서 묻는다(느림)
  var BASE = (function () { try { return new File($.fileName).parent; } catch (e) { return null; } })(); // 설치형은 고른 폴더로 바뀐다
  var missing = 0;
  function isData(ref) { return /^data:/.test(String(ref)); }
  function refFile(ref) {
    if (isData(ref)) return dataUrlFile(ref);
    if (!BASE) { missing++; return null; }
    var f = new File(BASE.fsName + '/' + ref);
    if (!f.exists) { missing++; return null; }
    return f;
  }
  function place(layer, ref, left, top, w, h) {
    var f = refFile(ref);
    if (!f) return null;
    var it = layer.placedItems.add();
    it.file = f;
    it.width = w; it.height = h;
    it.position = [left, top];
    if (isData(ref)) { try { it.embed(); } catch (e) {} } // 예전 방식만 묻는다 — 파일은 연결 그대로
    return it;
  }

  var RECEIVED = '받은 이미지', DESIGN = '디자인';

  // ---------- [내보내기] 레이어가 살아 있는 PDF 저장 ----------
  // (2026-11-07 "pdf로 내보내면 어떤가?" → "pdf를 직접 편집가능하다면 굿이 path를 따로 둘 이유가 없고 연결된 pdf를 통해 path를 추출해 바로 연결 후 3d로" → 레이어로 고르기)
  // 대지별로 그림을 내보내던 방식(느리고, 빈 그림·알 수 없는 오류)은 대체됨: 일러스트가 PDF 를 한 번 저장할 뿐 — 간판다가 PDF 에서 대지별 디자인 그림(받은 이미지 레이어는 끔)과
  // 레이어별 벡터(채널·스카시 입체)를 꺼낸다. 단계마다 따로 — 실패한 단계·오류를 알림과 로그 파일(같은 이름.ganpanda-log.txt)로
  function sendBack(doc) {
    var ids = [], n = 0, i, fails = [];
    function step(name, fn) { try { return fn(); } catch (e) { fails.push(name + ': ' + (e && e.message ? e.message : e) + (e && e.line ? ' (줄 ' + e.line + ')' : '')); return null; } }
    for (i = 0; i < doc.artboards.length; i++) { var id = idOf(doc.artboards[i].name); ids.push(id || ''); if (id) n++; }
    step('XMP 짝 적기', function () { writeXmp(doc, ids); });
    var target = doc.fullName ? doc.fullName : File.saveDialog('간판다로 보낼 .ai 저장', 'Illustrator:*.ai');
    if (!target) { alert('저장하지 않았습니다.'); return; }
    var base = String(target.fsName).replace(/\.(ai|pdf)$/i, ''), aiFile = new File(base + '.ai'), pdfFile = new File(base + '.pdf');
    var aiOk = step('.ai 저장', function () { doc.saveAs(aiFile, pdfOptions()); return true; });
    // 글자 → 윤곽선은 PDF 에만 (2026-11-07 "글자를 아웃라인으로 변경하고 내보내기 하는데 원파일은 아웃라인 변환안된 상태 유지하게"):
    // 원본 .ai 를 먼저 저장해 두고, 잠금을 풀어 글자를 윤곽선으로 바꿔 PDF 를 저장한 뒤 문서를 저장 없이 닫고 원본 .ai 를 다시 연다
    var outlined = 0;
    if (aiOk) step('글자 윤곽선', function () {
      var k2;
      function unlock(ls) { for (var u = 0; u < ls.length; u++) { try { ls[u].locked = false; } catch (e) {} if (ls[u].layers) unlock(ls[u].layers); } }
      unlock(doc.layers);
      var tfs = [];
      for (k2 = 0; k2 < doc.textFrames.length; k2++) tfs.push(doc.textFrames[k2]);
      for (k2 = tfs.length - 1; k2 >= 0; k2--) { try { tfs[k2].locked = false; tfs[k2].createOutline(); outlined++; } catch (e) {} }
    });
    var pdfOk = step('PDF 저장', function () {
      var o = new PDFSaveOptions();
      o.acrobatLayers = true; // 맨 위 레이어 = Acrobat 레이어 — 간판다가 레이어별로 읽는다
      o.preserveEditability = true; // 일러스트에서 PDF 를 그대로 다시 편집
      try { o.compatibility = PDFCompatibility.ACROBAT7; } catch (e) {}
      o.viewAfterSaving = false;
      doc.saveAs(pdfFile, o);
      return true;
    });
    // 윤곽선으로 바꾼 문서는 버리고 원본 .ai 를 다시 연다 — 원본을 저장하지 못했으면 닫지 않는다(작업을 잃지 않게)
    if (aiOk) step('원본 .ai 다시 열기', function () { doc.close(SaveOptions.DONOTSAVECHANGES); doc = app.open(aiFile); });
    var layers = [], k;
    for (k = 0; k < doc.layers.length; k++) { var nm = doc.layers[k].name; if (nm !== RECEIVED && nm !== DESIGN) layers.push(nm); }
    var failText = '';
    if (fails.length) {
      failText = '\n\n실패한 단계 ' + fails.length + '개:\n- ' + fails.join('\n- ') + '\n(기록: ' + base.replace(/^.*[\/\\]/, '') + '.ganpanda-log.txt)';
      try { var lf = new File(base + '.ganpanda-log.txt'); lf.encoding = 'UTF-8'; lf.open('w'); lf.write('간판다 내보내기 ' + new Date() + '\n' + fails.join('\n') + '\n'); lf.close(); } catch (e) {}
    }
    if (!pdfOk) { alert('PDF 를 저장하지 못했습니다.' + failText); return; }
    alert('간판다로 보낼 PDF 를 저장했습니다 (간판다 대지 ' + n + '개' + (outlined ? ', 글자 ' + outlined + '개는 PDF 에서만 윤곽선 — 원본 .ai 는 글자 그대로' : '') + ').\n' + pdfFile.fsName.replace(/^.*[\/\\]/, '') + ' 를 간판다 [⇄ 디자인 싱크] › 일러스트레이터 › 받기로 올리세요.\n\n' +
      '· 디자인: 대지마다 그림으로 사인물 카드에 (받은 이미지 레이어는 빼고)\n' +
      '· 입체: 맨 위 레이어 이름에 "채널"·"스카시"를 넣으면 그 레이어의 패스가 그 구성물의 입체로' +
      (layers.length ? '\n  지금 레이어: ' + layers.join(', ') : '') + failText);
  }

  // ---------- 대지 만들기 ----------
  /**
   * 새 문서 — 단위 mm (2026-11-07 "일러스트 새문서 치수 단위를 mm으로 설정되게"): 문서 프리셋(units = 밀리미터, RGB, 크기 pt)으로 만든다.
   * 프리셋 이름(인쇄 등)은 일러스트 언어마다 달라 설치된 첫 시작 프리셋을 쓰고, 프리셋으로 못 만들면 예전 방식(기본 단위)
   */
  function newDocMm(W, H) {
    try {
      var p = new DocumentPreset();
      p.units = RulerUnits.Millimeters;
      p.colorMode = DocumentColorSpace.RGB;
      p.width = W; p.height = H;
      var startup = app.startupPresetsList && app.startupPresetsList.length ? app.startupPresetsList[0] : 'Print';
      return app.documents.addDocument(startup, p);
    } catch (e) {
      return app.documents.add(DocumentColorSpace.RGB, W, H);
    }
  }
  function build(data) {
    if (!data || !data.cards || !data.cards.length) { alert('간판다 데이터에 사인물 카드가 없습니다. 간판다 [⇄ 디자인 싱크] › 일러스트레이터 › [대지 받기 (zip)]로 다시 받아 주세요.'); return; }
    var k = data.scale * PT;
    var W = Math.max(1, data.width * k), H = Math.max(1, data.height * k);
    var doc = newDocMm(W, H);
    try { app.coordinateSystem = CoordinateSystem.DOCUMENTCOORDINATESYSTEM; } catch (e) {}
    // 레이어: 아래부터 받은 이미지(잠금) · 디자인 (나중에 만든 것이 위). 입체 부분은 디자이너가 맨 위 레이어 "채널"·"스카시"로 (2026-11-07)
    var recv = doc.layers[0];
    recv.name = RECEIVED;
    var design = doc.layers.add(); design.name = DESIGN;
    var ids = [], i;
    for (i = 0; i < data.cards.length; i++) {
      var c = data.cards[i];
      var left = c.x * k, top = -c.y * k, w = c.w * k, h = c.h * k;
      var ab = doc.artboards.add([left, top, left + w, top - h]);
      // 대지 이름 = "프로젝트명 #번호" (2026-11-06 "대지 #id로 추적하고 프로젝트명+숫자 간단하게") — # 뒤 값으로 사인물을 찾는다
      var ref = c.no ? String(c.no) : c.id;
      ab.name = String(data.project).replace(/#/g, '') + ' #' + ref;
      ids.push(ref);
      if (c.image) place(recv, c.image, left, top, w, h);
    }
    if (doc.artboards.length > data.cards.length) doc.artboards.remove(0); // 문서를 만들 때 생긴 처음 대지
    recv.locked = true;
    try { doc.activeLayer = design; } catch (e) {}
    writeXmp(doc, ids);
    var f = File.saveDialog('간판다 대지 저장 (' + data.project + ')', 'Illustrator:*.ai');
    if (f) doc.saveAs(f, pdfOptions());
    alert('사인물 ' + data.cards.length + '개를 대지로 만들었습니다' + (data.scale !== 1 ? ' (축척 1:' + Math.round(1 / data.scale) + ')' : '') + '.\n' +
      '"디자인" 레이어에 대지마다 디자인을 하고, 입체로 만들 부분은 맨 위 레이어를 따로 만들어 이름에 "채널"·"스카시"를 넣으세요. 이 스크립트를 다시 실행해 [내보내기]를 누르면 PDF 로 저장합니다.' +
      (missing ? '\n\n그림 ' + missing + '개를 찾지 못했습니다 — 간판다에서 받은 zip 을 풀고 그 폴더(images 폴더가 있는 곳)를 써 주세요.' : ''));
  }

  /**
   * 실행하면 [가져오기]·[내보내기]·[취소] 단추 창 (2026-11-07 "스크립트 버튼에 가져오기 내보내기 버튼으로 변경해줘").
   * 가져오기 = 간판다 → 일러스트(받은 폴더로 대지 만들기), 내보내기 = 일러스트 → 간판다(.ganpanda) — 열린 문서에 간판다 대지(#번호)가 없으면 꺼짐.
   * ScriptUI 가 없으면 예전처럼 확인 창
   */
  function chooseAction(canExport) {
    if (typeof Window === 'undefined') return canExport && confirm('지금 문서를 간판다로 내보낼까요?\n[아니요]를 누르면 간판다에서 대지를 가져옵니다.') ? 'export' : 'import';
    var r = null;
    var w = new Window('dialog', '간판다');
    w.orientation = 'column'; w.alignChildren = 'fill';
    w.add('statictext', undefined, '간판다 디자인 싱크');
    var bi = w.add('button', undefined, '가져오기 — 간판다에서 받은 폴더로 대지 만들기');
    var be = w.add('button', undefined, '내보내기 — 이 문서의 디자인·path 를 간판다로');
    var bc = w.add('button', undefined, '취소', { name: 'cancel' });
    be.enabled = canExport;
    if (!canExport) w.add('statictext', undefined, '내보내기: 간판다 대지(이름 끝 #번호)가 있는 문서를 연 채 실행하세요.');
    bi.onClick = function () { r = 'import'; w.close(); };
    be.onClick = function () { r = 'export'; w.close(); };
    bc.onClick = function () { r = null; w.close(); };
    w.show();
    return r;
  }

  var active = app.documents.length ? app.activeDocument : null;
  var has = false, j;
  if (active) for (j = 0; j < active.artboards.length; j++) if (idOf(active.artboards[j].name)) { has = true; break; }
  var action = chooseAction(has);
  if (!action) return;
  if (action === 'export') { sendBack(active); return; }
  if (DATA) { build(DATA); return; }
  // 설치형 (2026-11-05 "가볍게 일러스트에 스크립트 설치하고 실행하면 폴더 선택가능하게 파인더 띄워주고 가는건"): 데이터 줄이 없으면 받은 폴더를 고른다
  var folder = Folder.selectDialog('간판다에서 받은 폴더를 고르세요 (zip 을 푼 폴더 — ganpanda.json 이 있는 곳)');
  if (!folder) return;
  var jf = new File(folder.fsName + '/ganpanda.json');
  if (!jf.exists) { alert('그 폴더에 ganpanda.json 이 없습니다.\n간판다 디자인 탭 [⇄ 디자인 싱크] › 일러스트레이터 › [대지 받기 (zip)]로 받은 zip 을 풀고, 그 폴더를 골라 주세요.'); return; }
  jf.encoding = 'UTF-8'; jf.open('r'); var txt = jf.read(); jf.close();
  var picked;
  try { picked = eval('(' + txt + ')'); } catch (e) { alert('ganpanda.json 을 읽지 못했습니다: ' + e); return; }
  BASE = folder;
  build(picked);
})();
