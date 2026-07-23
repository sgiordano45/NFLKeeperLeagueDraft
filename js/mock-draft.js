// ─── Mock Draft Module ───
// Self-contained simulator. No Firebase writes. Read-only access to live State + Players.

const MockDraft = (() => {

  // ─── Constants ───
  const TOTAL_ROUNDS = 14;
  const TOTAL_PICKS  = TOTAL_ROUNDS * 12; // 12 teams

  // Position weight tables
  const QB_W = { have0: 0.9, have1: 0.3, have2: 0.0, afterR12: 0.5, default: 0.6 };
  const TE_W = { have0: 0.9, have1: 0.4, have2: 0.0, afterR12: 0.5, default: 0.7 };
  const RB_W = { default: 1.0, rbLag: 1.3 };
  const WR_W = { default: 1.0 };

  function _poolSize(round) {
    if (round <= 4) return 3;
    if (round <= 8) return 5;
    return 8;
  }

  // ─── Local State ───
  let mock = null;

  // ─── Public API ───

  function open() {
    if (!Auth.user && !Auth.isCommissioner()) {
      alert("You must be signed in to use Mock Draft.");
      return;
    }
    if (!Players.isLoaded() || Players.count() === 0) {
      alert("Player database not loaded yet. Please wait a moment and try again.");
      return;
    }
    _buildInitialState();
    _renderShell();
    document.getElementById("mock-draft-backdrop").classList.remove("hidden");
    document.getElementById("mock-draft-modal").classList.remove("hidden");
    _renderBoard();
    _advanceCPU();
  }

  function close() {
    document.getElementById("mock-draft-backdrop").classList.add("hidden");
    document.getElementById("mock-draft-modal").classList.add("hidden");
    mock = null;
  }

  function reset() {
    if (!mock && !Players.isLoaded()) return;
    _buildInitialState();
    _renderShell();
    _renderBoard();
    _advanceCPU();
  }

  // ─── State Builder ───

  function _buildInitialState() {
    const geoTeam = Auth.claimedTeam || null;

    // Clone real pick order — clear non-keeper players
    const picks = State.picks.map(p => ({
      overall:       p.overall,
      round:         p.round,
      pick:          p.pick,
      originalOwner: p.originalOwner,
      currentOwner:  p.currentOwner,
      isKeeper:      !!p.isKeeper,
      player:        (p.isKeeper && p.player) ? { ...p.player } : null,
    }));

    // Keeper name exclusion set
    const keeperNames = new Set(
      picks.filter(p => p.isKeeper && p.player).map(p => p.player.name.toUpperCase())
    );

    // Available pool — Players._db is ADP-sorted
    const available = Players.getAll()
      .filter(p => p.name && !keeperNames.has(p.name.toUpperCase()))
      .sort((a, b) => (parseFloat(a.adp) || 999) - (parseFloat(b.adp) || 999));

    // Per-team rosters pre-populated with keepers
    const teams = [...new Set(picks.map(p => p.currentOwner))];
    const rosters = Object.fromEntries(teams.map(t => [t, []]));
    picks
      .filter(p => p.isKeeper && p.player)
      .forEach(p => { if (rosters[p.currentOwner]) rosters[p.currentOwner].push(p.player); });

    const firstOpen = picks.findIndex(p => !p.player);

    mock = {
      picks,
      available,
      rosters,
      geoTeam,
      currentPickIndex: firstOpen === -1 ? TOTAL_PICKS : firstOpen,
      complete: firstOpen === -1,
    };
  }

  // ─── CPU Auto-Pick ───

  function _advanceCPU() {
    if (!mock || mock.complete) return;

    const pick = mock.picks[mock.currentPickIndex];
    if (!pick) { mock.complete = true; _renderBoard(); return; }

    if (pick.currentOwner === mock.geoTeam) {
      _renderBoard();
      return;
    }

    setTimeout(() => {
      if (!mock) return;
      _executeCPUPick(pick);
      mock.currentPickIndex++;
      if (mock.currentPickIndex >= TOTAL_PICKS) {
        mock.complete = true;
        _renderBoard();
        return;
      }
      _renderBoard();
      _advanceCPU();
    }, 400);
  }

  function _executeCPUPick(pick) {
    const team     = pick.currentOwner;
    const roster   = mock.rosters[team] || [];
    const round    = pick.round;
    const afterR12 = round > 12;
    const pool     = _poolSize(round);

    const counts = { QB: 0, RB: 0, WR: 0, TE: 0 };
    roster.forEach(p => {
      const pos = (p.pos || "").toUpperCase();
      if (counts[pos] !== undefined) counts[pos]++;
    });

    const scored = [];
    for (const player of mock.available) {
      const pos = (player.pos || "").toUpperCase();
      let weight = 0;

      if (pos === "QB") {
        if (!afterR12 && counts.QB >= 2) continue;
        if (counts.QB >= 3) continue;
        weight = afterR12        ? QB_W.afterR12
               : counts.QB === 0 ? QB_W.have0
               : counts.QB === 1 ? QB_W.have1
               : 0;
      } else if (pos === "TE") {
        if (!afterR12 && counts.TE >= 2) continue;
        if (counts.TE >= 3) continue;
        weight = afterR12        ? TE_W.afterR12
               : counts.TE === 0 ? TE_W.have0
               : counts.TE === 1 ? TE_W.have1
               : 0;
      } else if (pos === "RB") {
        weight = (counts.RB < counts.WR - 1) ? RB_W.rbLag : RB_W.default;
      } else if (pos === "WR") {
        weight = WR_W.default;
      } else {
        continue; // skip K, DEF
      }

      if (weight > 0) scored.push({ player, weight });
      if (scored.length >= 50) break; // cap scan at top 50 ADP
    }

    let chosen = null;
    if (scored.length > 0) {
      scored.sort((a, b) => b.weight - a.weight);
      const candidates = scored.slice(0, pool);
      chosen = candidates[Math.floor(Math.random() * candidates.length)].player;
    } else {
      chosen = mock.available[0] || null;
    }

    if (chosen) _assignPick(pick, chosen);
  }

  function _assignPick(pick, player) {
    pick.player = player;
    const team = pick.currentOwner;
    if (!mock.rosters[team]) mock.rosters[team] = [];
    mock.rosters[team].push(player);
    mock.available = mock.available.filter(p => p.name !== player.name);
  }

  // ─── User Pick ───

  function draftPlayer(playerName) {
    if (!mock || mock.complete) return;
    const pick = mock.picks[mock.currentPickIndex];
    if (!pick || pick.currentOwner !== mock.geoTeam) return;

    const player = mock.available.find(
      p => p.name.toLowerCase() === playerName.toLowerCase()
    );
    if (!player) { alert("Player not found or already drafted."); return; }

    _assignPick(pick, player);
    mock.currentPickIndex++;

    if (mock.currentPickIndex >= TOTAL_PICKS) {
      mock.complete = true;
      _renderBoard();
      return;
    }
    _renderBoard();
    _advanceCPU();
  }

  // ─── Render Shell (once per open/reset) ───

  function _renderShell() {
    document.getElementById("mock-draft-body").innerHTML = `
      <div class="mock-layout">
        <div id="mock-status" class="mock-status">Initializing…</div>
        <div class="mock-main">
          <div class="mock-left">
            <div class="mock-panel-title">Draft Board</div>
            <div id="mock-pick-log" class="mock-pick-log"></div>
          </div>
          <div class="mock-right">
            <div class="mock-panel-title">
              My Roster
              <span class="mock-team-name">${mock.geoTeam || "—"}</span>
            </div>
            <div id="mock-my-roster" class="mock-my-roster"></div>
            <div class="mock-panel-title mock-panel-title--ba">
              Best Available
              <span class="mock-ba-hint">click to draft</span>
            </div>
            <div id="mock-best-available" class="mock-best-available"></div>
          </div>
        </div>
        <div class="mock-search-row">
          <div class="mock-search-wrap">
            <input
              id="mock-search-input"
              class="mock-search-input"
              type="text"
              placeholder="Search player to draft…"
              autocomplete="off"
            />
            <div id="mock-autocomplete" class="mock-autocomplete hidden"></div>
          </div>
          <button id="mock-draft-btn" class="btn btn-gold" disabled>Draft</button>
        </div>
      </div>
    `;
    _attachEventListeners();
  }

  // ─── Render Board (live updates) ───

  function _renderBoard() {
    if (!mock) return;

    const statusEl = document.getElementById("mock-status");
    const logEl    = document.getElementById("mock-pick-log");
    const rosterEl = document.getElementById("mock-my-roster");
    const bestEl   = document.getElementById("mock-best-available");
    const inputEl  = document.getElementById("mock-search-input");
    const draftBtn = document.getElementById("mock-draft-btn");
    if (!statusEl) return;

    const currentPick = mock.picks[mock.currentPickIndex];
    const isMyTurn    = !mock.complete && currentPick?.currentOwner === mock.geoTeam;

    // Status
    if (mock.complete) {
      statusEl.textContent = "✓ Mock Draft Complete!";
      statusEl.className   = "mock-status mock-status--complete";
    } else if (currentPick) {
      statusEl.textContent = isMyTurn
        ? `Round ${currentPick.round}, Pick ${currentPick.pick} — YOUR PICK`
        : `Round ${currentPick.round}, Pick ${currentPick.pick} — ${currentPick.currentOwner} is picking…`;
      statusEl.className = `mock-status ${isMyTurn ? "mock-status--your-pick" : "mock-status--cpu"}`;
    }
    if (inputEl) inputEl.disabled = !isMyTurn;
    if (draftBtn) draftBtn.disabled = !isMyTurn;

    // Pick log
    const rounds = {};
    mock.picks.forEach(p => {
      if (!rounds[p.round]) rounds[p.round] = [];
      rounds[p.round].push(p);
    });

    logEl.innerHTML = Object.entries(rounds).map(([round, roundPicks]) => `
      <div class="mock-round">
        <div class="mock-round-label">Round ${round}</div>
        ${roundPicks.map(p => {
          const isGeo     = p.currentOwner === mock.geoTeam;
          const isCurrent = !mock.complete && currentPick?.overall === p.overall;
          const pos       = p.player ? (p.player.pos || "").toUpperCase() : "";
          const cls = ["mock-pick-row",
            isGeo     ? "mock-pick-row--geo"     : "",
            p.player  ? "mock-pick-row--filled"  : "",
            isCurrent ? "mock-pick-row--current" : "",
          ].filter(Boolean).join(" ");

          return `
            <div class="${cls}">
              <span class="mock-pick-slot">${p.overall}</span>
              <span class="mock-pick-team">${p.currentOwner}</span>
              <span class="mock-pick-player">
                ${p.isKeeper && p.player ? `<span class="mock-keeper-badge">K</span>` : ""}
                ${p.player
                  ? `<span class="pos-badge pos-${pos}">${pos}</span> ${p.player.name}`
                  : isCurrent
                    ? `<span class="mock-otc-indicator">▶ On the Clock</span>`
                    : `<span class="mock-pick-empty">—</span>`}
              </span>
            </div>`;
        }).join("")}
      </div>`).join("");

    logEl.querySelector(".mock-pick-row--current")
      ?.scrollIntoView({ block: "nearest", behavior: "smooth" });

    // My Roster
    const myRoster = mock.rosters[mock.geoTeam] || [];
    if (myRoster.length === 0) {
      rosterEl.innerHTML = `<div class="mock-empty">No picks yet</div>`;
    } else {
      const grouped = { QB: [], RB: [], WR: [], TE: [], Other: [] };
      myRoster.forEach(p => {
        const pos = (p.pos || "").toUpperCase();
        const key = grouped[pos] !== undefined ? pos : "Other";
        grouped[key].push(p);
      });
      rosterEl.innerHTML = Object.entries(grouped)
        .filter(([, arr]) => arr.length > 0)
        .map(([pos, players]) => `
          <div class="mock-roster-group">
            <div class="mock-roster-pos-label">${pos}</div>
            ${players.map(p => `
              <div class="mock-roster-player">
                <span class="pos-badge pos-${pos}">${pos}</span>
                ${p.name}
                ${p.team ? `<span class="mock-player-nfl">${p.team}</span>` : ""}
              </div>`).join("")}
          </div>`).join("");
    }

    // Best Available
    bestEl.innerHTML = mock.available.slice(0, 12).map((p, i) => {
      const pos = (p.pos || "").toUpperCase();
      return `
        <div class="mock-ba-row${isMyTurn ? " mock-ba-row--active" : ""}" data-name="${p.name}">
          <span class="mock-ba-rank">${i + 1}</span>
          <span class="pos-badge pos-${pos}">${pos}</span>
          <span class="mock-ba-name">${p.name}</span>
          ${p.team ? `<span class="mock-ba-nfl">${p.team}</span>` : ""}
        </div>`;
    }).join("");

    if (isMyTurn) {
      bestEl.querySelectorAll(".mock-ba-row").forEach(row => {
        row.addEventListener("click", () => draftPlayer(row.dataset.name));
      });
    }

    _renderAutocomplete();
  }

  // ─── Event Listeners ───

  function _attachEventListeners() {
    const input  = document.getElementById("mock-search-input");
    const btn    = document.getElementById("mock-draft-btn");
    const acEl   = document.getElementById("mock-autocomplete");

    input.addEventListener("input", _renderAutocomplete);

    input.addEventListener("keydown", e => {
      if (e.key === "Enter") {
        const first = acEl.querySelector(".mock-ac-item");
        if (first) {
          draftPlayer(first.dataset.name);
          input.value = "";
          acEl.classList.add("hidden");
        }
      }
      if (e.key === "Escape") acEl.classList.add("hidden");
    });

    btn.addEventListener("click", () => {
      const name = input.value.trim();
      if (!name) return;
      draftPlayer(name);
      input.value = "";
      acEl.classList.add("hidden");
    });

    // Close autocomplete on outside click
    document.addEventListener("click", e => {
      if (!e.target.closest(".mock-search-wrap")) {
        acEl?.classList.add("hidden");
      }
    });
  }

  function _renderAutocomplete() {
    const input = document.getElementById("mock-search-input");
    const acEl  = document.getElementById("mock-autocomplete");
    if (!input || !acEl || !mock) return;

    const query = input.value.trim().toLowerCase();
    if (!query || mock.complete) { acEl.classList.add("hidden"); return; }

    const currentPick = mock.picks[mock.currentPickIndex];
    if (currentPick?.currentOwner !== mock.geoTeam) { acEl.classList.add("hidden"); return; }

    const matches = mock.available
      .filter(p => p.name.toLowerCase().includes(query))
      .slice(0, 10);

    if (matches.length === 0) { acEl.classList.add("hidden"); return; }

    acEl.innerHTML = matches.map(p => {
      const pos = (p.pos || "").toUpperCase();
      return `
        <div class="mock-ac-item" data-name="${p.name}">
          <span class="pos-badge pos-${pos}">${pos}</span>
          <span class="mock-ac-name">${p.name}</span>
          ${p.team ? `<span class="mock-ac-nfl">${p.team}</span>` : ""}
        </div>`;
    }).join("");
    acEl.classList.remove("hidden");

    acEl.querySelectorAll(".mock-ac-item").forEach(item => {
      item.addEventListener("mousedown", e => {
        e.preventDefault();
        draftPlayer(item.dataset.name);
        input.value = "";
        acEl.classList.add("hidden");
      });
    });
  }

  return { open, close, reset };
})();
