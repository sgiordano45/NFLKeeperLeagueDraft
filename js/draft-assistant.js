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

const DraftAssistant = {
  // ─── State ───
  _open: false,
  _tab: "rankings",     // "rankings" | "flags" | "notes"
  _rankings: {},        // { playerName: { rank, tier } }
  _flags: {},           // { playerName: flag }
  _notes: {},           // { playerName: text }
  _loaded: false,
  _rankSort: "rank",    // "rank" | "name" | "pos" | "flag"

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

  // Encode player name for use as a Firebase key (replace disallowed chars)
  _key(name) {
    return name.replace(/\./g, ",").replace(/\//g, "|").replace(/\[/g, "(").replace(/\]/g, ")").replace(/#/g, "-");
  },

  _unkey(key) {
    return key.replace(/,/g, ".").replace(/\|/g, "/").replace(/\(/g, "[").replace(/\)/g, "]").replace(/-/g, "#");
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
    // Refresh board overlay now that data is loaded
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
    const suggHTML = suggestion ? `
      <div class="da-suggestion">
        <span class="da-suggestion-label">🎯 Best Available</span>
        <span class="da-suggestion-name">${UI.esc(suggestion.name)}</span>
        <span class="da-suggestion-meta">
          ${suggestion.flagEmoji ? suggestion.flagEmoji + " " : ""}
          ${suggestion.pos || ""}${suggestion.rank ? " · Rank #" + suggestion.rank : ""}
        </span>
        ${Auth.canDraftCurrentPick() ? `
          <button class="btn btn-sm btn-gold" style="margin-left:auto"
            onclick="DraftAssistant._draftPlayer('${UI.esc(suggestion.name)}', '${suggestion.pos || ''}')">
            Draft
          </button>` : ""}
      </div>
    ` : "";

    body.innerHTML = `
      <div class="da-tabs">${tabHTML}</div>
      ${suggHTML}
      <div class="da-content">${contentHTML}</div>
    `;
  },

  _setTab(tab) {
    this._tab = tab;
    this._renderPanel();
  },

  // ─── Rankings tab ───
  _renderRankings() {
    const playerList = this._getSortedRankings();
    const draftedPlayers = State.draftedPlayers().map(d => d.toUpperCase());

    const rowsHTML = playerList.length === 0
      ? `<div class="da-empty">No rankings yet. Upload a CSV or add players below.</div>`
      : playerList.map(p => {
          const isDrafted = draftedPlayers.some(d => d === p.name.toUpperCase());
          const flag = this._flags[p.name];
          const flagCfg = flag ? this.FLAGS[flag] : null;
          const note = this._notes[p.name];
          const dbInfo = Players.get(p.name);
          const pos = dbInfo ? dbInfo.pos : (p.pos || "");

          return `
            <div class="da-rank-row ${isDrafted ? "da-drafted" : ""}">
              <span class="da-rank-num">${p.rank}</span>
              <span class="da-rank-name">
                ${UI.esc(p.name)}
                ${pos ? `<span class="da-rank-pos pos-${pos.toLowerCase()}">${pos}</span>` : ""}
                ${isDrafted ? `<span class="da-drafted-tag">DRAFTED</span>` : ""}
              </span>
              <div class="da-rank-actions">
                ${this._flagSelector(p.name, flag)}
                ${!isDrafted && Auth.canDraftCurrentPick() ? `
                  <button class="btn btn-sm btn-gold da-draft-btn"
                    onclick="DraftAssistant._draftPlayer('${UI.esc(p.name)}', '${pos}')">
                    Draft
                  </button>` : ""}
                <button class="da-remove-btn" onclick="DraftAssistant.removeRanking('${UI.esc(p.name)}')" title="Remove">&times;</button>
              </div>
              ${note ? `<div class="da-inline-note">${UI.esc(note)}</div>` : ""}
            </div>
          `;
        }).join("");

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
        ${rowsHTML}
      </div>
    `;
  },

  // ─── Flags tab ───
  _renderFlags() {
    const flagged = Object.entries(this._flags);
    if (flagged.length === 0) {
      return `<div class="da-empty">No flagged players yet.<br>Flag players from the Rankings tab or directly during the draft.</div>`;
    }

    const draftedPlayers = State.draftedPlayers().map(d => d.toUpperCase());

    // Group by flag type
    const groups = Object.keys(this.FLAGS);
    let html = "";

    groups.forEach(flagKey => {
      const cfg = this.FLAGS[flagKey];
      const players = flagged.filter(([, f]) => f === flagKey);
      if (players.length === 0) return;

      html += `<div class="da-flag-group">
        <div class="da-flag-group-header" style="color:${cfg.color}">${cfg.label} <span class="da-flag-count">${players.length}</span></div>`;

      players.forEach(([name]) => {
        const isDrafted = draftedPlayers.some(d => d === name.toUpperCase());
        const dbInfo = Players.get(name);
        const pos = dbInfo ? dbInfo.pos : "";
        const rank = this._rankings[name];

        html += `<div class="da-flag-row ${isDrafted ? "da-drafted" : ""}">
          <span class="da-flag-player-name">
            ${UI.esc(name)}
            ${pos ? `<span class="da-rank-pos pos-${pos.toLowerCase()}">${pos}</span>` : ""}
            ${rank ? `<span class="da-flag-rank">#${rank.rank}</span>` : ""}
            ${isDrafted ? `<span class="da-drafted-tag">DRAFTED</span>` : ""}
          </span>
          <div class="da-rank-actions">
            ${this._flagSelector(name, flagKey)}
            ${!isDrafted && Auth.canDraftCurrentPick() ? `
              <button class="btn btn-sm btn-gold da-draft-btn"
                onclick="DraftAssistant._draftPlayer('${UI.esc(name)}', '${pos}')">
                Draft
              </button>` : ""}
          </div>
        </div>`;
      });

      html += `</div>`;
    });

    return html;
  },

  // ─── Notes tab ───
  _renderNotes() {
    const allPlayers = new Set([
      ...Object.keys(this._rankings),
      ...Object.keys(this._flags),
      ...Object.keys(this._notes),
    ]);

    if (allPlayers.size === 0) {
      return `<div class="da-empty">Add notes to players from the Rankings or Flags tabs.</div>`;
    }

    const rows = [...allPlayers].sort().map(name => {
      const note = this._notes[name] || "";
      const flag = this._flags[name];
      const flagEmoji = flag ? this.FLAGS[flag]?.emoji : "";
      return `
        <div class="da-note-row">
          <div class="da-note-header">
            ${flagEmoji ? `<span>${flagEmoji}</span>` : ""}
            <span class="da-note-player">${UI.esc(name)}</span>
          </div>
          <textarea class="da-note-input" rows="2"
            placeholder="Add a note…"
            onblur="DraftAssistant.saveNote('${UI.esc(name)}', this.value)"
          >${UI.esc(note)}</textarea>
        </div>
      `;
    }).join("");

    return `<div class="da-notes-list">${rows}</div>`;
  },

  // ─── Flag selector widget ───
  _flagSelector(playerName, currentFlag) {
    const safeKey = UI.esc(playerName);
    const opts = Object.entries(this.FLAGS).map(([key, cfg]) => `
      <button class="da-flag-btn ${currentFlag === key ? "da-flag-active" : ""}"
        title="${cfg.label}"
        onclick="DraftAssistant.setFlag('${safeKey}', '${key}')">
        ${cfg.emoji}
      </button>
    `).join("");

    const clearBtn = currentFlag
      ? `<button class="da-flag-btn da-flag-clear" title="Clear flag"
          onclick="DraftAssistant.clearFlag('${safeKey}')">✕</button>`
      : "";

    return `<div class="da-flag-selector">${opts}${clearBtn}</div>`;
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

  async saveNote(playerName, text) {
    this._notes[playerName] = text;
    await this._saveNote(playerName, text);
    // No full re-render needed for notes blur
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

    // Merge into existing rankings
    result.rankings.forEach(r => {
      this._rankings[r.name] = { rank: r.rank, tier: r.tier || null, pos: r.pos || null };
    });

    // Batch save
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

    // Reset the file input
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

    // Sort by rank ascending
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
    // Auto-fill rank as next available
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
      const flagOrder = { mustHave: 0, want: 1, interested: 2, avoid: 3, undefined: 4 };
      list.sort((a, b) => (flagOrder[this._flags[a.name]] ?? 4) - (flagOrder[this._flags[b.name]] ?? 4) || a.rank - b.rank);
    }

    return list;
  },

  // ─── Best Available Suggestion ───
  _getBestAvailable() {
    if (Object.keys(this._rankings).length === 0 && Object.keys(this._flags).length === 0) return null;

    const drafted = State.draftedPlayers().map(d => d.toUpperCase());
    const isDrafted = name => drafted.some(d => d === name.toUpperCase());

    // Pool: all ranked players + flagged must-have/want players not yet in rankings
    const pool = new Map();

    Object.entries(this._rankings).forEach(([name, data]) => {
      if (!isDrafted(name) && this._flags[name] !== "avoid") {
        pool.set(name, { name, rank: data.rank || 999, pos: data.pos || Players.get(name)?.pos || "" });
      }
    });

    // Include flagged players not in rankings
    Object.entries(this._flags).forEach(([name, flag]) => {
      if (!pool.has(name) && !isDrafted(name) && (flag === "mustHave" || flag === "want")) {
        pool.set(name, { name, rank: 9999, pos: Players.get(name)?.pos || "" });
      }
    });

    if (pool.size === 0) return null;

    // Sort by flag priority first, then rank
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
    // Close assistant panel
    this.close();
    // Open draft modal pre-filled
    const pickIndex = this._selectedPickIndex != null ? this._selectedPickIndex : State.currentPickIndex;
    Modals.openDraftAt(pickIndex !== -1 ? pickIndex : State.currentPickIndex);
    // Pre-fill input after modal renders
    setTimeout(() => {
      const input = document.getElementById("draft-player-input");
      if (input) {
        input.value = formatted;
        Modals.onDraftSearch(name);
        // Auto-select if found in results
        setTimeout(() => {
          const results = Modals._draftResults;
          const idx = results.findIndex(r => r.name.toUpperCase() === name.toUpperCase());
          if (idx >= 0) Modals.selectDraftPlayer(idx);
        }, 100);
      }
    }, 80);
  },

  // Keep track of pick index for direct draft
  _selectedPickIndex: null,

  // ─── Board Overlay ───
  // Inject flag indicators onto pick cells — only visible to the flagging user
  renderBoardOverlay() {
    if (!Auth.user || !this._loaded) return;

    // Remove any existing overlays
    document.querySelectorAll(".da-board-flag").forEach(el => el.remove());

    const flaggedNames = Object.keys(this._flags);
    if (flaggedNames.length === 0) return;

    // Build a lookup: clean uppercase name → flag
    const flagMap = {};
    flaggedNames.forEach(name => {
      flagMap[name.toUpperCase()] = this._flags[name];
    });

    // Walk all filled pick cells
    State.picks.forEach((pick, idx) => {
      if (!pick.player) return;
      const cleanName = pick.player.replace(/,\s*(QB|RB|WR|TE|K|DEF|DST)\s*$/i, "").trim().toUpperCase();
      const flag = flagMap[cleanName];
      if (!flag) return;

      const cfg = this.FLAGS[flag];
      if (!cfg) return;

      // Find the pick's DOM element
      // Board cells are rendered in round/team order — we find by data that's in the inner div
      // The pick-overall span uniquely identifies the cell
      const cells = document.querySelectorAll(".pick.is-filled");
      cells.forEach(cell => {
        const overallEl = cell.querySelector(".pick-overall");
        if (overallEl && parseInt(overallEl.textContent) === pick.overall) {
          // Don't double-add
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
  // Called by Modals.onDraftSearch to annotate search results with private flags
  injectFlags(resultsHTML, results) {
    if (!Auth.user || !this._loaded || Object.keys(this._flags).length === 0) return resultsHTML;

    // Rebuild each result item with flag indicator injected
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
    // Listen for state changes to refresh suggestion + overlay
    State.onChange(() => {
      if (this._open) this._renderPanel();
      if (this._loaded) this.renderBoardOverlay();
    });
  },
};

// ─── Boot ───
document.addEventListener("DOMContentLoaded", () => {
  DraftAssistant.init();
});
