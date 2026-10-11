// =============================================================
// 出力まわり：仕上がり（A4ページ）の表示、Word出力、PDF出力
// 見本：見本_マニュアル雛形.docx / build_manual.js をもとにしています
// =============================================================
window.ManualOutput = (function () {
  const C = window.APP_CONFIG;
  const HEX = { BLACK: "1A1A1A", YELLOW: "F5C542", GRAY: "E5E5E5", CREAM: "FDF3D0", WHITE: "FFFFFF", MEDGRAY: "B0B0B0" };

  // 写真を入れる枠の大きさ（px）。Wordと画面・PDFで同じ値を使う
  const IMG_MAX_W = 180, IMG_MAX_H = 140;
  // A4（96dpi）と余白
  const PAGE_W = 794, PAGE_H = 1123, PAGE_PAD = 57;
  const CONTENT_H = PAGE_H - PAGE_PAD * 2;

  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  // 改行ごとに1項目。行頭の「・」「-」などは取り除く（出力時に「・」を付けるため）
  const lines = (s) => String(s || "").split(/\r?\n/).map((t) => t.trim()).filter(Boolean).map((t) => t.replace(/^[・\-－•●○\*]\s*/, ""));

  function fit(w, h, mw = IMG_MAX_W, mh = IMG_MAX_H) {
    if (!w || !h) return { w: mw, h: mh };
    const s = Math.min(mw / w, mh / h);
    return { w: Math.round(w * s), h: Math.round(h * s) };
  }

  function norm(m) {
    const steps = m.steps.map((s, i) => ({
      n: i + 1,
      name: (s.name || "").trim(),
      heading: (s.heading || "").trim() || (s.name || "").trim(),
      proc: lines(s.procedure),
      caution: lines(s.caution),
      minutes: String(s.minutes ?? "").trim(),
      photo: s.photo || null,
      pw: s.photoW, ph: s.photoH,
    }));
    const back = Math.min(Math.max(1, Number(m.check.backTo) || 1), Math.max(1, steps.length));
    return {
      company: C.company,
      office: m.office || "",
      title: (m.title || "").trim(),
      info: [["項目名", m.itemName], ["作成者", m.author], ["確認者（1次）", m.checker1], ["確認者（2次）", m.checker2]].map(([l, v]) => [l, (v || "").trim()]),
      points: [lines(m.point1), lines(m.point2), lines(m.point3)],
      steps,
      check: { use: m.check.use !== false, text: (m.check.text || "").trim(), back },
    };
  }

  // ---------- 画面・PDF用（HTML） ----------
  function pointHTML(items) {
    if (!items.length) return null;
    return `<div class="d-point"><div class="d-point-ttl">✔ Point</div>${items.map((t) => `<div class="d-li">・${esc(t)}</div>`).join("")}</div>`;
  }
  const headingHTML = (n, t) => `<div class="d-h"><div class="d-h-n">${n}</div><div class="d-h-t">${esc(t)}</div></div>`;
  const arrow = (label) => `<div class="d-arrow">▼${label ? `<span>${label}</span>` : ""}</div>`;

  function cardHTML(s) {
    let img;
    if (s.photo) {
      const f = fit(s.pw, s.ph);
      img = `<img src="${s.photo}" width="${f.w}" height="${f.h}" style="width:${f.w}px;height:${f.h}px" alt="">`;
    } else {
      img = `<div class="d-noimg">画像を挿入<br>してください</div>`;
    }
    let body = `<div class="d-row"><b>項目：</b>${esc(s.heading)}</div>`;
    if (s.proc.length) body += `<div class="d-lbl">作業手順：</div>${s.proc.map((t) => `<div class="d-li">・${esc(t)}</div>`).join("")}`;
    if (s.caution.length) body += `<div class="d-lbl d-lbl2">注意点・留意事項：</div>${s.caution.map((t) => `<div class="d-li">・${esc(t)}</div>`).join("")}`;
    if (s.minutes) body += `<div class="d-meyasu">【目安】 ${esc(s.minutes)}分</div>`;
    return `<div class="d-card"><div class="d-card-n">${s.n}</div><div class="d-card-img">${img}</div><div class="d-card-body">${body}</div></div>`;
  }

  function blocks(d) {
    const b = [];
    const add = (html, opt = {}) => html && b.push({ html, gap: opt.gap ?? 14, breakBefore: !!opt.breakBefore });
    add(`<div class="d-pill">MANUAL TEMPLATE</div>
      <div class="d-company">${esc(d.company)}</div>
      <div class="d-office">事業所：${esc(d.office)}</div>
      <div class="d-title">【 ${esc(d.title) || "　".repeat(18)} 】</div>`, { gap: 26 });
    add(headingHTML(1, "管理項目"), { gap: 14 });
    add(`<table class="d-info">${d.info.map(([l, v]) => `<tr><td class="d-info-l">${l}</td><td>${esc(v)}</td></tr>`).join("")}</table>`, { gap: 22 });
    add(pointHTML(d.points[0]));

    add(headingHTML(2, "ワークフロー（全体の流れ）"), { breakBefore: true, gap: 14 });
    add(`<div class="d-flow"><div class="d-end">開 始</div></div>`, { gap: 0 });
    d.steps.forEach((s) => add(`<div class="d-flow">${arrow()}<div class="d-step"><div class="d-step-n">${s.n}</div><div class="d-step-t">${esc(s.name)}</div></div></div>`, { gap: 0 }));
    if (d.check.use) {
      add(`<div class="d-flow">${arrow()}<div class="d-check"><div><b class="d-check-ttl">確認　OK？</b>${d.check.text ? `<span class="d-check-txt">　${esc(d.check.text)}</span>` : ""}</div>
        <div class="d-check-sub">NO → STEP（${d.check.back}）へ戻る　／　YES → 次へ（終了）</div></div></div>`, { gap: 0 });
      add(`<div class="d-flow">${arrow("YES")}<div class="d-end">終 了</div></div>`, { gap: 22 });
    } else {
      add(`<div class="d-flow">${arrow()}<div class="d-end">終 了</div></div>`, { gap: 22 });
    }
    add(pointHTML(d.points[1]));

    add(headingHTML(3, "手順の詳細"), { breakBefore: true, gap: 18 });
    d.steps.forEach((s) => add(cardHTML(s), { gap: 18 }));
    add(pointHTML(d.points[2]));
    return b;
  }

  // ブロックを測って、A4ページに順番に詰めていく
  function buildPages(m, host) {
    const d = norm(m);
    host.innerHTML = "";
    const measure = document.createElement("div");
    measure.className = "d-page";
    measure.innerHTML = `<div class="d-content"></div>`;
    host.appendChild(measure);
    const inner = measure.firstChild;
    const els = blocks(d).map((bl) => {
      const el = document.createElement("div");
      el.className = "d-block";
      el.style.paddingBottom = bl.gap + "px";
      el.innerHTML = bl.html;
      inner.appendChild(el);
      return { el, h: el.offsetHeight, breakBefore: bl.breakBefore };
    });
    host.innerHTML = "";
    const pages = [];
    let cur = null, used = 0;
    const newPage = () => {
      const p = document.createElement("div");
      p.className = "d-page";
      p.innerHTML = `<div class="d-content"></div>`;
      host.appendChild(p);
      pages.push(p);
      cur = p.firstChild; used = 0;
    };
    els.forEach((x) => {
      if (!cur || (x.breakBefore && used > 0) || (used > 0 && used + x.h > CONTENT_H)) newPage();
      cur.appendChild(x.el);
      used += x.h;
    });
    return pages;
  }

  // ---------- Word（.docx） ----------
  function dataUrlToBytes(u) {
    const bin = atob(u.split(",")[1]);
    const a = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i);
    return a;
  }

  async function toDocxBlob(m) {
    const d = norm(m);
    const {
      Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
      WidthType, BorderStyle, ShadingType, AlignmentType, ImageRun, PageBreak, VerticalAlign,
    } = window.docx;
    const { BLACK, YELLOW, GRAY, CREAM, WHITE, MEDGRAY } = HEX;
    const FONT = "Yu Gothic";
    const PW = 11906, PH = 16838, MARGIN = 850, CW = PW - MARGIN * 2;

    const line = (color = BLACK, size = 6) => ({ style: BorderStyle.SINGLE, size, color });
    const none = () => ({ style: BorderStyle.NONE, size: 0, color: WHITE });
    const ALL = { top: line(), bottom: line(), left: line(), right: line() };
    const NONE = { top: none(), bottom: none(), left: none(), right: none() };
    const shade = (fill) => ({ type: ShadingType.CLEAR, color: "auto", fill });
    const run = (text, o = {}) => new TextRun({ text, font: FONT, size: 19, color: BLACK, ...o });
    const spacer = (after = 150) => new Paragraph({ children: [], spacing: { after } });
    const pageBreak = () => new Paragraph({ children: [new PageBreak()] });
    const bullet = (t, after = 30) => new Paragraph({ spacing: { after }, children: [run("・" + t)] });

    function sectionHeading(num, title) {
      return new Table({
        width: { size: CW, type: WidthType.DXA }, columnWidths: [700, CW - 700],
        rows: [new TableRow({ children: [
          new TableCell({ width: { size: 700, type: WidthType.DXA }, borders: NONE, verticalAlign: VerticalAlign.CENTER, shading: shade(BLACK),
            children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [run(String(num), { bold: true, color: WHITE, size: 28 })] })] }),
          new TableCell({ width: { size: CW - 700, type: WidthType.DXA }, borders: NONE, verticalAlign: VerticalAlign.CENTER, shading: shade(GRAY), margins: { left: 200, top: 80, bottom: 80 },
            children: [new Paragraph({ children: [run(title, { bold: true, size: 26 })] })] }),
        ] })],
      });
    }

    function infoTable() {
      const lw = 1900, vw = CW - lw;
      return new Table({
        width: { size: CW, type: WidthType.DXA }, columnWidths: [lw, vw],
        rows: d.info.map(([l, v]) => new TableRow({ children: [
          new TableCell({ width: { size: lw, type: WidthType.DXA }, borders: ALL, shading: shade(CREAM), verticalAlign: VerticalAlign.CENTER, margins: { left: 100, right: 100, top: 60, bottom: 60 },
            children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [run(l, { bold: true })] })] }),
          new TableCell({ width: { size: vw, type: WidthType.DXA }, borders: ALL, verticalAlign: VerticalAlign.CENTER, margins: { left: 150, right: 100, top: 60, bottom: 60 },
            children: [new Paragraph({ children: [run(v)] })] }),
        ] })),
      });
    }

    function pointBox(items) {
      const y = line(YELLOW, 16);
      return new Table({
        width: { size: CW, type: WidthType.DXA }, columnWidths: [CW],
        rows: [new TableRow({ cantSplit: true, children: [new TableCell({
          width: { size: CW, type: WidthType.DXA }, borders: { top: y, bottom: y, left: y, right: y },
          margins: { left: 200, right: 200, top: 150, bottom: 150 },
          children: [
            new Paragraph({ spacing: { after: 80 }, children: [run("✔ Point", { bold: true, size: 20 })] }),
            ...items.map((t) => bullet(t)),
          ],
        })] })],
      });
    }

    const FLOW_W = 6200, BADGE_W = 800;
    const thick = () => ({ top: line(BLACK, 12), bottom: line(BLACK, 12), left: line(BLACK, 12), right: line(BLACK, 12) });
    function flowEnd(text) {
      return new Table({
        alignment: AlignmentType.CENTER, width: { size: 2200, type: WidthType.DXA }, columnWidths: [2200],
        rows: [new TableRow({ children: [new TableCell({ width: { size: 2200, type: WidthType.DXA }, borders: thick(), shading: shade(BLACK), margins: { top: 90, bottom: 90 },
          children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [run(text, { bold: true, color: WHITE, size: 22 })] })] })] })],
      });
    }
    function flowArrow(label) {
      const kids = [run("▼", { bold: true, size: 22 })];
      if (label) kids.push(run(`  ${label}`, { bold: true, size: 18 }));
      return new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 20, after: 20 }, keepNext: true, children: kids });
    }
    function flowStep(s) {
      return new Table({
        alignment: AlignmentType.CENTER, width: { size: FLOW_W, type: WidthType.DXA }, columnWidths: [BADGE_W, FLOW_W - BADGE_W],
        rows: [new TableRow({ cantSplit: true, children: [
          new TableCell({ width: { size: BADGE_W, type: WidthType.DXA }, verticalAlign: VerticalAlign.CENTER,
            borders: { top: line(BLACK, 12), bottom: line(BLACK, 12), left: line(BLACK, 12), right: none() }, shading: shade(BLACK),
            children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [run(String(s.n), { bold: true, color: WHITE, size: 28 })] })] }),
          new TableCell({ width: { size: FLOW_W - BADGE_W, type: WidthType.DXA }, verticalAlign: VerticalAlign.CENTER,
            borders: { top: line(BLACK, 12), bottom: line(BLACK, 12), left: none(), right: line(BLACK, 12) }, shading: shade(CREAM), margins: { left: 200, right: 150, top: 110, bottom: 110 },
            children: [new Paragraph({ children: [run(s.name)] })] }),
        ] })],
      });
    }
    function flowCheck() {
      const first = [run("確認　OK？", { bold: true, size: 22 })];
      if (d.check.text) first.push(run("　" + d.check.text, { size: 19 }));
      return new Table({
        alignment: AlignmentType.CENTER, width: { size: FLOW_W, type: WidthType.DXA }, columnWidths: [FLOW_W],
        rows: [new TableRow({ cantSplit: true, children: [new TableCell({ width: { size: FLOW_W, type: WidthType.DXA }, borders: thick(), shading: shade(YELLOW), margins: { top: 100, bottom: 100, left: 150, right: 150 },
          children: [
            new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 40 }, children: first }),
            new Paragraph({ alignment: AlignmentType.CENTER, children: [run(`NO → STEP（${d.check.back}）へ戻る　／　YES → 次へ（終了）`, { bold: true, size: 18 })] }),
          ] })] })],
      });
    }

    function stepCard(s) {
      const imgW = 3000, bodyW = CW - 700 - imgW;
      let imgChildren;
      if (s.photo) {
        const f = fit(s.pw, s.ph);
        imgChildren = [new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 60, after: 60 },
          children: [new ImageRun({ type: "jpg", data: dataUrlToBytes(s.photo), transformation: { width: f.w, height: f.h } })] })];
      } else {
        imgChildren = [
          new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 400, after: 200 }, children: [run("画像を挿入", { bold: true, color: MEDGRAY, size: 20 })] }),
          new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 400 }, children: [run("してください", { bold: true, color: MEDGRAY, size: 20 })] }),
        ];
      }
      const body = [new Paragraph({ spacing: { after: 100 }, children: [run("項目：", { bold: true }), run(s.heading)] })];
      if (s.proc.length) {
        body.push(new Paragraph({ spacing: { after: 60 }, children: [run("作業手順：", { bold: true })] }));
        s.proc.forEach((t) => body.push(bullet(t)));
      }
      if (s.caution.length) {
        body.push(new Paragraph({ spacing: { before: 100, after: 60 }, children: [run("注意点・留意事項：", { bold: true })] }));
        s.caution.forEach((t) => body.push(bullet(t)));
      }
      if (s.minutes) body.push(new Paragraph({ spacing: { before: 140 }, shading: shade(YELLOW), children: [run(`  【目安】 ${s.minutes}分  `, { bold: true, size: 18 })] }));
      return new Table({
        width: { size: CW, type: WidthType.DXA }, columnWidths: [700, imgW, bodyW],
        rows: [new TableRow({ cantSplit: true, children: [
          new TableCell({ width: { size: 700, type: WidthType.DXA }, borders: { top: line(), bottom: line(), left: line(), right: none() }, shading: shade(BLACK), verticalAlign: VerticalAlign.CENTER,
            children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [run(String(s.n), { bold: true, color: WHITE, size: 30 })] })] }),
          new TableCell({ width: { size: imgW, type: WidthType.DXA }, borders: { top: line(), bottom: line(), left: none(), right: line() }, shading: shade(GRAY), verticalAlign: VerticalAlign.CENTER,
            children: imgChildren }),
          new TableCell({ width: { size: bodyW, type: WidthType.DXA }, borders: { top: line(), bottom: line(), left: none(), right: line() }, margins: { left: 200, right: 150, top: 150, bottom: 150 },
            children: body }),
        ] })],
      });
    }

    const c = [];
    c.push(new Paragraph({ children: [run("  MANUAL TEMPLATE  ", { bold: true, size: 18 })], shading: shade(YELLOW), spacing: { after: 120 } }));
    c.push(new Paragraph({ spacing: { after: 40 }, children: [run(d.company, { bold: true, size: 22 })] }));
    c.push(new Paragraph({ spacing: { after: 80 }, children: [run("事業所：", { bold: true, size: 22 }), run(d.office, { bold: true, size: 22 })] }));
    c.push(new Paragraph({ spacing: { after: 300 }, children: [run(`【 ${d.title || "　".repeat(18)} 】`, { bold: true, size: 36 })] }));

    c.push(sectionHeading(1, "管理項目"));
    c.push(spacer());
    c.push(infoTable());
    if (d.points[0].length) { c.push(spacer(250)); c.push(pointBox(d.points[0])); }
    c.push(pageBreak());

    c.push(sectionHeading(2, "ワークフロー（全体の流れ）"));
    c.push(spacer());
    c.push(flowEnd("開 始"));
    d.steps.forEach((s) => { c.push(flowArrow()); c.push(flowStep(s)); });
    c.push(flowArrow());
    if (d.check.use) { c.push(flowCheck()); c.push(flowArrow("YES")); }
    c.push(flowEnd("終 了"));
    if (d.points[1].length) { c.push(spacer(200)); c.push(pointBox(d.points[1])); }
    c.push(pageBreak());

    c.push(sectionHeading(3, "手順の詳細"));
    c.push(spacer(200));
    d.steps.forEach((s) => { c.push(stepCard(s)); c.push(spacer(200)); });
    if (d.points[2].length) c.push(pointBox(d.points[2]));
    c.push(spacer(0));

    const doc = new Document({
      creator: d.info[1][1] || C.company,
      title: d.title || "手順書",
      styles: { default: { document: { run: { font: FONT, size: 20, color: BLACK } } } },
      sections: [{ properties: { page: { size: { width: PW, height: PH }, margin: { top: MARGIN, bottom: MARGIN, left: MARGIN, right: MARGIN } } }, children: c }],
    });
    return Packer.toBlob(doc);
  }

  // ---------- PDF ----------
  async function toPdfBlob(m, host) {
    const pages = buildPages(m, host);
    await Promise.all([...host.querySelectorAll("img")].map((i) => (i.decode ? i.decode().catch(() => {}) : null)));
    if (document.fonts && document.fonts.ready) await document.fonts.ready;
    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait", compress: true });
    for (let i = 0; i < pages.length; i++) {
      const canvas = await window.html2canvas(pages[i], { scale: 2, backgroundColor: "#ffffff", logging: false, scrollX: 0, scrollY: 0, windowWidth: PAGE_W + 40 });
      if (i) pdf.addPage();
      pdf.addImage(canvas.toDataURL("image/jpeg", 0.92), "JPEG", 0, 0, 210, 297);
    }
    host.innerHTML = "";
    return pdf.output("blob");
  }

  function fileBase(m) {
    const t = (m.title || "").trim() || "無題";
    const dt = new Date();
    const ymd = `${dt.getFullYear()}${String(dt.getMonth() + 1).padStart(2, "0")}${String(dt.getDate()).padStart(2, "0")}`;
    return `手順書_${t}_${ymd}`.replace(/[\\/:*?"<>|\s]+/g, "_").slice(0, 80);
  }

  return { buildPages, toDocxBlob, toPdfBlob, fileBase, PAGE_W, PAGE_H };
})();
