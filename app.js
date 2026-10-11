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

  const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
  const newStep = () => ({ id: uid(), name: "", heading: "", procedure: "", caution: "", minutes: "", photo: null, photoW: 0, photoH: 0, branch: { use: false, text: "", backId: "" } });
  function newManual() {
    const p = pref.get();
    return {
      id: uid(), createdAt: Date.now(), updatedAt: Date.now(),
      office: C.offices.includes(p.office) ? p.office : "", title: "",
      major: "", category: "",
      createdDate: today(), revisions: [], precautions: "", memo: "",
      itemName: "", purposeUser: "", purposeStaff: "", author: p.author || "", checker1: "", checker2: "", point1: "",
      steps: [newStep(), newStep(), newStep()],
      check: { use: true, text: "", backId: "" },
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
          <h1>手順を入力するだけで作れます</h1>
          <ol class="flow-guide">
            ${PAGES.map((p, i) => `<li><span>${i + 1}</span>${p.short}</li>`).join("")}
          </ol>
          <div class="hero-acts">
            <button class="btn btn-yellow btn-xl" data-act="new">＋ 新しい手順書をつくる</button>
            <button class="btn btn-black btn-xl" data-act="video">🎬 動画から下書きをつくる（AI）</button>
          </div>
          <p class="hero-sub">作業の様子を撮った動画を選ぶと、AIが手順の下書きと写真を用意します。</p>
        </div>

        <h2 class="list-ttl">つくりかけ・つくった手順書 <small>${list.length}件</small></h2>
        ${list.length ? groupList(list).map(([major, cats]) => `
          <section class="grp">
            <h3 class="grp-major">${esc(major)}</h3>
            ${cats.map(([cat, items]) => `
              <h4 class="grp-cat">${esc(cat)} <small>${items.length}件</small></h4>
              <ul class="mlist">${items.map((m) => `
          <li class="mitem">
            <button class="mitem-main" data-act="open" data-id="${m.id}">
              <span class="mitem-title">${esc(m.title) || "（タイトル未入力）"}</span>
              <span class="mitem-path">${esc([m.major, m.category].filter(Boolean).join(" ＞ ") || "分類 未入力")}</span>
              <span class="mitem-meta">${esc(m.office) || "事業所 未選択"}｜ステップ ${m.steps.length}｜${fmt(m.updatedAt)}</span>
            </button>
            <div class="mitem-acts">
              <button class="btn btn-sm" data-act="open" data-id="${m.id}">続きを入力</button>
              <button class="btn btn-sm btn-ghost" data-act="dup" data-id="${m.id}">コピー</button>
              <button class="btn btn-sm btn-ghost" data-act="backup" data-id="${m.id}">ファイルに保存</button>
              <button class="btn btn-sm btn-ghost danger" data-act="del" data-id="${m.id}">削除</button>
            </div>
          </li>`).join("")}</ul>`).join("")}
          </section>`).join("") : `<p class="empty">まだありません。上の黄色いボタンから始めましょう。</p>`}

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

  // 一覧を「大分類 ＞ 中分類」ごとにまとめる（章立て）
  function groupList(list) {
    const order = [...C.majors, "分類 未入力"];
    const g = new Map();
    list.forEach((m) => {
      const mj = m.major || "分類 未入力", ct = m.category || "（中分類 未入力）";
      if (!g.has(mj)) g.set(mj, new Map());
      if (!g.get(mj).has(ct)) g.get(mj).set(ct, []);
      g.get(mj).get(ct).push(m);
    });
    return [...g.entries()]
      .sort((a, b) => (order.indexOf(a[0]) + 99) % 99 - (order.indexOf(b[0]) + 99) % 99 || a[0].localeCompare(b[0], "ja"))
      .map(([mj, cats]) => [mj, [...cats.entries()].sort((a, b) => a[0].localeCompare(b[0], "ja"))]);
  }

  async function openManual(id) {
    const m = await DB.get(id);
    if (!m) return toast("見つかりませんでした");
    cur = migrate(m);
    page = 0;
    renderEditor();
  }
  function migrate(m) {
    m.check = m.check || { use: true, text: "", backId: "" };
    m.purposeUser = m.purposeUser || "";
    m.major = m.major || ""; m.category = m.category || "";
    m.precautions = m.precautions || ""; m.memo = m.memo || "";
    m.revisions = m.revisions || [];
    if (!m.createdDate) { const d = new Date(m.createdAt || Date.now()); m.createdDate = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; }
    m.purposeStaff = m.purposeStaff || "";
    m.steps = (m.steps && m.steps.length ? m.steps : [newStep()]).map((s) => ({ ...newStep(), ...s }));
    // 以前の形式（戻り先を番号で持っていた）からの読みかえ
    if (!m.check.backId) m.check.backId = (m.steps[(Number(m.check.backTo) || 1) - 1] || m.steps[0]).id;
    delete m.check.backTo;
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
        ${aiBanner()}
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
      <div class="levels">
        <div class="levels-ttl">分類 <small>（手順書を3段階に分けて整理します）</small></div>
        <div class="field">
          <label><span class="lv">1</span>大分類 <em class="req">必須</em></label>
          <p class="hint">直接介助か、間接介助かを選んでください。</p>
          <div class="choices two">
            ${C.majors.map((o) => `<label class="choice"><input type="radio" name="major" value="${esc(o)}" data-f="major" ${cur.major === o ? "checked" : ""}><span>${esc(o)}</span></label>`).join("")}
          </div>
        </div>
        <div class="field">
          <label for="f-category"><span class="lv">2</span>中分類 <em class="req">必須</em></label>
          <p class="hint">業務のまとまりです。下の候補から選ぶか、自由に入力してください。</p>
          <input id="f-category" type="text" data-f="category" value="${esc(cur.category)}" placeholder="例）${cur.major === "直接介助" ? "入浴" : "環境整備"}" autocomplete="off">
          <div class="cat-chips" id="cat-chips">${catChips()}</div>
        </div>
        ${field('<span class="lv">3</span>小分類（手順書のタイトル）', "title", { req: true, hint: "具体的な業務名がわかるようにしましょう。", ph: cur.major === "直接介助" ? "例）一般浴の入浴介助" : "例）居室環境整備の手順" })}
        <div class="levels-prev">手順書ではこう表示されます：<b id="title-prev">${esc(titleText())}</b></div>
      </div>`;
  }
  function titleText() {
    const t = cur.title.trim() || "（タイトル）";
    return `${cur.major ? "【" + cur.major + "】" : ""}${cur.category.trim() ? cur.category.trim() + "｜" : ""}${t}`;
  }
  function catChips() {
    const base = (cur.major && C.categories[cur.major]) || [...new Set(Object.values(C.categories).flat())];
    return base.map((c) => `<button type="button" class="cchip ${cur.category === c ? "on" : ""}" data-act="cat" data-v="${esc(c)}">${esc(c)}</button>`).join("");
  }

  function pageInfo() {
    return `
      <div class="purpose">
        <div class="purpose-ttl">目的 <small>（なんのために、この手順で行うのか）</small></div>
        ${field("利用者さんにとっての目的", "purposeUser", { area: true, rows: 2, hint: "この手順で、利用者さんにどうなってほしいかを書きます。", ph: "例）清潔で気持ちよく過ごせる。安全に入浴できる。" })}
        ${field("スタッフにとっての目的", "purposeStaff", { area: true, rows: 2, hint: "この手順書があると、スタッフにとって何がよいかを書きます。", ph: "例）だれが担当しても、同じ手順・同じ質でケアできる。" })}
      </div>
      ${field("作成者（氏名）", "author", { req: true, ph: "例）山田 花子", ac: "name" })}
      ${field("確認者（1次）（氏名）", "checker1", { ph: "例）佐藤 太郎" })}
      ${field("確認者（2次）（氏名）", "checker2", { ph: "例）鈴木 一郎" })}
      <div class="dates">
        <div class="field inline">
          <label for="f-created">作成日</label>
          <input id="f-created" type="date" data-f="createdDate" value="${esc(cur.createdDate)}">
        </div>
        <div class="field">
          <label>改訂履歴 <small>（内容を直したときに記録します。作成日とあわせて「① 管理項目」の表に入ります）</small></label>
          ${cur.revisions.length ? cur.revisions.map((r, i) => `
            <div class="rev-row">
              <input type="date" data-rev="date" data-i="${i}" value="${esc(r.date)}" aria-label="改訂した日">
              <input type="text" data-rev="note" data-i="${i}" value="${esc(r.note)}" placeholder="直した内容（例：物品リストを更新）" aria-label="直した内容">
              <button class="icon danger" data-act="rev-rm" data-i="${i}" aria-label="この記録を消す">✕</button>
            </div>`).join("") : `<p class="hint">まだありません。</p>`}
          <button class="btn btn-sm" data-act="rev-add">＋ 改訂を記録する（今日の日付）</button>
        </div>
      </div>
      ${pointField("point1", "この手順書全体")}
      <div class="field notes-in">
        <label for="f-precautions">⚠ 注意事項・心得 <small>（なくてもOK）</small></label>
        <p class="hint">この業務にあたるときの心がまえや、守ってほしいことを書きます。1行に1つずつ書くと「・」付きで並びます。</p>
        <textarea id="f-precautions" data-f="precautions" rows="3" placeholder="例）利用者さんの私物には無断で触れない&#10;例）個人情報や写真の取り扱いに注意する">${esc(cur.precautions)}</textarea>
      </div>
      <div class="field">
        <label for="f-memo">メモ・備考欄 <small>（なくてもOK）</small></label>
        <p class="hint">書いた内容が入ります。何も書かなくても、手順書には手書き用の「メモ・備考欄」の枠が入ります。</p>
        <textarea id="f-memo" data-f="memo" rows="2" placeholder="例）〇〇の物品は倉庫の右の棚にあります">${esc(cur.memo)}</textarea>
      </div>`;
  }

  const stepLabel = (s, i) => `STEP ${i + 1}${s.name ? "（" + esc(s.name.slice(0, 14)) + "）" : ""}`;
  // NO のときの行き先を選ぶ欄
  function backSelect(attrs, backId, fallbackId) {
    const sel = cur.steps.some((s) => s.id === backId) ? backId : fallbackId;
    return `<select ${attrs}>${cur.steps.map((s, i) => `<option value="${s.id}" data-sid="${s.id}" ${s.id === sel ? "selected" : ""}>${stepLabel(s, i)}</option>`).join("")}</select>`;
  }
  function branchBox(s, i) {
    const n = cur.steps.length;
    const next = i + 1 < n ? `ステップ${i + 2}` : cur.check.use ? "最後の確認" : "終了";
    return `
      <div class="wf-arrow">▼</div>
      <div class="wf-check wf-branch">
        <div class="wf-br-head"><span class="wf-check-ttl"><i class="diamond" aria-hidden="true"></i>ステップ${i + 1}のあとの確認（分岐）</span>
          <button class="link danger" data-act="br-rm" data-i="${i}">この確認を消す</button></div>
        <div class="field">
          <label for="br-${i}">確認すること</label>
          <input id="br-${i}" type="text" data-br="text" data-i="${i}" value="${esc(s.branch.text)}" placeholder="例）利用者さんが居室にいらっしゃるか">
        </div>
        <div class="field inline">
          <label for="brb-${i}">NO（できていない・ちがう）のときは</label>
          <div class="inline-row">${backSelect(`id="brb-${i}" data-br="backId" data-i="${i}"`, s.branch.backId, s.id)}<span>へ</span></div>
          <p class="hint">YES（OK）のときは、${next}へ進みます。</p>
        </div>
      </div>`;
  }

  function pageFlow() {
    const n = cur.steps.length;
    return `
      <p class="lead">作業を始めから終わりまで、<b>順番に</b>ステップに分けて書きます。<br>ここで書いた作業名は、次の「各ステップ」の見出しにもなります。<br>
      途中で「できているか」「どちらか」を確かめて流れが分かれるところには、<b>◆ 確認（分岐）</b>を入れられます。いくつでも入れられます。</p>
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
          </div>
          ${s.branch.use ? branchBox(s, i) : i < n - 1 ? `<button class="wf-addbr" data-act="br-add" data-i="${i}"><i class="diamond" aria-hidden="true"></i>ここに確認（分岐）を入れる</button>` : ""}`).join("")}
        <button class="btn btn-add" data-act="add">＋ ステップを追加する</button>
        <div class="wf-arrow">▼</div>
        <div class="wf-check ${cur.check.use ? "" : "off"}">
          <label class="switch"><input type="checkbox" data-check="use" ${cur.check.use ? "checked" : ""}><span class="wf-check-ttl"><i class="diamond" aria-hidden="true"></i>最後に「確認 OK？」（分岐のひし形）を入れる</span></label>
          ${cur.check.use ? `
            <div class="field">
              <label for="f-check">確認すること</label>
              <input id="f-check" type="text" data-check="text" value="${esc(cur.check.text)}" placeholder="例）利用者さんの体調に変わりはないか">
            </div>
            <div class="field inline">
              <label for="f-back">NO（できていない）のときは</label>
              <div class="inline-row">${backSelect(`id="f-back" data-check="backId"`, cur.check.backId, cur.steps[0].id)}<span>へ戻る</span></div>
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
    if (!cur.major) w.push([0, "大分類（直接介助・間接介助）が選ばれていません"]);
    if (!cur.category.trim()) w.push([0, "中分類が入っていません"]);
    if (!cur.title.trim()) w.push([0, "小分類（タイトル）が入っていません"]);
    if (!cur.purposeUser.trim() && !cur.purposeStaff.trim()) w.push([1, "目的が入っていません"]);
    if (!cur.author.trim()) w.push([1, "作成者の名前が入っていません"]);
    cur.steps.forEach((s, i) => {
      if (s.branch.use && !s.branch.text.trim()) w.push([2, `ステップ${i + 1}のあとの確認の内容が入っていません`]);
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

  // ---------- 操作の受け付け ----------
  document.addEventListener("click", async (e) => {
    const b = e.target.closest("[data-act]");
    if (!b || b.tagName === "INPUT") return;
    const act = b.dataset.act, i = Number(b.dataset.i);
    switch (act) {
      case "new": cur = newManual(); page = 0; await saveNow(); renderEditor(); break;
      case "video": showVideo(); break;
      case "vd-run": runVideoDraft(); break;
      case "vd-reset": vd.file = null; showVideo(); break;
      case "ai-ok": if (cur && cur.aiDraft) { cur.aiDraft.dismissed = true; await saveNow(); renderEditor(true); } break;
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
        cur.steps.splice(i, 1); scheduleSave(); renderEditor(true); break;
      }
      case "cat":
        cur.category = b.dataset.v;
        { const inp = document.getElementById("f-category"); if (inp) inp.value = cur.category; }
        document.getElementById("cat-chips").innerHTML = catChips();
        { const tp = document.getElementById("title-prev"); if (tp) tp.textContent = titleText(); }
        scheduleSave(); break;
      case "rev-add":
        cur.revisions.push({ date: today(), note: "" });
        scheduleSave(); renderEditor(true);
        setTimeout(() => document.querySelector(`[data-rev="note"][data-i="${cur.revisions.length - 1}"]`)?.focus(), 50);
        break;
      case "rev-rm":
        if (confirm("この改訂の記録を消しますか？")) { cur.revisions.splice(i, 1); scheduleSave(); renderEditor(true); }
        break;
      case "br-add":
        cur.steps[i].branch = { use: true, text: "", backId: cur.steps[i].id };
        scheduleSave(); renderEditor(true);
        setTimeout(() => document.getElementById(`br-${i}`)?.focus(), 50);
        break;
      case "br-rm":
        if (cur.steps[i].branch.text.trim() && !confirm(`ステップ${i + 1}のあとの確認を消しますか？`)) break;
        cur.steps[i].branch = { use: false, text: "", backId: "" };
        scheduleSave(); renderEditor(true); break;
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
      if (t.dataset.f === "major") { scheduleSave(); renderEditor(true); return; }
      if (t.dataset.f === "category") { const cc = document.getElementById("cat-chips"); if (cc) cc.innerHTML = catChips(); }
      if (["major", "category", "title"].includes(t.dataset.f)) { const tp = document.getElementById("title-prev"); if (tp) tp.textContent = titleText(); }
    } else if (t.dataset.sf) {
      const i = Number(t.dataset.i);
      cur.steps[i][t.dataset.sf] = t.value;
      if (t.dataset.sf === "procedure") document.querySelector(`.chip[href="#card-${i}"]`)?.classList.toggle("ok", !!t.value.trim());
      if (t.dataset.sf === "name") {
        const id = cur.steps[i].id;
        document.querySelectorAll(`option[data-sid="${id}"]`).forEach((o) => { o.textContent = `STEP ${i + 1}${t.value ? "（" + t.value.slice(0, 14) + "）" : ""}`; });
      }
    } else if (t.dataset.check) {
      if (t.dataset.check === "use") { cur.check.use = t.checked; scheduleSave(); renderEditor(true); return; }
      cur.check[t.dataset.check] = t.value;
    } else if (t.dataset.rev) {
      cur.revisions[Number(t.dataset.i)][t.dataset.rev] = t.value;
    } else if (t.dataset.br) {
      cur.steps[Number(t.dataset.i)].branch[t.dataset.br] = t.value;
    } else return;
    if (t.tagName === "TEXTAREA") autoGrow(t);
    scheduleSave();
  });

  document.addEventListener("change", async (e) => {
    const t = e.target;
    if (t.dataset.file !== undefined && t.files && t.files[0]) { await setPhoto(Number(t.dataset.file), t.files[0]); t.value = ""; }
    else if (t.dataset.check === "backId") { cur.check.backId = t.value; scheduleSave(); }
    else if (t.dataset.br === "backId") { cur.steps[Number(t.dataset.i)].branch.backId = t.value; scheduleSave(); }
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
      const blob = await window.ManualOutput.toDocxBlob(cur, document.getElementById("render-area"));
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

  // =============================================================
  // 動画から下書きをつくる（AI）
  //   1. 動画から一定の間隔で場面（写真）を取り出す（端末の中で行う）
  //   2. 小さめの場面だけを中継プログラム経由で AI に送る（動画そのものは送らない）
  //   3. 返ってきた下書きと、大きめの場面写真で手順書をつくる
  // =============================================================
  const vd = { file: null, url: null, duration: 0 };
  const AI_PASS_KEY = "am-ai-pass";
  const getPass = () => { try { return localStorage.getItem(AI_PASS_KEY) || ""; } catch (e) { return ""; } };
  const setPass = (v) => { try { localStorage.setItem(AI_PASS_KEY, v); } catch (e) {} };

  function showVideo() {
    cur = null;
    const p = pref.get();
    const ready = !!C.aiEndpoint;
    $app.innerHTML = `
      <section class="vd">
        <button class="link" data-act="home">← 一覧にもどる</button>
        <div class="page">
          <h2 class="page-ttl"><span>🎬</span>動画から下書きをつくる</h2>
          <ol class="vd-flow">
            <li><b>動画を選ぶ</b>（その場で撮ってもOK）</li>
            <li><b>AIが場面を見て、手順の下書きを作る</b>（1〜3分かかります）</li>
            <li><b>内容と写真を確認して、直す</b></li>
          </ol>
          ${ready ? "" : `<div class="warn"><b>まだ使えません</b>：AIとつなぐ設定が終わっていません。管理者に連絡してください。</div>`}
          <div class="privacy">⚠ <b>個人情報の注意</b><br>
            ・利用者さんの<b>顔・名前</b>、名札や書類が映らないように撮った動画を使ってください。<br>
            ・動画から取り出した<b>場面（写真）だけ</b>がAI（Anthropic社のClaude）に送られます。動画そのものや音声は送りません。</div>
          <div class="tips"><b>うまく作るコツ</b>：スマホは<b>横向き</b>で、<b>手元</b>が大きく映るように撮る／長さは<b>5分くらいまで</b>／1つの作業を始めから終わりまで撮る</div>

          <div class="field">
            <label for="vd-office">事業所</label>
            <select id="vd-office"><option value="">（あとで選ぶ）</option>${C.offices.map((o) => `<option ${p.office === o ? "selected" : ""}>${esc(o)}</option>`).join("")}</select>
          </div>

          <div class="field">
            <label>動画 <em class="req">必須</em></label>
            ${vd.file ? `
              <video class="vd-video" src="${vd.url}" controls playsinline muted></video>
              <p class="hint">${esc(vd.file.name)}（${fmtDur(vd.duration)}）</p>
              <button class="btn btn-sm btn-ghost" data-act="vd-reset">別の動画にする</button>` : `
              <div class="photo-btns row">
                ${isTouch ? `<label class="btn btn-black">📹 動画を撮る<input type="file" accept="video/*" capture="environment" data-vfile hidden></label>` : ""}
                <label class="btn ${isTouch ? "" : "btn-black"}">📁 ${isTouch ? "アルバムから動画を選ぶ" : "動画ファイルを選ぶ"}<input type="file" accept="video/*" data-vfile hidden></label>
              </div>`}
          </div>

          <div class="field">
            <label for="vd-note">補足メモ <small>（なくてもOK）</small></label>
            <p class="hint">何の作業か、動画の中で話していた説明、気をつけていることなどを書くと、下書きがより正確になります。</p>
            <textarea id="vd-note" rows="3" placeholder="例）デイサービスで3時のおやつに出すコーヒーの準備。好み表を見て、ミルクと砂糖を入れ分ける。"></textarea>
          </div>

          ${ready && !getPass() ? `
          <div class="field">
            <label for="vd-pass">合言葉 <em class="req">必須</em></label>
            <p class="hint">はじめて使うときだけ入力します。合言葉は管理者に聞いてください。</p>
            <input id="vd-pass" type="password" autocomplete="off">
          </div>` : ""}

          <button class="btn btn-xl btn-yellow vd-go" data-act="vd-run" ${ready && vd.file ? "" : "disabled"}>✨ AIで下書きをつくる</button>
          <div id="vd-progress" class="vd-progress" hidden></div>
        </div>
      </section>`;
    window.scrollTo(0, 0);
  }
  const fmtDur = (s) => `${Math.floor(s / 60)}分${String(Math.round(s % 60)).padStart(2, "0")}秒`;

  document.addEventListener("change", async (e) => {
    const t = e.target;
    if (!t.hasAttribute || !t.hasAttribute("data-vfile") || !t.files || !t.files[0]) return;
    const f = t.files[0];
    if (vd.url) URL.revokeObjectURL(vd.url);
    vd.file = f; vd.url = URL.createObjectURL(f);
    try { vd.duration = await videoDuration(vd.url); } catch (err) { vd.duration = 0; }
    if (!vd.duration) { toast("この動画は読み込めませんでした。別の動画でお試しください。", 4000); vd.file = null; }
    else if (vd.duration > 10 * 60) toast("10分をこえる長い動画です。場面がとびとびになるので、短く分けて撮るのがおすすめです。", 5000);
    showVideo();
  });

  function videoDuration(url) {
    return new Promise((res, rej) => {
      const v = document.createElement("video");
      v.preload = "metadata"; v.muted = true; v.playsInline = true;
      v.onloadedmetadata = () => res(isFinite(v.duration) ? v.duration : 0);
      v.onerror = rej;
      v.src = url;
    });
  }

  const once = (el, ev, ms = 10000) => new Promise((res, rej) => {
    const tm = setTimeout(() => { el.removeEventListener(ev, h); rej(new Error("timeout")); }, ms);
    const h = () => { clearTimeout(tm); el.removeEventListener(ev, h); res(); };
    el.addEventListener(ev, h);
  });

  // 動画から場面を取り出す（AI用の小さい写真と、手順書用の大きい写真）
  async function extractFrames(url, duration, onStep) {
    const v = document.createElement("video");
    v.muted = true; v.playsInline = true; v.preload = "auto"; v.src = url;
    v.style.cssText = "position:fixed;left:-9999px;top:0;width:2px;height:2px";
    document.body.appendChild(v);
    try {
      await once(v, "loadeddata", 20000);
      try { await v.play(); v.pause(); } catch (e) { /* 自動再生できない端末でも続ける */ }
      const n = Math.max(8, Math.min(30, Math.round(duration / 4)));
      const W = v.videoWidth, H = v.videoHeight;
      const cv = document.createElement("canvas"), ctx = cv.getContext("2d");
      const shot = (max, q) => {
        const k = Math.min(1, max / Math.max(W, H));
        cv.width = Math.round(W * k); cv.height = Math.round(H * k);
        ctx.drawImage(v, 0, 0, cv.width, cv.height);
        return cv.toDataURL("image/jpeg", q);
      };
      const out = [];
      for (let i = 0; i < n; i++) {
        const t = Math.min(duration - 0.1, (i + 0.5) * duration / n);
        v.currentTime = t;
        try { await once(v, "seeked", 8000); } catch (e) { continue; }
        out.push({ t, ai: shot(768, 0.72).split(",")[1], photo: shot(1280, 0.85), w: W, h: H });
        onStep(i + 1, n);
      }
      return out;
    } finally { v.remove(); }
  }

  // 縦長の写真は、作業の中心のあたりを横長（4:3）に切り出して、手順書の枠で見やすくする
  function cropPhoto(dataUrl, fx, fy) {
    return new Promise((res) => {
      const img = new Image();
      img.onload = () => {
        const w = img.naturalWidth, h = img.naturalHeight;
        let sx = 0, sy = 0, sw = w, sh = h;
        if (w / h < 4 / 3) { sh = Math.round(w * 3 / 4); sy = Math.round(Math.min(h - sh, Math.max(0, (fy ?? 0.5) * h - sh / 2))); }
        else if (w / h > 2) { sw = Math.round(h * 2); sx = Math.round(Math.min(w - sw, Math.max(0, (fx ?? 0.5) * w - sw / 2))); }
        const cv = document.createElement("canvas");
        cv.width = sw; cv.height = sh;
        cv.getContext("2d").drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);
        res({ data: cv.toDataURL("image/jpeg", 0.85), w: sw, h: sh });
      };
      img.onerror = () => res(null);
      img.src = dataUrl;
    });
  }

  function vdProgress(html) {
    const el = document.getElementById("vd-progress");
    if (el) { el.hidden = false; el.innerHTML = html; }
  }

  async function runVideoDraft() {
    if (!vd.file || !C.aiEndpoint) return;
    const passIn = document.getElementById("vd-pass");
    if (passIn) { if (!passIn.value.trim()) { toast("合言葉を入力してください"); passIn.focus(); return; } setPass(passIn.value.trim()); }
    const office = document.getElementById("vd-office").value;
    const note = document.getElementById("vd-note").value;
    if (office) pref.set({ office });
    document.querySelector(".vd-go").disabled = true;
    try {
      vdProgress(`<div class="spinner"></div><p>動画から場面を取り出しています…</p>`);
      const frames = await extractFrames(vd.url, vd.duration, (i, n) => vdProgress(`<div class="spinner"></div><p>動画から場面を取り出しています… <b>${i} / ${n}</b></p>`));
      if (frames.length < 3) throw new Error("frames");
      vdProgress(`<div class="spinner"></div><p><b>AIが場面を見て、手順をまとめています。</b><br>1〜3分かかります。画面を閉じずにお待ちください。</p>`);
      const res = await fetch(C.aiEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-App-Passcode": getPass() },
        body: JSON.stringify({ duration: vd.duration, office, note, frames: frames.map((f) => ({ t: f.t, data: f.ai })) }),
      });
      const j = await res.json().catch(() => ({}));
      if (res.status === 401) { setPass(""); throw new Error("合言葉がちがうようです。もう一度入力してください。"); }
      if (!res.ok || !j.draft) throw new Error(j.message || "AIの下書きを作れませんでした。");
      vdProgress(`<div class="spinner"></div><p>手順書にまとめています…</p>`);
      cur = await draftToManual(j.draft, frames, office, note);
      page = 0;
      await saveNow();
      if (vd.url) URL.revokeObjectURL(vd.url);
      vd.file = null; vd.url = null;
      renderEditor();
      toast("下書きができました。内容と写真を確認してください。", 4000);
    } catch (e) {
      console.error(e);
      const msg = e.message === "frames" ? "動画から場面を取り出せませんでした。別の動画でお試しください。"
        : e instanceof TypeError ? "AIにつながりませんでした。電波のよい所でもう一度お試しください。" : e.message;
      showVideo();
      vdProgress(`<div class="warn">${esc(msg)}</div>`);
    }
  }

  async function draftToManual(d, frames, office, note) {
    const m = newManual();
    const L = (a) => (Array.isArray(a) ? a : []).map((x) => String(x).trim()).filter(Boolean).join("\n");
    Object.assign(m, {
      office: office || m.office,
      major: C.majors.includes(d.major) ? d.major : "",
      category: d.category || "", title: d.title || "",
      purposeUser: d.purposeUser || "", purposeStaff: d.purposeStaff || "",
      precautions: L(d.precautions), point1: L(d.point1), point2: L(d.point2), point3: L(d.point3),
      memo: "この手順書は、作業の動画からAIが作った下書きです。内容を確認して直してください。",
      aiDraft: { at: Date.now(), summary: d.summary || "", privacy: d.privacyNotes || [], uncertain: d.uncertainNotes || [], dismissed: false },
    });
    const steps = [];
    for (const s of d.steps || []) {
      const st = newStep();
      Object.assign(st, { name: s.name || "", procedure: L(s.procedure), caution: L(s.caution), minutes: s.minutes > 0 ? String(s.minutes) : "" });
      const f = frames[s.photoFrame];
      if (f) {
        const c = await cropPhoto(f.photo, s.photoFocusX, s.photoFocusY);
        if (c) Object.assign(st, { photo: c.data, photoW: c.w, photoH: c.h });
      }
      st._branch = s.branch;
      steps.push(st);
    }
    if (!steps.length) steps.push(newStep());
    const idOf = (n) => (steps[Math.min(Math.max(1, n || 1), steps.length) - 1]).id;
    steps.forEach((st, i) => {
      const b = st._branch; delete st._branch;
      st.branch = b && b.use && i < steps.length - 1 ? { use: true, text: b.text || "", backId: idOf(b.backTo) } : { use: false, text: "", backId: "" };
    });
    m.steps = steps;
    const fc = d.finalCheck || {};
    m.check = fc.use ? { use: true, text: fc.text || "", backId: idOf(fc.backTo) } : { use: false, text: "", backId: steps[0].id };
    return m;
  }

  function aiBanner() {
    const a = cur && cur.aiDraft;
    if (!a || a.dismissed) return "";
    const li = (arr) => arr.map((t) => `<li>${esc(t)}</li>`).join("");
    return `
      <div class="ai-banner">
        <div class="ai-banner-ttl">✨ AIが動画から作った下書きです</div>
        <p>内容と写真を<b>必ず確認</b>して、現場のやり方に合わせて直してください。写真は「④ 各ステップ」で差し替え・削除できます。</p>
        ${a.privacy.length ? `<div class="ai-sub">⚠ 写真・個人情報の確認</div><ul>${li(a.privacy)}</ul>` : ""}
        ${a.uncertain.length ? `<div class="ai-sub">？ AIが映像だけでは判断できなかったこと</div><ul>${li(a.uncertain)}</ul>` : ""}
        <button class="btn btn-sm" data-act="ai-ok">確認しました（このお知らせを消す）</button>
      </div>`;
  }

  window.addEventListener("pagehide", () => { if (cur) saveNow(); });
  document.addEventListener("visibilitychange", () => { if (document.hidden && cur) saveNow(); });

  showHome();
})();
