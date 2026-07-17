// ─── Trade Analyzer ───
// Analyzes a pick swap by showing players with ADP near each pick number.
// Reads from Players._db (loaded from Firebase via players.js).
//
// Usage: TradeAnalyzer.open()

const TradeAnalyzer = (() => {

  const ADP_WINDOW = 3; // ±3 picks around each pick's overall number

  // ─── Public API ───
  function open() {
    _render();
    document.getElementById("trade-analyzer-backdrop").classList.remove("hidden");
  }

  function close() {
    document.getElementById("trade-analyzer-backdrop").classList.add("hidden");
  }

  // ─── Build & inject modal HTML ───
  function _render() {
    const old = document.getElementById("trade-analyzer-backdrop");
    if (old) old.remove();

    const backdrop = document.createElement("div");
    backdrop.id = "trade-analyzer-backdrop";
    backdrop.className = "modal-backdrop";
    backdrop.innerHTML = _modalHTML();

    backdrop.addEventListener("click", (e) => {
      if (e.target === backdrop) close();
    });

    document.body.appendChild(backdrop);

    document.getElementById("ta-analyze-btn").addEventListener("click", _analyze);

    backdrop.querySelectorAll(".ta-pick-input").forEach(inp => {
      inp.addEventListener("keydown", (e) => {
        if (e.key === "Enter") _analyze();
      });
    });
  }

  function _modalHTML() {
    return `
      <div class="modal" id="trade-analyzer-modal" style="width:680px;max-width:96vw">
        <div class="modal-header">
          <h2>Trade Analyzer</h2>
          <button class="modal-close" onclick="TradeAnalyzer.close()">×</button>
        </div>

        <p style="color:var(--text-secondary);font-size:13px;margin-bottom:16px">
          Enter overall pick numbers for each side. Players with ADP within
          ±${ADP_WINDOW} of each pick will appear.
        </p>

        <div class="ta-sides">
          <div class="ta-side">
            <div class="ta-side-label" style="color:var(--gold)">Side A — Giving</div>
            ${_pickInputRow("a", 0)}
            ${_pickInputRow("a", 1)}
            ${_pickInputRow("a", 2)}
            ${_pickInputRow("a", 3)}
          </div>

          <div class="ta-vs">VS</div>

          <div class="ta-side">
            <div class="ta-side-label" style="color:#64B5F6">Side B — Receiving</div>
            ${_pickInputRow("b", 0)}
            ${_pickInputRow("b", 1)}
            ${_pickInputRow("b", 2)}
            ${_pickInputRow("b", 3)}
          </div>
        </div>

        <button class="btn btn-gold btn-full mt-12" id="ta-analyze-btn">Analyze Trade</button>

        <div id="ta-results" class="ta-results hidden"></div>
      </div>
    `;
  }

  function _pickInputRow(side, idx) {
    const id = `ta-${side}-pick-${idx}`;
    return `
      <div class="form-group" style="margin-bottom:6px">
        <input
          type="number"
          id="${id}"
          class="form-input ta-pick-input"
          placeholder="Overall pick # (e.g. 16)"
          min="1"
          max="${CONFIG.NUM_TEAMS * CONFIG.NUM_ROUNDS}"
          style="font-size:13px;padding:7px 10px"
        />
      </div>
    `;
  }

  // ─── Core analysis ───
  function _analyze() {
    const sideA = _getInputs("a");
    const sideB = _getInputs("b");

    if (sideA.length === 0 && sideB.length === 0) {
      _showError("Enter at least one pick on each side.");
      return;
    }
    if (sideA.length === 0) { _showError("Side A has no picks entered."); return; }
    if (sideB.length === 0) { _showError("Side B has no picks entered."); return; }

    const playersLoaded = Players.isLoaded() && Players._db.length > 0;

    const resultsEl = document.getElementById("ta-results");
    resultsEl.classList.remove("hidden");

    let html = `<div class="ta-result-sides">`;

    html += `<div class="ta-result-side">`;
    html += `<div class="ta-result-side-label" style="color:var(--gold)">Side A — Giving</div>`;
    sideA.forEach(overall => {
      html += _pickCard(overall, playersLoaded, "gold");
    });
    html += `</div>`;

    html += `<div class="ta-result-side">`;
    html += `<div class="ta-result-side-label" style="color:#64B5F6">Side B — Receiving</div>`;
    sideB.forEach(overall => {
      html += _pickCard(overall, playersLoaded, "blue");
    });
    html += `</div>`;

    html += `</div>`;

    const aValue = _sideValue(sideA);
    const bValue = _sideValue(sideB);
    html += _valueSummary(aValue, bValue, sideA, sideB, playersLoaded);

    resultsEl.innerHTML = html;
    resultsEl.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  function _getInputs(side) {
    const picks = [];
    for (let i = 0; i < 4; i++) {
      const el = document.getElementById(`ta-${side}-pick-${i}`);
      const val = parseInt(el?.value, 10);
      if (!isNaN(val) && val >= 1) picks.push(val);
    }
    return picks;
  }

  // ─── Pick card HTML ───
  function _pickCard(overall, playersLoaded, accent) {
    const statePickInfo = _findPickInState(overall);
    const round = Math.ceil(overall / CONFIG.NUM_TEAMS);
    const pickInRound = ((overall - 1) % CONFIG.NUM_TEAMS) + 1;

    let headerExtra = "";
    if (statePickInfo) {
      const color = State.teamColor(statePickInfo.currentOwner);
      headerExtra = `<span style="color:${color};margin-left:6px;font-size:11px">${_esc(statePickInfo.currentOwner)}</span>`;
      if (statePickInfo.player) {
        headerExtra += `<span class="ta-already-picked-badge">Already Drafted</span>`;
      }
    }

    let html = `
      <div class="ta-pick-card ta-accent-${accent}">
        <div class="ta-pick-card-header">
          <span class="ta-pick-num">Pick #${overall}</span>
          <span class="ta-pick-round">Rd ${round}.${String(pickInRound).padStart(2,"0")}</span>
          ${headerExtra}
        </div>
    `;

    if (!playersLoaded) {
      html += `<div class="ta-no-players">No player database loaded — upload a CSV via Players to see ADP comps.</div>`;
    } else {
      const nearby = _playersNearADP(overall, ADP_WINDOW);
      if (nearby.length === 0) {
        html += `<div class="ta-no-players">No players with ADP near ${overall} found.</div>`;
      } else {
        html += `<div class="ta-player-list">`;
        nearby.forEach(p => {
          const adpDelta = Math.round(p.adp) - overall;
          const deltaStr = adpDelta === 0
            ? `ADP=${Math.round(p.adp)}`
            : adpDelta > 0 ? `ADP +${adpDelta}` : `ADP ${adpDelta}`;
          const posCol = CONFIG.posColor(p.pos);
          const posStyle = posCol
            ? `background:${posCol.bg};color:${posCol.text}`
            : `background:var(--bg-elevated);color:var(--text-secondary)`;
          const drafted = _isPlayerDrafted(p.name);

          html += `
            <div class="ta-player-row ${drafted ? "ta-player-drafted" : ""}">
              <span class="ta-pos-badge" style="${posStyle}">${_esc(p.pos || "?")}</span>
              <span class="ta-player-name">${_esc(p.name)}${drafted ? " ✓" : ""}</span>
              <span class="ta-player-team">${_esc(p.team || "")}</span>
              <span class="ta-adp-delta">${deltaStr}</span>
            </div>
          `;
        });
        html += `</div>`;
      }
    }

    html += `</div>`;
    return html;
  }

  // ─── Value summary ───
  function _valueSummary(aValue, bValue, sideA, sideB, playersLoaded) {
    const diff = aValue - bValue;
    let verdict = "";
    let verdictColor = "var(--text-secondary)";

    if (!playersLoaded) {
      verdict = "Load a player database to see value estimates.";
    } else if (Math.abs(diff) < 5) {
      verdict = "Roughly even trade.";
      verdictColor = "var(--success)";
    } else if (diff > 0) {
      verdict = `Side A is giving more value (~${Math.round(diff)} ADP pts). B wins this trade.`;
      verdictColor = "#64B5F6";
    } else {
      verdict = `Side B is giving more value (~${Math.round(Math.abs(diff))} ADP pts). A wins this trade.`;
      verdictColor = "var(--gold)";
    }

    let countNote = "";
    if (sideA.length !== sideB.length) {
      countNote = `<div class="ta-count-note">Note: unequal number of picks (${sideA.length} vs ${sideB.length}) — the extra pick has inherent value.</div>`;
    }

    return `
      <div class="ta-verdict">
        <div class="ta-verdict-label">Trade Value</div>
        <div class="ta-verdict-text" style="color:${verdictColor}">${verdict}</div>
        ${countNote}
        ${playersLoaded ? `<div class="ta-verdict-sub">Based on best available ADP near each pick. Lower ADP = better value.</div>` : ""}
      </div>
    `;
  }

  function _sideValue(overalls) {
    const total = CONFIG.NUM_TEAMS * CONFIG.NUM_ROUNDS;
    let sum = 0;
    overalls.forEach(overall => {
      const nearby = _playersNearADP(overall, ADP_WINDOW);
      if (nearby.length > 0) {
        const best = nearby.filter(p => !_isPlayerDrafted(p.name))[0] || nearby[0];
        sum += (total - best.adp);
      } else {
        sum += (total - overall);
      }
    });
    return sum;
  }

  // ─── State helpers ───
  function _findPickInState(overall) {
    if (!State.picks) return null;
    return State.picks.find(p => p.overall === overall) || null;
  }

  function _isPlayerDrafted(name) {
    if (!State.picks) return false;
    return State.picks.some(p => {
      if (!p.player) return false;
      const parsed = CONFIG.parsePlayer(p.player);
      return parsed.name.toLowerCase() === name.toLowerCase();
    });
  }

  // ─── Player DB helpers — reads from Players._db ───
  function _playersNearADP(overall, window) {
    if (!Players.isLoaded() || Players._db.length === 0) return [];
    return Players._db
      .filter(p => {
        const adp = parseFloat(p.adp);
        return !isNaN(adp) && Math.abs(adp - overall) <= window;
      })
      .sort((a, b) => parseFloat(a.adp) - parseFloat(b.adp));
  }

  function _showError(msg) {
    const el = document.getElementById("ta-results");
    if (el) {
      el.classList.remove("hidden");
      el.innerHTML = `<div class="ta-error">${_esc(msg)}</div>`;
    }
  }

  function _esc(str) {
    if (!str) return "";
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }

  return { open, close };
})();
