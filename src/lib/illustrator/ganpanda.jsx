// 간판다 ↔ 일러스트레이터 (2026-11-05 사용자: "가장 나이스한건 일러스트 플러그인을 개발하고 우리 포맷을 일러스트에서 재구성하는 거야").
// 간판다 견적 탭 [일러스트] 로 받은 이 파일을 일러스트레이터 "파일 › 스크립트 › 기타 스크립트…" 로 실행한다. 앞줄의 GANPANDA_DATA 가 프로젝트 데이터.
//  - 대지 만들기: 사인물 카드 배치 그대로 사인물마다 대지("이름 #id")와 레이어("이름 #id") — 안에 하위 레이어 "바탕 (인쇄) #id:frame" 과
//    구성 요소마다 "채널 (입체) #id:구성요소id"·"시트 (인쇄) #id:…" (2026-11-05 "후렉스(인쇄) 위에 체널(입체), 스카시(입체+ 시트 또는 도색)의 구성이라면 일러스트 레이어를 생성").
//    카드 사진 = 잠긴 "간판다 사진" 레이어, 입힌 디자인 = 바탕 레이어(SVG 원본은 벡터) → .ai(PDF 호환) 저장
//  - 간판다로 보내기: 대지 이름에 #id 가 있는 문서를 연 채 다시 실행 → 대지 순서대로 사인물 id 를 문서 XMP(ganpanda:artboards)에 적어 같은 파일로 저장하고,
//    내용이 있는 구성 요소 하위 레이어마다 그 대지 크기로 내보내(입체 = SVG 글자 윤곽선, 인쇄 = PNG) "같은 이름.ganpanda" 묶음으로.
//    .ganpanda 를 간판다 디자인 탭에 올리면 구성 요소마다 자동으로 들어간다(채널·스카시는 입체). .ai 를 올리면 대지 전체가 사인물 바탕으로.
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
  function b64decode(s) {
    var out = [], buf = 0, bits = 0, i, c, v;
    for (i = 0; i < s.length; i++) {
      c = s.charAt(i);
      if (c === '=') break;
      v = B64.indexOf(c);
      if (v < 0) continue;
      buf = (buf << 6) | v; bits += 6;
      if (bits >= 8) { bits -= 8; out.push(String.fromCharCode((buf >> bits) & 255)); }
    }
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
  function textFile(text, ext) {
    var f = new File(Folder.temp.fsName + '/ganpanda-' + (tmpCount++) + '.' + ext);
    f.encoding = 'UTF-8';
    f.open('w'); f.write(text); f.close();
    return f;
  }
  function place(layer, url, left, top, w, h) {
    var f = dataUrlFile(url);
    if (!f) return null;
    var it = layer.placedItems.add();
    it.file = f;
    it.width = w; it.height = h;
    it.position = [left, top];
    try { it.embed(); } catch (e) {}
    return it;
  }

  function b64encode(bin) {
    var out = [], i, a, b, c;
    for (i = 0; i < bin.length; i += 3) {
      a = bin.charCodeAt(i) & 255; b = i + 1 < bin.length ? bin.charCodeAt(i + 1) & 255 : -1; c = i + 2 < bin.length ? bin.charCodeAt(i + 2) & 255 : -1;
      out.push(B64.charAt(a >> 2), B64.charAt(((a & 3) << 4) | (b < 0 ? 0 : b >> 4)), b < 0 ? '=' : B64.charAt(((b & 15) << 2) | (c < 0 ? 0 : c >> 6)), c < 0 ? '=' : B64.charAt(c & 63));
    }
    return out.join('');
  }
  function partOf(name) { var m = /#([A-Za-z0-9_\-]+):([A-Za-z0-9_\-]+)\s*$/.exec(String(name)); return m ? { sign: m[1], part: m[2] } : null; }
  function artboardOf(doc, signId) { for (var i = 0; i < doc.artboards.length; i++) if (idOf(doc.artboards[i].name) === signId) return doc.artboards[i].artboardRect; return null; }
  /** 하위 레이어 내용만 그 대지 크기의 임시 문서로 복제해 내보내고 base64 로 (입체 = SVG 글자 윤곽선, 인쇄 = PNG) */
  function exportLayer(layer, r, svg) {
    var W = r[2] - r[0], H = r[1] - r[3];
    var t = app.documents.add(DocumentColorSpace.RGB, W, H);
    var tr = t.artboards[0].artboardRect, i;
    for (i = 0; i < layer.pageItems.length; i++) { var d = layer.pageItems[i].duplicate(t.layers[0], ElementPlacement.PLACEATEND); d.translate(tr[0] - r[0], tr[1] - r[1]); }
    var f = new File(Folder.temp.fsName + '/ganpanda-out-' + (tmpCount++) + (svg ? '.svg' : '.png'));
    if (svg) { var o = new ExportOptionsSVG(); o.fontType = SVGFontType.OUTLINEFONT; o.embedRasterImages = true; t.exportFile(f, ExportType.SVG, o); }
    else { var p = new ExportOptionsPNG24(); p.transparency = true; p.antiAliasing = true; p.artBoardClipping = true; var sc = Math.max(10, Math.min(400, (2048 / Math.max(W, H)) * 100)); p.horizontalScale = sc; p.verticalScale = sc; t.exportFile(f, ExportType.PNG24, p); }
    t.close(SaveOptions.DONOTSAVECHANGES);
    f.encoding = 'BINARY'; f.open('r'); var bin = f.read(); f.close();
    return b64encode(bin);
  }
  function q(s) { return '"' + String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"'; }

  // ---------- 간판다로 보내기 ----------
  function sendBack(doc) {
    var ids = [], n = 0, i, j;
    for (i = 0; i < doc.artboards.length; i++) { var id = idOf(doc.artboards[i].name); ids.push(id || ''); if (id) n++; }
    writeXmp(doc, ids);
    var target = doc.fullName ? doc.fullName : File.saveDialog('간판다로 보낼 .ai 저장', 'Illustrator:*.ai');
    if (!target) { alert('저장하지 않았습니다.'); return; }
    doc.saveAs(target, pdfOptions());
    // 구성 요소 하위 레이어 → 묶음 (.ganpanda)
    var items = [];
    for (i = 0; i < doc.layers.length; i++) {
      var L = doc.layers[i];
      if (!idOf(L.name) || !L.layers) continue;
      for (j = 0; j < L.layers.length; j++) {
        var S = L.layers[j], pr = partOf(S.name);
        if (!pr || !S.pageItems.length) continue;
        var r = artboardOf(doc, pr.sign);
        if (!r) continue;
        var svg = String(S.name).indexOf('(입체)') >= 0;
        try { items.push('{"sign":' + q(pr.sign) + ',"part":' + q(pr.part) + ',"kind":"' + (svg ? 'svg' : 'png') + '","data":"' + exportLayer(S, r, svg) + '"}'); } catch (e) {}
      }
    }
    try { doc.activate(); } catch (e) {}
    var bundlePath = String(target.fsName).replace(/\.ai$/i, '') + '.ganpanda';
    if (items.length) {
      var bf = new File(bundlePath);
      bf.encoding = 'UTF-8'; bf.open('w'); bf.write('{"format":"ganpanda-illustrator-bundle","version":1,"items":[' + items.join(',') + ']}'); bf.close();
    }
    alert('간판다로 보낼 준비가 되었습니다 (대지 ' + n + '개' + (items.length ? ', 구성 요소 디자인 ' + items.length + '개' : '') + ').\n' +
      (items.length ? bundlePath.replace(/^.*[\/\\]/, '') + ' (.ganpanda) 를 간판다 디자인 탭 [＋ 일러스트·SVG 올리기]로 올리면 구성 요소마다 자동으로 들어갑니다(채널·스카시는 입체).\n' : '') +
      '.ai 를 올리면 대지 전체가 사인물 바탕 디자인으로 연결됩니다.');
  }

  // ---------- 대지 만들기 ----------
  function build(data) {
    if (!data || !data.cards || !data.cards.length) { alert('간판다 데이터에 사인물 카드가 없습니다. 간판다 견적 탭에서 [일러스트]로 다시 받아 주세요.'); return; }
    var k = data.scale * PT;
    var W = Math.max(1, data.width * k), H = Math.max(1, data.height * k);
    var doc = app.documents.add(DocumentColorSpace.RGB, W, H);
    try { app.coordinateSystem = CoordinateSystem.DOCUMENTCOORDINATESYSTEM; } catch (e) {}
    var photo = doc.layers[0]; // 맨 아래 — 사인물 레이어는 그 위에 쌓인다
    photo.name = '간판다 사진';
    var ids = [], i, j;
    for (i = 0; i < data.cards.length; i++) {
      var c = data.cards[i];
      var left = c.x * k, top = -c.y * k, w = c.w * k, h = c.h * k;
      var ab = doc.artboards.add([left, top, left + w, top - h]);
      ab.name = c.name + ' #' + c.id;
      ids.push(c.id);
      if (c.face) place(photo, c.face, left, top, w, h);
      // 사인물 레이어 > 바탕(인쇄) + 구성 요소 하위 레이어 (나중에 만든 것이 위 — 바탕이 맨 아래)
      var signLayer = doc.layers.add();
      signLayer.name = c.name + ' #' + c.id;
      var design = signLayer.layers.add();
      design.name = '바탕 (인쇄) #' + c.id + ':frame';
      if (c.parts) for (j = 0; j < c.parts.length; j++) { var pl = signLayer.layers.add(); pl.name = c.parts[j].label + ' #' + c.id + ':' + c.parts[j].id; }
      if (c.design && c.design.svg) {
        // 벡터 원본: 페이지 전체를 그룹으로 들여와 잘라낸 영역이 대지에 맞게 키우고 대지 사각형으로 클리핑
        try {
          var g = design.groupItems.createFromFile(textFile(c.design.svg, 'svg'));
          var cr = c.design.crop || { x: 0, y: 0, w: 1, h: 1 };
          g.width = w / cr.w; g.height = h / cr.h;
          g.position = [left - cr.x * g.width, top + cr.y * g.height];
          var clip = design.groupItems.add();
          var rect = design.pathItems.rectangle(top, left, w, h);
          g.move(clip, ElementPlacement.PLACEATEND);
          rect.move(clip, ElementPlacement.PLACEATBEGINNING);
          clip.clipped = true;
        } catch (e) {}
      } else if (c.design && c.design.png) place(design, c.design.png, left, top, w, h);
    }
    if (doc.artboards.length > data.cards.length) doc.artboards.remove(0); // 문서를 만들 때 생긴 처음 대지
    photo.locked = true;
    writeXmp(doc, ids);
    var f = File.saveDialog('간판다 대지 저장 (' + data.project + ')', 'Illustrator:*.ai');
    if (f) doc.saveAs(f, pdfOptions());
    alert('사인물 ' + data.cards.length + '개를 대지로 만들었습니다' + (data.scale !== 1 ? ' (축척 1:' + Math.round(1 / data.scale) + ')' : '') + '.\n디자인을 마친 뒤 이 스크립트를 다시 실행하면 [간판다로 보내기]가 됩니다.');
  }

  // 열린 문서에 간판다 대지(#id)가 있으면 보내기, 아니면 대지 만들기
  var active = app.documents.length ? app.activeDocument : null;
  if (active) {
    var has = false, j;
    for (j = 0; j < active.artboards.length; j++) if (idOf(active.artboards[j].name)) { has = true; break; }
    if (has && confirm('지금 문서를 간판다로 보낼까요?\n대지 이름(#사인물)으로 짝을 적어 PDF 호환 .ai 로 저장합니다.\n[아니요]를 누르면 간판다 데이터로 새 대지 문서를 만듭니다.')) { sendBack(active); return; }
  }
  build(DATA);
})();
