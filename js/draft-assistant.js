// ─── Draft Assistant ───
// Private per-user draft workspace. Only the authenticated user can see their own data.
// Firebase path: draftAssistant/{uid}/  (security rules lock to auth.uid === $uid)
//
// Data shape:
//   rankings/  { playerName: { rank, tier } }  — from CSV upload or manual entry
//   flags/     { playerName: "mustHave"|"want"|"interested"|"avoid" }
//   notes/     { playerName: "text..." }
//
// Board overlay: flag emoji shown on pick cells, visible only to the flagging user.
// Search overlay: flag badges injected into the draft autocomplete results.
//
// IMPORTANT: Player names are never embedded in onclick attribute strings.
// Instead we use a _playerIndex registry so onclick uses a safe integer index,
// avoiding breakage from apostrophes, quotes, or other special chars in names.

const DraftAssistant = {
  // ─── State ───
  _open: false,
  _tab: "rankings",     // "rankings" | "flags" | "notes"
  _rankings: {},        // { playerName: { rank, tier } }
  _flags: {},           // { playerName: flag }
  _notes: {},           // { playerName: text }
  _loaded: false,
  _rankSort: "rank",    // "rank" | "name" | "pos" | "flag"

  // Render-time player name index — maps integer → player name.
  // Rebuilt each render so onclick handlers use _pi(n) instead of raw strings.
  _playerIndex: [],

  // Register a player name and return its index
  _pi(name) {
    let idx = this._playerIndex.indexOf(name);
    if (idx === -1) {
      idx = this._playerIndex.length;
      this._playerIndex.push(name);
    }
    return idx;
  },

  // Retrieve player name from index (called from onclick)
  _pn(idx) {
    return this._playerIndex[idx] || null;
  },

  // Flag config
  FLAGS: {
    mustHave:    { label: "🔴 Must Have",   emoji: "🔴", color: "#e63946", short: "MUST" },
    want:        { label: "🟡 Want",         emoji: "🟡", color: "#ffc107", short: "WANT" },
    interested:  { label: "🟢 Interested",  emoji: "🟢", color: "#2a9d8f", short: "INT"  },
    avoid:       { label: "⛔ Avoid",        emoji: "⛔", color: "#555a66", short: "AVOD" },
  },

  // ─── Firebase helpers ───
  _uid() {
    return Auth.user ? Auth.user.uid : null;
  },

  _ref(sub = "") {
    const uid = this._uid();
    if (!uid) return null;
    return window.db.ref(`draftAssistant/${uid}${sub}`);
  },

  // Encode player name for use as a Firebase key (replace Firebase-disallowed chars).
  // Firebase forbids: . # $ [ ] /
  // We do NOT encode dash (-) since it appears naturally in names like Amon-Ra.
  // # is rare in player names but must be encoded; we use a tilde (~) as stand-in.
  _key(name) {
    return name
      .replace(/~/g, "~~")      // escape literal tildes first
      .replace(/\./g, "~d")    // . → ~d
      .replace(/\//g, "~s")    // / → ~s
      .replace(/\[/g, "~l")    // [ → ~l
      .replace(/\]/g, "~r")    // ] → ~r
      .replace(/#/g,  "~h");   // # → ~h
  },

  _unkey(key) {
    return key
      .replace(/~h/g, "#")
      .replace(/~r/g, "]")
      .replace(/~l/g, "[")
      .replace(/~s/g, "/")
      .replace(/~d/g, ".")
      .replace(/~~/g, "~");
  },

  // ─── Load from Firebase ───
  async load() {
    const ref = this._ref();
    if (!ref) return;
    try {
      const snap = await ref.once("value");
      const data = snap.val() || {};
      // Decode keys back to player names
      this._rankings = this._decodeKeys(data.rankings || {});
      this._flags = this._decodeKeys(data.flags || {});
      this._notes = this._decodeKeys(data.notes || {});
      this._loaded = true;
    } catch (e) {
      console.error("DraftAssistant load failed:", e);
    }
  },

  _decodeKeys(obj) {
    const out = {};
    Object.entries(obj).forEach(([k, v]) => { out[this._unkey(k)] = v; });
    return out;
  },

  // ─── Persist individual keys ───
  async _saveFlag(playerName, flag) {
    const ref = this._ref(`/flags/${this._key(playerName)}`);
    if (!ref) return;
    if (flag === null) {
      await ref.remove();
    } else {
      await ref.set(flag);
    }
  },

  async _saveNote(playerName, text) {
    const ref = this._ref(`/notes/${this._key(playerName)}`);
    if (!ref) return;
    if (!text.trim()) {
      await ref.remove();
    } else {
      await ref.set(text.trim());
    }
  },

  async _saveRanking(playerName, data) {
    const ref = this._ref(`/rankings/${this._key(playerName)}`);
    if (!ref) return;
    if (data === null) {
      await ref.remove();
    } else {
      await ref.set(data);
    }
  },

  // ─── Toggle panel ───
  toggle() {
    this._open ? this.close() : this.open();
  },

  async open() {
    if (!Auth.user) return;
    this._open = true;
    if (!this._loaded) await this.load();
    this._renderPanel();
    document.getElementById("da-panel").classList.add("is-open");
    document.getElementById("da-overlay").classList.remove("hidden");
    this.renderBoardOverlay();
  },

  close() {
    this._open = false;
    document.getElementById("da-panel").classList.remove("is-open");
    document.getElementById("da-overlay").classList.add("hidden");
  },

  // ─── Render panel ───
  _renderPanel() {
    const body = document.getElementById("da-body");
    if (!body) return;

    // Reset player index at the start of each render
    this._playerIndex = [];

    const tabs = [
      { id: "rankings", label: "📋 Rankings" },
      { id: "flags",    label: "🚩 Flagged"  },
      { id: "notes",    label: "📝 Notes"     },
    ];

    const tabHTML = tabs.map(t => `
      <button class="da-tab ${this._tab === t.id ? "da-tab-active" : ""}"
        onclick="DraftAssistant._setTab('${t.id}')">${t.label}</button>
    `).join("");

    let contentHTML = "";
    if (this._tab === "rankings") contentHTML = this._renderRankings();
    else if (this._tab === "flags") contentHTML = this._renderFlags();
    else if (this._tab === "notes") contentHTML = this._renderNotes();

    // Best available suggestion strip
    const suggestion = this._getBestAvailable();
    const suggHTML = suggestion ? (() => {
      const pi = this._pi(suggestion.name);
      const draftBtn = Auth.canDraftCurrentPick()
        ? `<button class="btn btn-sm btn-gold" style="margin-left:auto"
             onclick="DraftAssistant._draftByIndex(${pi})">Draft</button>`
        : "";
      return `
        <div class="da-suggestion">
          <span class="da-suggestion-label">🎯 Best Available</span>
          <span class="da-suggestion-name">${UI.esc(suggestion.name)}</span>
          <span class="da-suggestion-meta">
            ${suggestion.flagEmoji ? suggestion.flagEmoji + " " : ""}
            ${suggestion.pos || ""}${suggestion.rank ? " · Rank #" + suggestion.rank : ""}
          </span>
          ${draftBtn}
        </div>
      `;
    })() : "";

    body.innerHTML = `
      <div class="da-tabs">
        ${tabHTML}
        <button class="da-reset-btn" onclick="DraftAssistant.resetAll()" title="Clear all flags, notes, and rankings">↺ Reset</button>
      </div>
      ${suggHTML}
      <div class="da-content">${contentHTML}</div>
    `;

    // Wire up note textareas via event listeners (avoids any inline string issues)
    body.querySelectorAll(".da-note-input[data-pi]").forEach(el => {
      const pi = parseInt(el.dataset.pi);
      el.addEventListener("blur", () => {
        const name = this._pn(pi);
        if (name !== null) this.saveNote(name, el.value);
      });
    });
  },

  _setTab(tab) {
    this._tab = tab;
    this._renderPanel();
  },

  // ─── Rankings tab ───
  _renderRankings() {
    const playerList = this._getSortedRankings();
    const drafted = this._getDraftedSet();

    const rowsHTML = playerList.length === 0
      ? `<div class="da-empty">No rankings yet. Upload a CSV or add players below.</div>`
      : playerList.map(p => {
          const isDrafted = drafted.has(p.name.toUpperCase());
          // #2: skip drafted players entirely to reduce clutter
          if (isDrafted) return "";

          const flag = this._flags[p.name];
          const note = this._notes[p.name];
          const dbInfo = Players.get(p.name);
          const pos = dbInfo ? dbInfo.pos : (p.pos || "");
          const pi = this._pi(p.name);

          const draftBtn = Auth.canDraftCurrentPick()
            ? `<button class="btn btn-sm btn-gold da-draft-btn"
                 onclick="DraftAssistant._draftByIndex(${pi})">Draft</button>`
            : "";

          return `
            <div class="da-rank-row">
              <span class="da-rank-num">${p.rank}</span>
              <span class="da-rank-name">
                ${UI.esc(p.name)}
                ${pos ? `<span class="da-rank-pos pos-${pos.toLowerCase()}">${pos}</span>` : ""}
              </span>
              <div class="da-rank-actions">
                ${this._flagSelector(p.name, flag, pi)}
                ${draftBtn}
                <button class="da-remove-btn" onclick="DraftAssistant._removeByIndex(${pi})" title="Remove">&times;</button>
              </div>
              ${note ? `<div class="da-inline-note">${UI.esc(note)}</div>` : ""}
            </div>
          `;
        }).join("");

    const isEmpty = rowsHTML.trim() === "";

    // Sort controls
    const sortOpts = [
      { v: "rank", l: "By Rank" },
      { v: "pos",  l: "By Position" },
      { v: "flag", l: "By Flag" },
      { v: "name", l: "A–Z" },
    ];
    const sortHTML = sortOpts.map(s =>
      `<button class="da-sort-btn ${this._rankSort === s.v ? "da-sort-active" : ""}"
        onclick="DraftAssistant._setSort('${s.v}')">${s.l}</button>`
    ).join("");

    return `
      <div class="da-upload-section">
        <label class="da-upload-label">
          📤 Upload Rankings CSV
          <input type="file" accept=".csv" style="display:none" onchange="DraftAssistant.uploadCSV(this)" />
        </label>
        <span class="da-upload-hint">Columns: rank, name, pos (optional: tier, team, bye, adp)</span>
      </div>

      <div class="da-manual-add">
        <input class="form-input" id="da-add-input" placeholder="Add player by name…"
          oninput="DraftAssistant._onAddSearch(this.value)"
          onkeydown="if(event.key==='Enter') DraftAssistant.addManual()" />
        <div id="da-add-autocomplete" class="draft-autocomplete hidden"></div>
        <input class="form-input da-rank-input" id="da-add-rank" type="number" placeholder="Rank" min="1" />
        <button class="btn btn-sm btn-success" onclick="DraftAssistant.addManual()">Add</button>
      </div>

      <div class="da-sort-bar">${sortHTML}</div>

      <div class="da-rank-list">
        ${isEmpty ? `<div class="da-empty">All ranked players have been drafted!</div>` : rowsHTML}
      </div>
    `;
  },

  // ─── Flags tab ───
  _renderFlags() {
    const flagged = Object.entries(this._flags);
    if (flagged.length === 0) {
      return `<div class="da-empty">No flagged players yet.<br>Flag players from the Rankings tab or directly during the draft.</div>`;
    }

    const drafted = this._getDraftedSet();
    const groups = Object.keys(this.FLAGS);
    let html = "";

    groups.forEach(flagKey => {
      const cfg = this.FLAGS[flagKey];
      // #2: filter out drafted players
      const players = flagged.filter(([name, f]) => f === flagKey && !drafted.has(name.toUpperCase()));
      if (players.length === 0) return;

      html += `<div class="da-flag-group">
        <div class="da-flag-group-header" style="color:${cfg.color}">${cfg.label} <span class="da-flag-count">${players.length}</span></div>`;

      players.forEach(([name]) => {
        const dbInfo = Players.get(name);
        const pos = dbInfo ? dbInfo.pos : "";
        const rank = this._rankings[name];
        const pi = this._pi(name);

        const draftBtn = Auth.canDraftCurrentPick()
          ? `<button class="btn btn-sm btn-gold da-draft-btn"
               onclick="DraftAssistant._draftByIndex(${pi})">Draft</button>`
          : "";

        html += `<div class="da-flag-row">
          <span class="da-flag-player-name">
            ${UI.esc(name)}
            ${pos ? `<span class="da-rank-pos pos-${pos.toLowerCase()}">${pos}</span>` : ""}
            ${rank ? `<span class="da-flag-rank">#${rank.rank}</span>` : ""}
          </span>
          <div class="da-rank-actions">
            ${this._flagSelector(name, flagKey, pi)}
            ${draftBtn}
          </div>
        </div>`;
      });

      html += `</div>`;
    });

    if (!html) {
      html = `<div class="da-empty">All flagged players have been drafted!</div>`;
    }

    return html;
  },

  // ─── Notes tab ───
  _renderNotes() {
    const drafted = this._getDraftedSet();

    // Collect all players with notes or flags, sorted by rank then alpha
    const allPlayers = new Set([
      ...Object.keys(this._rankings),
      ...Object.keys(this._flags),
      ...Object.keys(this._notes),
    ]);

    // #2: filter out drafted players
    // #1: sort by rank (fallback to alpha for players without a rank)
    const sorted = [...allPlayers]
      .filter(name => !drafted.has(name.toUpperCase()))
      .sort((a, b) => {
        const ra = this._rankings[a]?.rank ?? 9999;
        const rb = this._rankings[b]?.rank ?? 9999;
        if (ra !== rb) return ra - rb;
        return a.localeCompare(b);
      });

    if (sorted.length === 0) {
      return `<div class="da-empty">No players to show notes for.<br>All have been drafted, or none added yet.</div>`;
    }

    const rows = sorted.map(name => {
      const note = this._notes[name] || "";
      const flag = this._flags[name];
      const flagEmoji = flag ? this.FLAGS[flag]?.emoji : "";
      const rank = this._rankings[name]?.rank;
      const pi = this._pi(name);

      // Use data-pi attribute + event listener wired up in _renderPanel
      return `
        <div class="da-note-row">
          <div class="da-note-header">
            ${flagEmoji ? `<span>${flagEmoji}</span>` : ""}
            <span class="da-note-player">${UI.esc(name)}</span>
            ${rank ? `<span class="da-flag-rank">#${rank}</span>` : ""}
          </div>
          <textarea class="da-note-input" rows="2" data-pi="${pi}"
            placeholder="Add a note…"
          >${UI.esc(note)}</textarea>
        </div>
      `;
    }).join("");

    return `<div class="da-notes-list">${rows}</div>`;
  },

  // ─── Flag selector widget ───
  // Uses integer index instead of player name in onclick to handle apostrophes safely
  _flagSelector(playerName, currentFlag, pi) {
    const opts = Object.entries(this.FLAGS).map(([key, cfg]) => `
      <button class="da-flag-btn ${currentFlag === key ? "da-flag-active" : ""}"
        title="${cfg.label}"
        onclick="DraftAssistant._setFlagByIndex(${pi}, '${key}')">
        ${cfg.emoji}
      </button>
    `).join("");

    const clearBtn = currentFlag
      ? `<button class="da-flag-btn da-flag-clear" title="Clear flag"
          onclick="DraftAssistant._clearFlagByIndex(${pi})">✕</button>`
      : "";

    return `<div class="da-flag-selector">${opts}${clearBtn}</div>`;
  },

  // ─── Index-based public action wrappers (called from onclick) ───

  _setFlagByIndex(pi, flag) {
    const name = this._pn(pi);
    if (name !== null) this.setFlag(name, flag);
  },

  _clearFlagByIndex(pi) {
    const name = this._pn(pi);
    if (name !== null) this.clearFlag(name);
  },

  _removeByIndex(pi) {
    const name = this._pn(pi);
    if (name !== null) this.removeRanking(name);
  },

  _draftByIndex(pi) {
    const name = this._pn(pi);
    if (name === null) return;
    const dbInfo = Players.get(name);
    const pos = dbInfo ? dbInfo.pos : "";
    this._draftPlayer(name, pos);
  },

  // ─── Public actions ───

  async setFlag(playerName, flag) {
    this._flags[playerName] = flag;
    await this._saveFlag(playerName, flag);
    this._renderPanel();
    this.renderBoardOverlay();
  },

  async clearFlag(playerName) {
    delete this._flags[playerName];
    await this._saveFlag(playerName, null);
    this._renderPanel();
    this.renderBoardOverlay();
  },

  async resetAll() {
    if (!confirm("Clear all your flags, notes, and rankings? This cannot be undone.")) return;
    const ref = this._ref();
    if (!ref) return;
    try {
      await ref.remove();
    } catch (e) {
      console.error("DraftAssistant reset failed:", e);
      return;
    }
    this._rankings = {};
    this._flags = {};
    this._notes = {};
    this._renderPanel();
    this.renderBoardOverlay();
  },

  async saveNote(playerName, text) {
    this._notes[playerName] = text;
    await this._saveNote(playerName, text);
  },

  async removeRanking(playerName) {
    delete this._rankings[playerName];
    await this._saveRanking(playerName, null);
    this._renderPanel();
  },

  addManual() {
    const nameInput = document.getElementById("da-add-input");
    const rankInput = document.getElementById("da-add-rank");
    if (!nameInput) return;

    let name = nameInput.value.trim();
    const rank = parseInt(rankInput?.value) || (Object.keys(this._rankings).length + 1);
    if (!name) return;

    // Strip ", POS" suffix if pasted from draft board
    name = name.replace(/,\s*(QB|RB|WR|TE|K|DEF|DST)\s*$/i, "").trim();

    const dbPlayer = Players.get(name);
    this._rankings[name] = { rank, tier: null, pos: dbPlayer ? dbPlayer.pos : null };
    this._saveRanking(name, this._rankings[name]);

    nameInput.value = "";
    if (rankInput) rankInput.value = "";
    document.getElementById("da-add-autocomplete")?.classList.add("hidden");
    this._renderPanel();
  },

  // ─── CSV Upload ───
  async uploadCSV(input) {
    const file = input?.files?.[0];
    if (!file) return;
    const text = await file.text();
    const result = this._parseRankingsCSV(text);

    if (result.error) {
      alert("CSV Error: " + result.error);
      return;
    }

    result.rankings.forEach(r => {
      this._rankings[r.name] = { rank: r.rank, tier: r.tier || null, pos: r.pos || null };
    });

    const ref = this._ref("/rankings");
    if (!ref) return;
    const encoded = {};
    Object.entries(this._rankings).forEach(([name, data]) => {
      encoded[this._key(name)] = data;
    });
    try {
      await ref.set(encoded);
    } catch (e) {
      console.error("Failed to save rankings:", e);
    }

    input.value = "";
    this._tab = "rankings";
    this._renderPanel();
    this.renderBoardOverlay();
  },

  _parseRankingsCSV(text) {
    const lines = text.split(/\r?\n/).filter(l => l.trim());
    if (lines.length < 2) return { rankings: [], error: "CSV must have a header row and at least one data row." };

    const headers = lines[0].split(",").map(h => h.toLowerCase().trim().replace(/"/g, ""));

    const findCol = (aliases) => {
      for (const a of aliases) {
        const idx = headers.indexOf(a);
        if (idx >= 0) return idx;
      }
      return -1;
    };

    const rankCol = findCol(["rank", "rk", "#", "overall", "adp"]);
    const nameCol = findCol(["name", "player", "player_name", "playername"]);
    const posCol  = findCol(["pos", "position"]);
    const tierCol = findCol(["tier"]);

    if (nameCol === -1) return { rankings: [], error: "Could not find a 'Name' or 'Player' column." };

    const rankings = [];
    for (let i = 1; i < lines.length; i++) {
      const cols = lines[i].split(",").map(c => c.trim().replace(/"/g, ""));
      const name = cols[nameCol];
      if (!name) continue;
      rankings.push({
        name,
        rank: rankCol >= 0 ? (parseFloat(cols[rankCol]) || i) : i,
        pos:  posCol  >= 0 ? (cols[posCol] || "").toUpperCase() : null,
        tier: tierCol >= 0 ? (parseInt(cols[tierCol]) || null) : null,
      });
    }

    rankings.sort((a, b) => a.rank - b.rank);
    return { rankings };
  },

  // ─── Add-player autocomplete ───
  _addAutoIdx: -1,
  _addResults: [],

  _onAddSearch(query) {
    const ac = document.getElementById("da-add-autocomplete");
    if (!ac) return;

    if (!query || query.length < 2) {
      ac.classList.add("hidden");
      this._addResults = [];
      return;
    }

    this._addResults = Players.search(query, 8);
    if (this._addResults.length === 0) {
      ac.innerHTML = `<div class="ac-empty">No players found</div>`;
      ac.classList.remove("hidden");
      return;
    }

    ac.innerHTML = this._addResults.map((p, i) => `
      <div class="ac-item" onmousedown="DraftAssistant._selectAddPlayer(${i})">
        <span class="ac-name">${UI.esc(p.name)}</span>
        <span class="ac-meta">
          <span class="player-pos-badge pos-${p.pos.toLowerCase()}">${p.pos}</span>
          ${p.adp < 999 ? `<span class="ac-adp">ADP ${Math.round(p.adp)}</span>` : ""}
        </span>
      </div>
    `).join("");
    ac.classList.remove("hidden");
  },

  _selectAddPlayer(idx) {
    const p = this._addResults[idx];
    if (!p) return;
    const input = document.getElementById("da-add-input");
    if (input) input.value = p.name;
    document.getElementById("da-add-autocomplete")?.classList.add("hidden");
    this._addResults = [];
    const rankInput = document.getElementById("da-add-rank");
    if (rankInput && !rankInput.value) {
      rankInput.value = Object.keys(this._rankings).length + 1;
    }
  },

  // ─── Sort ───
  _setSort(sort) {
    this._rankSort = sort;
    this._renderPanel();
  },

  _getSortedRankings() {
    const list = Object.entries(this._rankings).map(([name, data]) => ({
      name,
      rank: data.rank || 999,
      tier: data.tier,
      pos: data.pos || (Players.get(name)?.pos) || "",
    }));

    if (this._rankSort === "rank")  list.sort((a, b) => a.rank - b.rank);
    else if (this._rankSort === "name") list.sort((a, b) => a.name.localeCompare(b.name));
    else if (this._rankSort === "pos")  list.sort((a, b) => (a.pos || "ZZZ").localeCompare(b.pos || "ZZZ") || a.rank - b.rank);
    else if (this._rankSort === "flag") {
      const flagOrder = { mustHave: 0, want: 1, interested: 2, avoid: 3 };
      list.sort((a, b) => (flagOrder[this._flags[a.name]] ?? 4) - (flagOrder[this._flags[b.name]] ?? 4) || a.rank - b.rank);
    }

    return list;
  },

  // ─── Drafted player set (uppercase, stripped of ", POS" suffix) ───
  _getDraftedSet() {
    const drafted = State.draftedPlayers();
    const set = new Set();
    drafted.forEach(d => {
      set.add(d.toUpperCase());
      // Also add the clean name without ", POS" suffix
      set.add(d.replace(/,\s*(QB|RB|WR|TE|K|DEF|DST)\s*$/i, "").trim().toUpperCase());
    });
    return set;
  },

  // ─── Best Available Suggestion ───
  _getBestAvailable() {
    if (Object.keys(this._rankings).length === 0 && Object.keys(this._flags).length === 0) return null;

    const drafted = this._getDraftedSet();
    const isDrafted = name => drafted.has(name.toUpperCase());

    const pool = new Map();

    Object.entries(this._rankings).forEach(([name, data]) => {
      if (!isDrafted(name) && this._flags[name] !== "avoid") {
        pool.set(name, { name, rank: data.rank || 999, pos: data.pos || Players.get(name)?.pos || "" });
      }
    });

    Object.entries(this._flags).forEach(([name, flag]) => {
      if (!pool.has(name) && !isDrafted(name) && (flag === "mustHave" || flag === "want")) {
        pool.set(name, { name, rank: 9999, pos: Players.get(name)?.pos || "" });
      }
    });

    if (pool.size === 0) return null;

    const flagPriority = { mustHave: 0, want: 1, interested: 2 };
    const sorted = [...pool.values()].sort((a, b) => {
      const fa = flagPriority[this._flags[a.name]] ?? 3;
      const fb = flagPriority[this._flags[b.name]] ?? 3;
      if (fa !== fb) return fa - fb;
      return a.rank - b.rank;
    });

    const best = sorted[0];
    const flag = this._flags[best.name];
    return {
      name: best.name,
      pos: best.pos,
      rank: best.rank < 9000 ? best.rank : null,
      flagEmoji: flag ? this.FLAGS[flag]?.emoji : null,
    };
  },

  // ─── Draft directly from assistant ───
  _draftPlayer(name, pos) {
    const formatted = pos ? `${name}, ${pos}` : name;
    this.close();
    const pickIndex = State.currentPickIndex;
    Modals.openDraftAt(pickIndex);
    setTimeout(() => {
      const input = document.getElementById("draft-player-input");
      if (input) {
        input.value = formatted;
        Modals.onDraftSearch(name);
        setTimeout(() => {
          const results = Modals._draftResults;
          const idx = results.findIndex(r => r.name.toUpperCase() === name.toUpperCase());
          if (idx >= 0) Modals.selectDraftPlayer(idx);
        }, 100);
      }
    }, 80);
  },

  // ─── Board Overlay ───
  renderBoardOverlay() {
    if (!Auth.user || !this._loaded) return;

    document.querySelectorAll(".da-board-flag").forEach(el => el.remove());

    const flaggedNames = Object.keys(this._flags);
    if (flaggedNames.length === 0) return;

    const flagMap = {};
    flaggedNames.forEach(name => {
      flagMap[name.toUpperCase()] = this._flags[name];
    });

    State.picks.forEach((pick) => {
      if (!pick.player) return;
      const cleanName = pick.player.replace(/,\s*(QB|RB|WR|TE|K|DEF|DST)\s*$/i, "").trim().toUpperCase();
      const flag = flagMap[cleanName];
      if (!flag) return;

      const cfg = this.FLAGS[flag];
      if (!cfg) return;

      document.querySelectorAll(".pick.is-filled").forEach(cell => {
        const overallEl = cell.querySelector(".pick-overall");
        if (overallEl && parseInt(overallEl.textContent) === pick.overall) {
          if (cell.querySelector(".da-board-flag")) return;
          const badge = document.createElement("span");
          badge.className = "da-board-flag";
          badge.textContent = cfg.emoji;
          badge.title = cfg.label;
          cell.appendChild(badge);
        }
      });
    });
  },

  // ─── Autocomplete flag injection ───
  injectFlags(resultsHTML, results) {
    if (!Auth.user || !this._loaded || Object.keys(this._flags).length === 0) return resultsHTML;

    return results.map((p, i) => {
      const flag = this._flags[p.name];
      const flagBadge = flag
        ? `<span class="da-ac-flag" title="${this.FLAGS[flag].label}">${this.FLAGS[flag].emoji}</span>`
        : "";
      const activeClass = i === Modals._draftAutoIdx ? "ac-active" : "";
      return `
        <div class="ac-item ${activeClass}"
          onmousedown="Modals.selectDraftPlayer(${i})"
          onmouseenter="Modals._draftAutoIdx=${i};Modals._highlightAC()">
          <span class="ac-name">${UI.esc(p.name)}${flagBadge}</span>
          <span class="ac-meta">
            <span class="player-pos-badge pos-${p.pos.toLowerCase()}">${p.pos === "DEF" ? "D/ST" : p.pos}</span>
            ${p.team ? `<span class="ac-team">${UI.esc(p.team)}</span>` : ""}
            ${p.bye ? `<span class="ac-bye">Bye ${p.bye}</span>` : ""}
            ${p.adp < 999 ? `<span class="ac-adp">ADP ${Math.round(p.adp)}</span>` : ""}
          </span>
        </div>
      `;
    }).join("");
  },

  // ─── Init ───
  init() {
    State.onChange(() => {
      if (this._open) this._renderPanel();
      if (this._loaded) this.renderBoardOverlay();
    });
  },
};

document.addEventListener("DOMContentLoaded", () => {
  DraftAssistant.init();
});
