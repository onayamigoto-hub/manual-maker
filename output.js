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
      info: [["項目名", m.itemName], ["目的（利用者）", m.purposeUser], ["目的（スタッフ）", m.purposeStaff], ["作成者", m.author], ["確認者（1次）", m.checker1], ["確認者（2次）", m.checker2]].map(([l, v]) => [l, (v || "").trim()]),
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

  // ---------- フローチャート（開始・終了＝丸／手順＝四角／確認（分岐）＝ひし形） ----------
  const FF = "Yu Gothic, YuGothic, Hiragino Sans, Hiragino Kaku Gothic ProN, Noto Sans JP, Meiryo, sans-serif";
  const FLOW_MAX_H = 880;
  let mctx;
  const textW = (t, font) => { mctx = mctx || document.createElement("canvas").getContext("2d"); mctx.font = font; return mctx.measureText(t).width; };
  function wrap(text, font, maxW) {
    const out = [];
    let line = "";
    for (const ch of [...String(text || "")]) {
      if (line && textW(line + ch, font) > maxW) { out.push(line); line = ch; } else line += ch;
    }
    if (line) out.push(line);
    return out;
  }
  function flowSVG(d) {
    const { BLACK, YELLOW, CREAM } = HEX;
    const W = 680, CX = 350, R = 32, GAP = 30;
    const BOXW = 380, BX = CX - BOXW / 2, BADGE = 44, LOOPX = 70;
    const fStep = `500 13.5px ${FF}`, fSmall = `500 12px ${FF}`;
    const o = [];
    const t = (x, y, str, size, opt = {}) => o.push(`<text x="${x}" y="${y}" font-family="${FF}" font-size="${size}" font-weight="${opt.w || 500}" fill="#${opt.c || BLACK}" text-anchor="${opt.a || "middle"}" dominant-baseline="central">${esc(str)}</text>`);
    const head = (x, y, dir) => {
      const p = dir === "down" ? `${x - 6},${y - 10} ${x + 6},${y - 10} ${x},${y}` : `${x - 10},${y - 6} ${x - 10},${y + 6} ${x},${y}`;
      o.push(`<polygon points="${p}" fill="#${BLACK}"/>`);
    };
    const down = (y1, y2) => { o.push(`<line x1="${CX}" y1="${y1}" x2="${CX}" y2="${y2 - 8}" stroke="#${BLACK}" stroke-width="2"/>`); head(CX, y2, "down"); };
    const label = (x, y, str) => {
      const w = textW(str, `700 11px ${FF}`) + 12;
      o.push(`<rect x="${x - w / 2}" y="${y - 9}" width="${w}" height="18" rx="3" fill="#fff" stroke="#${BLACK}" stroke-width="1.5"/>`);
      t(x, y + 0.5, str, 11, { w: 700 });
    };
    const circle = (cy, str) => { o.push(`<circle cx="${CX}" cy="${cy}" r="${R}" fill="#${BLACK}"/>`); t(CX, cy, str, 14, { w: 700, c: "FFFFFF" }); };

    let y = 2;
    circle(y + R, "開始");
    y += R * 2;
    const mids = [];
    d.steps.forEach((s) => {
      down(y, y + GAP); y += GAP;
      const lines = wrap(s.name, fStep, BOXW - BADGE - 28);
      const h = Math.max(48, lines.length * 20 + 18);
      o.push(`<rect x="${BX}" y="${y}" width="${BOXW}" height="${h}" rx="6" fill="#${CREAM}" stroke="#${BLACK}" stroke-width="2"/>`);
      o.push(`<path d="M${BX + 6},${y} H${BX + BADGE} V${y + h} H${BX + 6} A6,6 0 0 1 ${BX},${y + h - 6} V${y + 6} A6,6 0 0 1 ${BX + 6},${y} Z" fill="#${BLACK}"/>`);
      t(BX + BADGE / 2, y + h / 2, String(s.n), 18, { w: 700, c: "FFFFFF" });
      lines.forEach((ln, k) => t(BX + BADGE + 14, y + h / 2 + (k - (lines.length - 1) / 2) * 20, ln, 13.5, { a: "start" }));
      mids.push(y + h / 2);
      y += h;
    });
    if (d.check.use) {
      down(y, y + GAP); y += GAP;
      const lines = wrap(d.check.text, fSmall, 150).slice(0, 6);
      const ch = 20 + lines.length * 16;
      const a = 130, b = Math.max(52, ch / 0.846 + 4), cy = y + b;
      o.push(`<polygon points="${CX},${y} ${CX + a},${cy} ${CX},${cy + b} ${CX - a},${cy}" fill="#${YELLOW}" stroke="#${BLACK}" stroke-width="2" stroke-linejoin="round"/>`);
      const top = cy - ch / 2;
      t(CX, top + 10, "確認 OK？", 14, { w: 700 });
      lines.forEach((ln, k) => t(CX, top + 20 + k * 16 + 8, ln, 12));
      // NO：左へ出て、戻り先のステップへ
      const ty = mids[d.check.back - 1] ?? mids[0];
      o.push(`<path d="M${CX - a},${cy} H${LOOPX} V${ty} H${BX - 8}" fill="none" stroke="#${BLACK}" stroke-width="2"/>`);
      head(BX, ty, "right");
      label((LOOPX + CX - a) / 2, cy, `NO → STEP ${d.check.back}`);
      y = cy + b;
      down(y, y + GAP + 6);
      label(CX + 30, y + (GAP + 6) / 2, "YES");
      y += GAP + 6;
    } else {
      down(y, y + GAP); y += GAP;
    }
    circle(y + R, "終了");
    y += R * 2 + 2;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${y}" viewBox="0 0 ${W} ${y}"><rect width="${W}" height="${y}" fill="#fff"/>${o.join("")}</svg>`;
    return { svg, w: W, h: y, url: "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg) };
  }
  function svgToPng(f, scale = 2.5) {
    return new Promise((res, rej) => {
      const img = new Image();
      img.onload = () => {
        const c = document.createElement("canvas");
        c.width = Math.round(f.w * scale); c.height = Math.round(f.h * scale);
        const x = c.getContext("2d");
        x.fillStyle = "#fff"; x.fillRect(0, 0, c.width, c.height);
        x.drawImage(img, 0, 0, c.width, c.height);
        c.toBlob((b) => b.arrayBuffer().then((ab) => res(new Uint8Array(ab))), "image/png");
      };
      img.onerror = rej;
      img.src = f.url;
    });
  }

  function blocks(d) {
    const b = [];
    const add = (html, opt = {}) => html && b.push({ html, gap: opt.gap ?? 14, breakBefore: !!opt.breakBefore });
    add(`<div class="d-pill">MANUAL TEMPLATE</div>
      <img class="d-logo" src="logo.png" alt="">
      <div class="d-company">${esc(d.company)}</div>
      <div class="d-office">事業所：${esc(d.office)}</div>
      <div class="d-title">【 ${esc(d.title) || "　".repeat(18)} 】</div>`, { gap: 26 });
    add(headingHTML(1, "管理項目"), { gap: 14 });
    add(`<table class="d-info">${d.info.map(([l, v]) => `<tr><td class="d-info-l">${l}</td><td>${esc(v).replace(/\n/g, "<br>")}</td></tr>`).join("")}</table>`, { gap: 22 });
    add(pointHTML(d.points[0]));

    add(headingHTML(2, "ワークフロー（全体の流れ）"), { breakBefore: true, gap: 14 });
    const f = flowSVG(d), k = Math.min(1, FLOW_MAX_H / f.h);
    add(`<div class="d-flowchart"><img src="${f.url}" alt="ワークフロー" width="${Math.round(f.w * k)}" height="${Math.round(f.h * k)}" style="width:${Math.round(f.w * k)}px;height:${Math.round(f.h * k)}px"></div>`, { gap: 22 });
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
      HorizontalPositionRelativeFrom, HorizontalPositionAlign, VerticalPositionRelativeFrom, TextWrappingType, TextWrappingSide,
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
      const lw = 2100, vw = CW - lw;
      return new Table({
        width: { size: CW, type: WidthType.DXA }, columnWidths: [lw, vw],
        rows: d.info.map(([l, v]) => new TableRow({ children: [
          new TableCell({ width: { size: lw, type: WidthType.DXA }, borders: ALL, shading: shade(CREAM), verticalAlign: VerticalAlign.CENTER, margins: { left: 100, right: 100, top: 60, bottom: 60 },
            children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [run(l, { bold: true })] })] }),
          new TableCell({ width: { size: vw, type: WidthType.DXA }, borders: ALL, verticalAlign: VerticalAlign.CENTER, margins: { left: 150, right: 100, top: 60, bottom: 60 },
            children: v.split(/\r?\n/).map((t) => new Paragraph({ children: [run(t)] })) }),
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
    const logoKids = [];
    try {
      const lb = new Uint8Array(await (await fetch("logo.png")).arrayBuffer());
      logoKids.push(new ImageRun({ type: "png", data: lb, transformation: { width: 64, height: 64 },
        floating: { horizontalPosition: { relative: HorizontalPositionRelativeFrom.MARGIN, align: HorizontalPositionAlign.RIGHT },
          verticalPosition: { relative: VerticalPositionRelativeFrom.PARAGRAPH, offset: 0 },
          wrap: { type: TextWrappingType.SQUARE, side: TextWrappingSide.LEFT }, margins: { left: 114300 } } }));
    } catch (e) { /* ロゴが読めないときは入れない */ }
    c.push(new Paragraph({ spacing: { after: 40 }, children: [...logoKids, run(d.company, { bold: true, size: 22 })] }));
    c.push(new Paragraph({ spacing: { after: 80 }, children: [run("事業所：", { bold: true, size: 22 }), run(d.office, { bold: true, size: 22 })] }));
    c.push(new Paragraph({ spacing: { after: 300 }, children: [run(`【 ${d.title || "　".repeat(18)} 】`, { bold: true, size: 36 })] }));

    c.push(sectionHeading(1, "管理項目"));
    c.push(spacer());
    c.push(infoTable());
    if (d.points[0].length) { c.push(spacer(250)); c.push(pointBox(d.points[0])); }
    c.push(pageBreak());

    c.push(sectionHeading(2, "ワークフロー（全体の流れ）"));
    c.push(spacer());
    {
      const f = flowSVG(d), png = await svgToPng(f);
      const k = Math.min(640 / f.w, FLOW_MAX_H / f.h);
      c.push(new Paragraph({ alignment: AlignmentType.CENTER, children: [new ImageRun({ type: "png", data: png, transformation: { width: Math.round(f.w * k), height: Math.round(f.h * k) } })] }));
    }
    if (d.points[1].length) { c.push(spacer(200)); c.push(pointBox(d.points[1])); }
    c.push(pageBreak());

    c.push(sectionHeading(3, "手順の詳細"));
    c.push(spacer(200));
    d.steps.forEach((s) => { c.push(stepCard(s)); c.push(spacer(200)); });
    if (d.points[2].length) c.push(pointBox(d.points[2]));
    c.push(spacer(0));

    const doc = new Document({
      creator: d.info[3][1] || C.company,
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
