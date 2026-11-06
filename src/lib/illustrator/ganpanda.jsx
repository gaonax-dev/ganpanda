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
  function textFile(text, ext) {
    var f = new File(Folder.temp.fsName + '/ganpanda-' + (tmpCount++) + '.' + ext);
    f.encoding = 'UTF-8';
    f.open('w'); f.write(text); f.close();
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
      (items.length ? bundlePath.replace(/^.*[\/\\]/, '') + ' (.ganpanda) 를 간판다 디자인 탭 [⇄ 디자인 싱크] › 일러스트레이터 › 받기로 올리고 사진보드에서 확인 뒤 [확정]하면 구성 요소마다 들어갑니다(채널·스카시는 입체).\n' : '') +
      '.ai 를 올리면 대지 전체가 사인물 바탕 디자인으로 연결됩니다.');
  }

  // ---------- 대지 만들기 ----------
  function build(data) {
    if (!data || !data.cards || !data.cards.length) { alert('간판다 데이터에 사인물 카드가 없습니다. 간판다 견적 탭에서 [일러스트]로 다시 받아 주세요.'); return; }
    var k = data.scale * PT;
    var W = Math.max(1, data.width * k), H = Math.max(1, data.height * k);
    var doc = app.documents.add(DocumentColorSpace.RGB, W, H);
    try { app.coordinateSystem = CoordinateSystem.DOCUMENTCOORDINATESYSTEM; } catch (e) {}
    // 카드 사진(참고 레이어)은 물어본다 — 사진을 풀고 묻는 것이 가장 오래 걸린다 (2026-11-05 "일러스트에서 .jsx를 가져오는데 많은 시간이 걸린다")
    var hasFace = false, fi;
    for (fi = 0; fi < data.cards.length; fi++) if (data.cards[fi].face && isData(data.cards[fi].face)) { hasFace = true; break; } // 파일 연결이면 빠르니 묻지 않는다
    var withPhotos = hasFace && confirm('카드 사진을 참고 레이어(간판다 사진)로 넣을까요?\n사진이 많으면 시간이 걸립니다. [아니요]를 누르면 대지·레이어만 빠르게 만듭니다.');
    var photo = doc.layers[0]; // 맨 아래 — 사인물 레이어는 그 위에 쌓인다
    photo.name = '간판다 사진';
    var ids = [], i, j;
    for (i = 0; i < data.cards.length; i++) {
      var c = data.cards[i];
      var left = c.x * k, top = -c.y * k, w = c.w * k, h = c.h * k;
      var ab = doc.artboards.add([left, top, left + w, top - h]);
      ab.name = c.name + ' #' + c.id;
      ids.push(c.id);
      if (c.face && (withPhotos || !isData(c.face))) place(photo, c.face, left, top, w, h);
      // 사인물 레이어 > 바탕(인쇄) + 구성 요소 하위 레이어 (나중에 만든 것이 위 — 바탕이 맨 아래)
      var signLayer = doc.layers.add();
      signLayer.name = c.name + ' #' + c.id;
      var design = signLayer.layers.add();
      design.name = '바탕 (인쇄) #' + c.id + ':frame';
      if (c.parts) for (j = 0; j < c.parts.length; j++) { var pl = signLayer.layers.add(); pl.name = c.parts[j].label + ' #' + c.id + ':' + c.parts[j].id; }
      var svgSrc = c.design ? (c.design.svgFile ? refFile(c.design.svgFile) : c.design.svg ? textFile(c.design.svg, 'svg') : null) : null;
      if (svgSrc) {
        // 벡터 원본: 페이지 전체를 그룹으로 들여와 잘라낸 영역이 대지에 맞게 키우고 대지 사각형으로 클리핑
        try {
          var g = design.groupItems.createFromFile(svgSrc);
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
    alert('사인물 ' + data.cards.length + '개를 대지로 만들었습니다' + (data.scale !== 1 ? ' (축척 1:' + Math.round(1 / data.scale) + ')' : '') + '.\n디자인을 마친 뒤 이 스크립트를 다시 실행하면 [간판다로 보내기]가 됩니다.' +
      (missing ? '\n\n그림 ' + missing + '개를 찾지 못했습니다 — 간판다에서 받은 zip 을 풀고 그 폴더(images 폴더가 있는 곳)를 써 주세요.' : ''));
  }

  // 열린 문서에 간판다 대지(#id)가 있으면 보내기, 아니면 대지 만들기
  var active = app.documents.length ? app.activeDocument : null;
  if (active) {
    var has = false, j;
    for (j = 0; j < active.artboards.length; j++) if (idOf(active.artboards[j].name)) { has = true; break; }
    if (has && confirm('지금 문서를 간판다로 보낼까요?\n대지 이름(#사인물)으로 짝을 적어 PDF 호환 .ai 로 저장합니다.\n[아니요]를 누르면 간판다 데이터로 새 대지 문서를 만듭니다.')) { sendBack(active); return; }
  }
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
