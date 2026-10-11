// =============================================================
// 手順書づくりアプリ（入力画面）
// データはこの端末のブラウザの中（IndexedDB）に自動保存します
// =============================================================
(function () {
  const C = window.APP_CONFIG;
  const $app = document.getElementById("app");
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const isTouch = matchMedia("(pointer: coarse)").matches;
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

  // ---------- 保存（IndexedDB） ----------
  const DB = (() => {
    let p;
    const open = () => p || (p = new Promise((res, rej) => {
      const r = indexedDB.open("activemore-manual", 1);
      r.onupgradeneeded = () => r.result.createObjectStore("manuals", { keyPath: "id" });
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    }));
    const tx = async (mode, fn) => {
      const db = await open();
      return new Promise((res, rej) => {
        const t = db.transaction("manuals", mode);
        const req = fn(t.objectStore("manuals"));
        t.oncomplete = () => res(req && req.result);
        t.onerror = () => rej(t.error);
        t.onabort = () => rej(t.error);
      });
    };
    return {
      all: () => tx("readonly", (s) => s.getAll()),
      get: (id) => tx("readonly", (s) => s.get(id)),
      put: (m) => tx("readwrite", (s) => s.put(m)),
      del: (id) => tx("readwrite", (s) => s.delete(id)),
    };
  })();
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});

  // 前回の事業所・作成者（この端末だけの便利機能）
  const pref = {
    get() { try { return JSON.parse(localStorage.getItem("am-manual-pref") || "{}"); } catch (e) { return {}; } },
    set(v) { try { localStorage.setItem("am-manual-pref", JSON.stringify({ ...pref.get(), ...v })); } catch (e) {} },
  };

  const newStep = () => ({ id: uid(), name: "", heading: "", procedure: "", caution: "", minutes: "", photo: null, photoW: 0, photoH: 0 });
  function newManual() {
    const p = pref.get();
    return {
      id: uid(), createdAt: Date.now(), updatedAt: Date.now(),
      office: C.offices.includes(p.office) ? p.office : "", title: "",
      itemName: "", purposeUser: "", purposeStaff: "", author: p.author || "", checker1: "", checker2: "", point1: "",
      steps: [newStep(), newStep(), newStep()],
      check: { use: true, text: "", backTo: 1 },
      point2: "", point3: "",
    };
  }

  // ---------- 状態 ----------
  let cur = null;       // 入力中の手順書
  let page = 0;         // 0〜4
  let activePhoto = null; // 貼り付け先のステップ番号
  let saveTimer = null;

  const PAGES = [
    { short: "はじめに", title: "事業所とタイトル" },
    { short: "管理項目", title: "管理項目（目的・作成者など）" },
    { short: "全体の流れ", title: "全体の流れ（ワークフロー）" },
    { short: "各ステップ", title: "ステップごとのくわしい手順" },
    { short: "確認・出力", title: "仕上がりの確認と出力" },
  ];

  function toast(msg, ms = 2600) {
    const t = document.getElementById("toast");
    t.textContent = msg;
    t.classList.add("show");
    clearTimeout(t._h);
    t._h = setTimeout(() => t.classList.remove("show"), ms);
  }
  function busy(on, msg) {
    const b = document.getElementById("busy");
    b.hidden = !on;
    if (msg) document.getElementById("busyMsg").textContent = msg;
  }
  function setSaveState(txt) {
    const el = document.querySelector(".savestate");
    if (el) el.textContent = txt;
  }
  function scheduleSave() {
    if (!cur) return;
    setSaveState("保存しています…");
    clearTimeout(saveTimer);
    saveTimer = setTimeout(saveNow, 500);
  }
  async function saveNow() {
    clearTimeout(saveTimer);
    if (!cur) return;
    cur.updatedAt = Date.now();
    try {
      await DB.put(cur);
      setSaveState("✓ 自動で保存しました");
    } catch (e) {
      setSaveState("⚠ 保存できませんでした");
      toast("保存できませんでした。写真が多すぎる・端末の空きが少ない可能性があります。");
    }
  }

  // ---------- ファイルを渡す（ダウンロード） ----------
  function download(blob, name) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  }
  const loaded = {};
  function loadScript(src) {
    return loaded[src] || (loaded[src] = new Promise((res, rej) => {
      const s = document.createElement("script");
      s.src = src; s.onload = res;
      s.onerror = () => { delete loaded[src]; rej(new Error("load")); };
      document.head.appendChild(s);
    }));
  }

  // =============================================================
  // 一覧画面
  // =============================================================
  async function showHome() {
    await saveNow();
    cur = null;
    let list = [];
    try { list = await DB.all(); } catch (e) { toast("この端末では保存機能が使えないようです。"); }
    list.sort((a, b) => b.updatedAt - a.updatedAt);
    const fmt = (t) => { const d = new Date(t); return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()} ${d.getHours()}:${String(d.getMinutes()).padStart(2, "0")}`; };
    $app.innerHTML = `
      <section class="home">
        <div class="hero">
          <h1>手順書を、入力するだけでつくれます</h1>
          <ol class="flow-guide">
            ${PAGES.map((p, i) => `<li><span>${i + 1}</span>${p.short}</li>`).join("")}
          </ol>
          <button class="btn btn-yellow btn-xl" data-act="new">＋ 新しい手順書をつくる</button>
        </div>

        <h2 class="list-ttl">つくりかけ・つくった手順書 <small>${list.length}件</small></h2>
        ${list.length ? `<ul class="mlist">${list.map((m) => `
          <li class="mitem">
            <button class="mitem-main" data-act="open" data-id="${m.id}">
              <span class="mitem-title">${esc(m.title) || "（タイトル未入力）"}</span>
              <span class="mitem-meta">${esc(m.office) || "事業所 未選択"}｜ステップ ${m.steps.length}｜${fmt(m.updatedAt)}</span>
            </button>
            <div class="mitem-acts">
              <button class="btn btn-sm" data-act="open" data-id="${m.id}">続きを入力</button>
              <button class="btn btn-sm btn-ghost" data-act="dup" data-id="${m.id}">コピー</button>
              <button class="btn btn-sm btn-ghost" data-act="backup" data-id="${m.id}">ファイルに保存</button>
              <button class="btn btn-sm btn-ghost danger" data-act="del" data-id="${m.id}">削除</button>
            </div>
          </li>`).join("")}</ul>` : `<p class="empty">まだありません。上の黄色いボタンから始めましょう。</p>`}

        <div class="note">
          <b>保存について</b><br>
          入力した内容は、<b>この端末（スマホ・パソコン）の中</b>に自動で保存されます。別の端末で続きを入力したいときや、念のため控えを残したいときは「ファイルに保存」を押してください。そのファイルは下のボタンで読み込めます。
          <div class="note-acts">
            <label class="btn btn-sm">📂 保存したファイルを読み込む<input type="file" accept=".json,application/json" data-act="import" hidden></label>
          </div>
        </div>
      </section>`;
    window.scrollTo(0, 0);
  }

  async function openManual(id) {
    const m = await DB.get(id);
    if (!m) return toast("見つかりませんでした");
    cur = migrate(m);
    page = 0;
    renderEditor();
  }
  function migrate(m) {
    m.check = m.check || { use: true, text: "", backTo: 1 };
    m.purposeUser = m.purposeUser || "";
    m.purposeStaff = m.purposeStaff || "";
    m.steps = (m.steps && m.steps.length ? m.steps : [newStep()]).map((s) => ({ ...newStep(), ...s }));
    return m;
  }

  // =============================================================
  // 入力画面
  // =============================================================
  function renderEditor(keepScroll) {
    const y = window.scrollY;
    const P = [pageStart, pageInfo, pageFlow, pageDetail, pageOutput][page];
    $app.innerHTML = `
      <section class="editor">
        <div class="ed-top">
          <button class="link" data-act="home">← 一覧にもどる</button>
          <span class="savestate">✓ 自動で保存されます</span>
        </div>
        <nav class="tabs" aria-label="入力の順番">
          ${PAGES.map((p, i) => `<button class="tab ${i === page ? "on" : ""} ${i < page ? "done" : ""}" data-act="go" data-page="${i}"><span class="tab-n">${i + 1}</span><span class="tab-t">${p.short}</span></button>`).join("")}
        </nav>
        <div class="page">
          <h2 class="page-ttl"><span>${page + 1}</span>${PAGES[page].title}</h2>
          ${P()}
        </div>
        <div class="pager">
          ${page > 0 ? `<button class="btn btn-lg" data-act="prev">← もどる</button>` : `<span></span>`}
          ${page < 4 ? `<button class="btn btn-lg btn-black" data-act="next">${page === 3 ? "確認・出力へ →" : "次へ →"}</button>` : ""}
        </div>
      </section>`;
    if (keepScroll) window.scrollTo(0, y); else window.scrollTo(0, 0);
    if (page === 4) renderPreview();
    autoGrowAll();
  }

  const field = (label, key, opt = {}) => `
    <div class="field">
      <label for="f-${key}">${label}${opt.req ? ` <em class="req">必須</em>` : ""}</label>
      ${opt.hint ? `<p class="hint">${opt.hint}</p>` : ""}
      ${opt.area
        ? `<textarea id="f-${key}" data-f="${key}" rows="${opt.rows || 3}" placeholder="${esc(opt.ph || "")}">${esc(cur[key])}</textarea>`
        : `<input id="f-${key}" type="text" data-f="${key}" value="${esc(cur[key])}" placeholder="${esc(opt.ph || "")}" autocomplete="${opt.ac || "off"}">`}
    </div>`;

  const pointField = (key, where) => `
    <div class="point-in">
      <div class="point-in-ttl">✔ Point <small>（なくてもOK）</small></div>
      <p class="hint">${where}で<b>注意すること・前提になること</b>があれば書いてください。<br>1行に1つずつ書くと「・」付きで並びます。何も書かなければ、この枠は手順書に出ません。</p>
      <textarea data-f="${key}" rows="3" placeholder="例）利用者さんの体調を確認してから始める&#10;例）必要な物品は前日に準備しておく">${esc(cur[key])}</textarea>
    </div>`;

  function pageStart() {
    return `
      <div class="field">
        <label>法人名</label>
        <div class="fixed">${esc(C.company)}</div>
      </div>
      <div class="field">
        <label>事業所 <em class="req">必須</em></label>
        <p class="hint">あてはまる事業所を1つ選んでください。</p>
        <div class="choices">
          ${C.offices.map((o, i) => `<label class="choice"><input type="radio" name="office" value="${esc(o)}" data-f="office" ${cur.office === o ? "checked" : ""}><span>${esc(o)}</span></label>`).join("")}
        </div>
      </div>
      ${field("手順書のタイトル", "title", { req: true, hint: "どんな業務の手順書か、具体的にわかる名前にしましょう。", ph: "例）入浴介助の手順（一般浴）" })}`;
  }

  function pageInfo() {
    return `
      ${field("項目名", "itemName", { hint: "この手順書があつかう業務の名前です。", ph: "例）入浴介助の手順／記録の書き方" })}
      <div class="purpose">
        <div class="purpose-ttl">目的 <small>（なんのために、この手順で行うのか）</small></div>
        ${field("利用者さんにとっての目的", "purposeUser", { area: true, rows: 2, hint: "この手順で、利用者さんにどうなってほしいかを書きます。", ph: "例）清潔で気持ちよく過ごせる。安全に入浴できる。" })}
        ${field("スタッフにとっての目的", "purposeStaff", { area: true, rows: 2, hint: "この手順書があると、スタッフにとって何がよいかを書きます。", ph: "例）だれが担当しても、同じ手順・同じ質でケアできる。" })}
      </div>
      ${field("作成者（氏名）", "author", { req: true, ph: "例）山田 花子", ac: "name" })}
      ${field("確認者（1次）（氏名）", "checker1", { ph: "例）佐藤 太郎" })}
      ${field("確認者（2次）（氏名）", "checker2", { ph: "例）鈴木 一郎" })}
      ${pointField("point1", "この手順書全体")}`;
  }

  function pageFlow() {
    const n = cur.steps.length;
    return `
      <p class="lead">作業を始めから終わりまで、<b>順番に</b>ステップに分けて書きます。<br>ここで書いた作業名は、次の「各ステップ」の見出しにもなります。</p>
      <div class="wf">
        <div class="wf-end">開始</div>
        ${cur.steps.map((s, i) => `
          <div class="wf-arrow">▼</div>
          <div class="wf-step">
            <div class="wf-n">${i + 1}</div>
            <input type="text" data-sf="name" data-i="${i}" value="${esc(s.name)}" placeholder="ステップ${i + 1}の作業名（例：${["物品を準備する", "利用者さんに声をかける", "衣服を脱ぐ介助をする", "洗身・洗髪をする", "片付けと記録をする"][i % 5]}）" aria-label="ステップ${i + 1}の作業名">
            <div class="wf-tools">
              <button class="icon" data-act="up" data-i="${i}" ${i === 0 ? "disabled" : ""} aria-label="上へ移動" title="上へ">▲</button>
              <button class="icon" data-act="down" data-i="${i}" ${i === n - 1 ? "disabled" : ""} aria-label="下へ移動" title="下へ">▼</button>
              <button class="icon danger" data-act="rm" data-i="${i}" ${n === 1 ? "disabled" : ""} aria-label="このステップを消す" title="消す">✕</button>
            </div>
          </div>`).join("")}
        <button class="btn btn-add" data-act="add">＋ ステップを追加する</button>
        <div class="wf-arrow">▼</div>
        <div class="wf-check ${cur.check.use ? "" : "off"}">
          <label class="switch"><input type="checkbox" data-check="use" ${cur.check.use ? "checked" : ""}><span>最後に「確認 OK？」の枠を入れる</span></label>
          ${cur.check.use ? `
            <div class="field">
              <label for="f-check">確認すること</label>
              <input id="f-check" type="text" data-check="text" value="${esc(cur.check.text)}" placeholder="例）利用者さんの体調に変わりはないか">
            </div>
            <div class="field inline">
              <label for="f-back">NO（できていない）のときは</label>
              <div class="inline-row">
                <select id="f-back" data-check="backTo">
                  ${cur.steps.map((s, i) => `<option value="${i + 1}" ${Number(cur.check.backTo) === i + 1 ? "selected" : ""}>STEP ${i + 1}${s.name ? "（" + esc(s.name.slice(0, 14)) + "）" : ""}</option>`).join("")}
                </select>
                <span>へ戻る</span>
              </div>
              <p class="hint">YES（OK）のときは「終了」へ進みます。</p>
            </div>` : ""}
        </div>
        <div class="wf-arrow">▼</div>
        <div class="wf-end">終了</div>
      </div>
      ${pointField("point2", "全体の流れ")}`;
  }

  function photoBox(s, i) {
    if (s.photo) {
      return `
        <div class="photo has" data-photo="${i}" tabindex="0">
          <img src="${s.photo}" alt="ステップ${i + 1}の写真">
        </div>
        <div class="photo-acts">
          <label class="btn btn-sm">🔄 写真を変える<input type="file" accept="image/*" data-file="${i}" hidden></label>
          <button class="btn btn-sm btn-ghost danger" data-act="photo-rm" data-i="${i}">🗑 写真を消す</button>
        </div>`;
    }
    return `
      <div class="photo" data-photo="${i}" tabindex="0" aria-label="ステップ${i + 1}の写真を入れる場所">
        <div class="photo-empty">
          <div class="photo-btns">
            ${isTouch ? `<label class="btn btn-black">📷 撮影する<input type="file" accept="image/*" capture="environment" data-file="${i}" hidden></label>` : ""}
            <label class="btn ${isTouch ? "" : "btn-black"}">🖼 ${isTouch ? "アルバムから選ぶ" : "写真ファイルを選ぶ"}<input type="file" accept="image/*" data-file="${i}" hidden></label>
            ${isTouch ? "" : `<button class="btn" data-act="paste" data-i="${i}">📋 貼り付け</button>`}
          </div>
          ${isTouch ? "" : `<p class="photo-hint">コピーした画像は、この枠をクリックしてから<br><b>Ctrl＋V</b>（Macは <b>⌘＋V</b>）で貼り付けできます。<br>写真をここへドラッグしてもOKです。</p>`}
        </div>
      </div>`;
  }

  function pageDetail() {
    return `
      <div class="privacy">⚠ <b>写真の注意</b>：利用者さんの<b>顔・名前</b>や、個人がわかるもの（名札・書類など）が写らないようにしてください。手順書に利用者さんの氏名は書きません。</div>
      <div class="jump">
        <span>ステップへ移動：</span>
        ${cur.steps.map((s, i) => `<a href="#card-${i}" class="chip ${s.procedure.trim() ? "ok" : ""}">${i + 1}</a>`).join("")}
      </div>
      ${cur.steps.map((s, i) => `
        <article class="scard" id="card-${i}" data-step="${i}">
          <header class="scard-h"><span class="scard-n">${i + 1}</span><span class="scard-t" data-name-of="${i}">${esc(s.name) || "（作業名が未入力です）"}</span></header>
          <div class="scard-grid">
            <div class="scard-photo">
              <div class="sub-lbl">写真 <small>（なくてもOK）</small></div>
              ${photoBox(s, i)}
            </div>
            <div class="scard-body">
              <div class="field">
                <label for="h-${i}">項目（見出し）</label>
                <input id="h-${i}" type="text" data-sf="heading" data-i="${i}" value="${esc(s.heading)}" placeholder="${esc(s.name) || "例）物品を準備する"}">
                <p class="hint">空欄のときは、作業名「${esc(s.name) || "…"}」がそのまま入ります。</p>
              </div>
              <div class="field">
                <label for="p-${i}">作業手順</label>
                <p class="hint">1行に1つずつ書いてください。行ごとに「・」が付きます。</p>
                <textarea id="p-${i}" data-sf="procedure" data-i="${i}" rows="4" placeholder="例）タオル・着替え・石けんをそろえる&#10;例）脱衣所と浴室の温度を確認する">${esc(s.procedure)}</textarea>
              </div>
              <div class="field">
                <label for="c-${i}">注意点・留意事項 <small>（なくてもOK）</small></label>
                <textarea id="c-${i}" data-sf="caution" data-i="${i}" rows="2" placeholder="例）床がぬれていたら、すぐに拭く">${esc(s.caution)}</textarea>
              </div>
              <div class="field inline">
                <label for="m-${i}">目安の時間</label>
                <div class="inline-row"><input id="m-${i}" class="num" type="text" inputmode="numeric" data-sf="minutes" data-i="${i}" value="${esc(s.minutes)}" placeholder="例）5"><span>分</span></div>
              </div>
            </div>
          </div>
        </article>`).join("")}
      <button class="btn btn-add" data-act="add-detail">＋ ステップを追加する</button>
      ${pointField("point3", "手順の詳細")}`;
  }

  function checks() {
    const w = [];
    if (!cur.office) w.push([0, "事業所が選ばれていません"]);
    if (!cur.title.trim()) w.push([0, "タイトルが入っていません"]);
    if (!cur.purposeUser.trim() && !cur.purposeStaff.trim()) w.push([1, "目的が入っていません"]);
    if (!cur.author.trim()) w.push([1, "作成者の名前が入っていません"]);
    cur.steps.forEach((s, i) => {
      if (!s.name.trim()) w.push([2, `ステップ${i + 1}の作業名が入っていません`]);
      else if (!s.procedure.trim()) w.push([3, `ステップ${i + 1}の作業手順が入っていません`]);
    });
    return w;
  }

  function pageOutput() {
    const w = checks();
    return `
      ${w.length ? `<div class="warn"><b>まだ入っていないところがあります</b>（このままでも出力はできます）<ul>${w.map(([p, t]) => `<li><button class="link" data-act="go" data-page="${p}">${t} →</button></li>`).join("")}</ul></div>`
        : `<div class="good">✓ 必要なところは入力されています。</div>`}
      <div class="outbtns">
        <button class="btn btn-xl btn-black" data-act="docx">📄 Wordで出力</button>
        <button class="btn btn-xl btn-yellow" data-act="pdf">📕 PDFで出力</button>
      </div>
      <p class="hint center">Wordはあとから文字を直せます。PDFは配る・印刷する用です。</p>
      <div class="outsub"><button class="btn btn-sm" data-act="backup-cur">💾 控えをファイルに保存（別の端末で続きを入力するとき）</button></div>
      <h3 class="pv-ttl">仕上がりイメージ（A4）</h3>
      <div id="preview" class="preview"></div>`;
  }

  function renderPreview() {
    const box = document.getElementById("preview");
    if (!box) return;
    const host = document.getElementById("render-area");
    const pages = window.ManualOutput.buildPages(cur, host);
    const W = window.ManualOutput.PAGE_W, H = window.ManualOutput.PAGE_H;
    const s = Math.min(1, (box.clientWidth || W) / W);
    box.innerHTML = "";
    pages.forEach((p) => {
      const wrap = document.createElement("div");
      wrap.className = "pv-wrap";
      wrap.style.width = W * s + "px";
      wrap.style.height = H * s + "px";
      p.style.transform = `scale(${s})`;
      wrap.appendChild(p);
      box.appendChild(wrap);
    });
    host.innerHTML = "";
  }
  let rsz;
  window.addEventListener("resize", () => { clearTimeout(rsz); rsz = setTimeout(() => cur && page === 4 && renderPreview(), 200); });

  // ---------- 写真 ----------
  async function processImage(file) {
    if (!file || !/^image\//.test(file.type || "image/")) throw new Error("画像ではありません");
    const url = URL.createObjectURL(file);
    try {
      const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
      let sx = 0, sy = 0, sw = img.naturalWidth, sh = img.naturalHeight;
      // 極端に細長い写真は、まん中を切り出して縦横比を 2:1 までにする
      if (sw / sh > 2) { const nw = sh * 2; sx = (sw - nw) / 2; sw = nw; }
      if (sh / sw > 2) { const nh = sw * 2; sy = (sh - nh) / 2; sh = nh; }
      const MAX = 1400, k = Math.min(1, MAX / Math.max(sw, sh));
      const w = Math.round(sw * k), h = Math.round(sh * k);
      const cv = document.createElement("canvas");
      cv.width = w; cv.height = h;
      const ctx = cv.getContext("2d");
      ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, w, h);
      ctx.drawImage(img, sx, sy, sw, sh, 0, 0, w, h);
      return { data: cv.toDataURL("image/jpeg", 0.85), w, h };
    } finally { URL.revokeObjectURL(url); }
  }
  async function setPhoto(i, file) {
    if (!cur || !cur.steps[i]) return;
    try {
      busy(true, "写真を入れています…");
      const r = await processImage(file);
      Object.assign(cur.steps[i], { photo: r.data, photoW: r.w, photoH: r.h });
      await saveNow();
      renderEditor(true);
      toast(`ステップ${i + 1}に写真を入れました`);
    } catch (e) {
      toast("この写真は読み込めませんでした。JPEGやPNGの写真でお試しください。", 4000);
    } finally { busy(false); }
  }

  // ---------- ステップの増減 ----------
  const hasContent = (s) => s.name.trim() || s.heading.trim() || s.procedure.trim() || s.caution.trim() || s.photo;
  function addStep(scrollToNew) {
    cur.steps.push(newStep());
    scheduleSave();
    renderEditor(true);
    const i = cur.steps.length - 1;
    const el = scrollToNew ? document.getElementById(`card-${i}`) : document.querySelector(`[data-sf="name"][data-i="${i}"]`);
    if (el) { el.scrollIntoView({ behavior: "smooth", block: "center" }); if (!scrollToNew) setTimeout(() => el.focus(), 300); }
  }
  function clampBack() {
    cur.check.backTo = Math.min(Math.max(1, Number(cur.check.backTo) || 1), cur.steps.length);
  }

  // ---------- 操作の受け付け ----------
  document.addEventListener("click", async (e) => {
    const b = e.target.closest("[data-act]");
    if (!b || b.tagName === "INPUT") return;
    const act = b.dataset.act, i = Number(b.dataset.i);
    switch (act) {
      case "new": cur = newManual(); page = 0; await saveNow(); renderEditor(); break;
      case "open": openManual(b.dataset.id); break;
      case "dup": {
        const m = await DB.get(b.dataset.id);
        const c = { ...JSON.parse(JSON.stringify(m)), id: uid(), createdAt: Date.now(), updatedAt: Date.now(), title: (m.title || "") + "（コピー）" };
        await DB.put(c); toast("コピーしました"); showHome(); break;
      }
      case "del": {
        const m = await DB.get(b.dataset.id);
        if (confirm(`「${m.title || "タイトル未入力"}」を削除します。\n元に戻せません。よろしいですか？`)) { await DB.del(m.id); toast("削除しました"); showHome(); }
        break;
      }
      case "backup": backup(await DB.get(b.dataset.id)); break;
      case "backup-cur": await saveNow(); backup(cur); break;
      case "home": showHome(); break;
      case "go": page = Number(b.dataset.page); await saveNow(); renderEditor(); break;
      case "next": page = Math.min(4, page + 1); await saveNow(); renderEditor(); break;
      case "prev": page = Math.max(0, page - 1); await saveNow(); renderEditor(); break;
      case "add": addStep(false); break;
      case "add-detail": addStep(true); break;
      case "up": case "down": {
        const j = act === "up" ? i - 1 : i + 1;
        [cur.steps[i], cur.steps[j]] = [cur.steps[j], cur.steps[i]];
        scheduleSave(); renderEditor(true); break;
      }
      case "rm": {
        const s = cur.steps[i];
        if (hasContent(s) && !confirm(`ステップ${i + 1}「${s.name || "作業名なし"}」を消します。\n各ステップで入力した手順や写真も消えます。よろしいですか？`)) break;
        cur.steps.splice(i, 1); clampBack(); scheduleSave(); renderEditor(true); break;
      }
      case "photo-rm":
        if (confirm(`ステップ${i + 1}の写真を消しますか？`)) { Object.assign(cur.steps[i], { photo: null, photoW: 0, photoH: 0 }); await saveNow(); renderEditor(true); }
        break;
      case "paste": {
        activePhoto = i;
        try {
          if (!navigator.clipboard || !navigator.clipboard.read) throw 0;
          const items = await navigator.clipboard.read();
          for (const it of items) {
            const t = it.types.find((x) => x.startsWith("image/"));
            if (t) { const blob = await it.getType(t); return setPhoto(i, new File([blob], "paste", { type: t })); }
          }
          toast("コピーされた画像がありません。先に画像をコピーしてください。", 3500);
        } catch (err) {
          toast("この写真欄をクリックしてから Ctrl＋V（Macは ⌘＋V）を押してください。", 4000);
          document.querySelector(`[data-photo="${i}"]`)?.focus();
        }
        break;
      }
      case "docx": exportDocx(); break;
      case "pdf": exportPdf(); break;
    }
  });

  document.addEventListener("input", (e) => {
    if (!cur) return;
    const t = e.target;
    if (t.dataset.f) {
      cur[t.dataset.f] = t.value;
      if (t.dataset.f === "office") pref.set({ office: t.value });
      if (t.dataset.f === "author") pref.set({ author: t.value });
    } else if (t.dataset.sf) {
      const i = Number(t.dataset.i);
      cur.steps[i][t.dataset.sf] = t.value;
      if (t.dataset.sf === "procedure") document.querySelector(`.chip[href="#card-${i}"]`)?.classList.toggle("ok", !!t.value.trim());
      if (t.dataset.sf === "name") {
        const opt = document.querySelector(`#f-back option[value="${i + 1}"]`);
        if (opt) opt.textContent = `STEP ${i + 1}${t.value ? "（" + t.value.slice(0, 14) + "）" : ""}`;
      }
    } else if (t.dataset.check) {
      if (t.dataset.check === "use") { cur.check.use = t.checked; scheduleSave(); renderEditor(true); return; }
      cur.check[t.dataset.check] = t.dataset.check === "backTo" ? Number(t.value) : t.value;
    } else return;
    if (t.tagName === "TEXTAREA") autoGrow(t);
    scheduleSave();
  });

  document.addEventListener("change", async (e) => {
    const t = e.target;
    if (t.dataset.file !== undefined && t.files && t.files[0]) { await setPhoto(Number(t.dataset.file), t.files[0]); t.value = ""; }
    else if (t.dataset.check === "backTo") { cur.check.backTo = Number(t.value); scheduleSave(); }
    else if (t.dataset.act === "import" && t.files && t.files[0]) { importFile(t.files[0]); t.value = ""; }
  });

  // 写真欄：クリックで貼り付け先に、ドラッグ＆ドロップ
  document.addEventListener("focusin", (e) => {
    const p = e.target.closest && e.target.closest("[data-photo]");
    document.querySelectorAll(".photo.target").forEach((x) => x.classList.remove("target"));
    if (p) { activePhoto = Number(p.dataset.photo); p.classList.add("target"); }
  });
  document.addEventListener("pointerdown", (e) => {
    const p = e.target.closest("[data-photo]");
    if (p && !e.target.closest("label,button")) p.focus();
  });
  document.addEventListener("paste", (e) => {
    if (!cur || page !== 3) return;
    const items = [...(e.clipboardData?.items || [])].filter((x) => x.type.startsWith("image/"));
    if (!items.length) return;
    const box = e.target.closest && e.target.closest("[data-step]");
    const i = box ? Number(box.dataset.step) : activePhoto;
    e.preventDefault();
    if (i == null || !cur.steps[i]) return toast("先に、写真を入れたいステップの写真欄をクリックしてください。", 3500);
    setPhoto(i, items[0].getAsFile());
  });
  document.addEventListener("dragover", (e) => {
    e.preventDefault();
    const p = e.target.closest && e.target.closest("[data-photo]");
    document.querySelectorAll(".photo.drag").forEach((x) => x !== p && x.classList.remove("drag"));
    if (p) p.classList.add("drag");
  });
  document.addEventListener("dragleave", (e) => { const p = e.target.closest && e.target.closest("[data-photo]"); if (p && !p.contains(e.relatedTarget)) p.classList.remove("drag"); });
  document.addEventListener("drop", (e) => {
    e.preventDefault();
    const p = e.target.closest && e.target.closest("[data-photo]");
    document.querySelectorAll(".photo.drag").forEach((x) => x.classList.remove("drag"));
    const f = e.dataTransfer?.files?.[0];
    if (p && f && cur) setPhoto(Number(p.dataset.photo), f);
    else if (f) toast("写真は、各ステップの写真欄の上に落としてください。");
  });

  function autoGrow(t) { t.style.height = "auto"; t.style.height = Math.max(t.scrollHeight + 2, 48) + "px"; }
  function autoGrowAll() { document.querySelectorAll("textarea").forEach(autoGrow); }

  // ---------- 控えファイル（バックアップ） ----------
  function backup(m) {
    if (!m) return;
    const blob = new Blob([JSON.stringify({ app: "activemore-manual", version: 1, manual: m })], { type: "application/json" });
    download(blob, window.ManualOutput.fileBase(m) + "_控え.json");
    toast("控えのファイルを保存しました（ダウンロードの中にあります）", 3500);
  }
  async function importFile(file) {
    try {
      const j = JSON.parse(await file.text());
      if (j.app !== "activemore-manual" || !j.manual) throw 0;
      const m = migrate(j.manual);
      const exists = await DB.get(m.id);
      if (exists && !confirm(`この端末にも同じ手順書「${exists.title || "タイトル未入力"}」があります。\n\n［OK］… ファイルの内容で上書きする\n［キャンセル］… 別の手順書として読み込む`)) {
        m.id = uid();
      }
      m.updatedAt = Date.now();
      await DB.put(m);
      toast("読み込みました");
      showHome();
    } catch (e) {
      toast("このファイルは読み込めませんでした。このアプリで保存した「〜_控え.json」を選んでください。", 4500);
    }
  }

  // ---------- 出力 ----------
  async function exportDocx() {
    await saveNow();
    busy(true, "Wordファイルを作っています…");
    try {
      await loadScript("lib/docx.js");
      const blob = await window.ManualOutput.toDocxBlob(cur);
      download(blob, window.ManualOutput.fileBase(cur) + ".docx");
      toast("Wordファイルができました（ダウンロードの中にあります）", 3500);
    } catch (e) {
      console.error(e);
      toast("Wordファイルを作れませんでした。電波のよい所でもう一度お試しください。", 4500);
    } finally { busy(false); }
  }
  async function exportPdf() {
    await saveNow();
    busy(true, "PDFを作っています…（少し時間がかかります）");
    try {
      await Promise.all([loadScript("lib/html2canvas.js"), loadScript("lib/jspdf.js")]);
      window.scrollTo(0, 0);
      const host = document.getElementById("render-area");
      host.classList.add("capture");
      const blob = await window.ManualOutput.toPdfBlob(cur, host);
      host.classList.remove("capture");
      download(blob, window.ManualOutput.fileBase(cur) + ".pdf");
      toast("PDFができました（ダウンロードの中にあります）", 3500);
    } catch (e) {
      console.error(e);
      toast("PDFを作れませんでした。もう一度お試しください。", 4500);
    } finally {
      document.getElementById("render-area").classList.remove("capture");
      busy(false);
      if (page === 4) renderPreview();
    }
  }

  window.addEventListener("pagehide", () => { if (cur) saveNow(); });
  document.addEventListener("visibilitychange", () => { if (document.hidden && cur) saveNow(); });

  showHome();
})();
