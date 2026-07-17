// ─── Trade Analyzer ───
// Analyzes a pick swap by showing players with ADP near each pick number.
// Reads from Players._db (loaded from Firebase via players.js).
//
// Usage: TradeAnalyzer.open()

const TradeAnalyzer = (() => {

  let ADP_WINDOW = 3; // ±N picks around each pick's overall number (user-adjustable)

  // ─── Fantasy Pick Value Curve ───
  // Exponential decay tuned for fantasy redraft (12-team, 14-round).
  // value(n) = 1000 × 0.965^(n-1)
  // Pick 1 ≈ 1000, Pick 12 ≈ 644, Pick 24 ≈ 415, Pick 84 ≈ 53, Pick 168 ≈ 3
  // This gives early picks disproportionately more value, like real draft boards.
  const CURVE_BASE = 1000;
  const CURVE_DECAY = 0.965;

  function _pickValue(overall) {
    return CURVE_BASE * Math.pow(CURVE_DECAY, overall - 1);
  }

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

        <div style="display:flex;align-items:center;gap:12px;margin-bottom:12px;flex-wrap:wrap">
          <p style="color:var(--text-secondary);font-size:13px;margin:0;flex:1;min-width:180px">
            Enter overall pick numbers for each side. Players with ADP near each pick will appear.
          </p>
          <label style="display:flex;align-items:center;gap:7px;white-space:nowrap">
            <span style="font-family:var(--font-display);font-size:11px;color:var(--text-muted);text-transform:uppercase;letter-spacing:.5px">ADP ±</span>
            <input
              type="number"
              id="ta-adp-window"
              class="form-input"
              value="${ADP_WINDOW}"
              min="0" max="10" step="1"
              style="width:60px;font-size:13px;padding:5px 8px;text-align:center"
              title="Show players within ±N picks of each slot's ADP"
            />
          </label>
        </div>

        <details class="ta-chart-details">
          <summary class="ta-chart-summary">📊 Pick Value Reference Chart</summary>
          <div class="ta-chart-body">
            <p class="ta-chart-note">
              Point values use an exponential decay curve (1000 × 0.965<sup>n−1</sup>),
              similar to the fantasy-tuned model used by KeepTradeCut and Footballguys.
              Early picks are worth disproportionately more — just like the real thing.
            </p>
            ${_valueChartHTML()}
          </div>
        </details>

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
    // Read user-set ADP window before analyzing
    const windowEl = document.getElementById("ta-adp-window");
    const parsed = parseInt(windowEl?.value, 10);
    ADP_WINDOW = (!isNaN(parsed) && parsed >= 0) ? parsed : 3;

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
    // Always compute curve-based totals for the raw slot values (no ADP needed)
    const aCurveTotal = sideA.reduce((s, o) => s + _pickValue(o), 0);
    const bCurveTotal = sideB.reduce((s, o) => s + _pickValue(o), 0);
    const curveDiff = aCurveTotal - bCurveTotal;
    const maxTotal = Math.max(aCurveTotal, bCurveTotal);
    const pctDiff = maxTotal > 0 ? Math.abs(curveDiff) / maxTotal * 100 : 0;

    let verdict = "";
    let verdictColor = "var(--text-secondary)";

    if (pctDiff < 3) {
      verdict = "Roughly even trade.";
      verdictColor = "var(--success)";
    } else if (curveDiff > 0) {
      verdict = `Side A is giving more value. B wins by ~${pctDiff.toFixed(0)}%.`;
      verdictColor = "#64B5F6";
    } else {
      verdict = `Side B is giving more value. A wins by ~${pctDiff.toFixed(0)}%.`;
      verdictColor = "var(--gold)";
    }

    // ADP-adjusted verdict (only if players loaded)
    let adpBlock = "";
    if (playersLoaded) {
      const diff = aValue - bValue;
      const adjMax = Math.max(aValue, bValue);
      const adjPct = adjMax > 0 ? Math.abs(diff) / adjMax * 100 : 0;
      let adpVerdict = "";
      if (adjPct < 3) {
        adpVerdict = "ADP-adjusted: roughly even.";
      } else if (diff > 0) {
        adpVerdict = `ADP-adjusted: B wins by ~${adjPct.toFixed(0)}%.`;
      } else {
        adpVerdict = `ADP-adjusted: A wins by ~${adjPct.toFixed(0)}%.`;
      }
      adpBlock = `<div class="ta-verdict-sub">${adpVerdict} (blends curve + best available ADP)</div>`;
    }

    let countNote = "";
    if (sideA.length !== sideB.length) {
      countNote = `<div class="ta-count-note">Note: unequal number of picks (${sideA.length} vs ${sideB.length}) — the extra pick has inherent value.</div>`;
    }

    return `
      <div class="ta-verdict">
        <div class="ta-verdict-scores">
          <div class="ta-verdict-score ta-score-a">
            <div class="ta-score-label" style="color:var(--gold)">Side A</div>
            <div class="ta-score-pts">${Math.round(aCurveTotal)}</div>
            <div class="ta-score-unit">pts</div>
          </div>
          <div class="ta-verdict-label">Pick Value</div>
          <div class="ta-verdict-score ta-score-b">
            <div class="ta-score-label" style="color:#64B5F6">Side B</div>
            <div class="ta-score-pts">${Math.round(bCurveTotal)}</div>
            <div class="ta-score-unit">pts</div>
          </div>
        </div>
        <div class="ta-verdict-text" style="color:${verdictColor}">${verdict}</div>
        ${adpBlock}
        ${countNote}
        <div class="ta-verdict-footnote">Curve: 1000 × 0.965<sup>n−1</sup> per pick slot. ${playersLoaded ? "ADP adjustment uses best available player near each slot." : "Load a player CSV for ADP-adjusted analysis."}</div>
      </div>
    `;
  }

  function _sideValue(overalls) {
    // Use the pick value curve for the base value of each slot.
    // If ADP data is loaded, adjust slightly toward the best available
    // player's ADP (reflects real draft-day value better than raw slot).
    let sum = 0;
    overalls.forEach(overall => {
      const nearby = _playersNearADP(overall, ADP_WINDOW);
      if (nearby.length > 0) {
        const best = nearby.filter(p => !_isPlayerDrafted(p.name))[0] || nearby[0];
        // Blend: 70% curve value of best player's ADP, 30% raw slot value
        const curveAtBest = _pickValue(Math.round(best.adp));
        const curveAtSlot = _pickValue(overall);
        sum += 0.7 * curveAtBest + 0.3 * curveAtSlot;
      } else {
        sum += _pickValue(overall);
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

  // ─── Pick value reference chart HTML ───
  function _valueChartHTML() {
    const total = CONFIG.NUM_TEAMS * CONFIG.NUM_ROUNDS;
    // Build one column per round, showing pick slot and value for pick 1 in each round
    // Table: rows = picks 1–12 within round, cols = rounds 1–14
    const NUM_ROUNDS = CONFIG.NUM_ROUNDS;
    const NUM_TEAMS = CONFIG.NUM_TEAMS;

    let html = `<div class="ta-chart-scroll"><table class="ta-chart-table">`;
    html += `<thead><tr><th>Pick</th>`;
    for (let r = 1; r <= NUM_ROUNDS; r++) {
      html += `<th>Rd ${r}</th>`;
    }
    html += `</tr></thead><tbody>`;

    for (let p = 1; p <= NUM_TEAMS; p++) {
      html += `<tr><td class="ta-chart-pick-label">${p}</td>`;
      for (let r = 1; r <= NUM_ROUNDS; r++) {
        const overall = (r - 1) * NUM_TEAMS + p;
        if (overall > total) {
          html += `<td>—</td>`;
        } else {
          const val = _pickValue(overall);
          // Color intensity: green → yellow → red as value drops
          const pct = val / CURVE_BASE; // 0..1
          const alpha = 0.15 + pct * 0.55;
          const bg = pct > 0.6
            ? `rgba(42,157,143,${alpha})`   // green (high value)
            : pct > 0.3
            ? `rgba(233,196,106,${alpha})`  // yellow (mid)
            : `rgba(230,57,70,${alpha})`;   // red (low)
          html += `<td style="background:${bg};font-weight:${r === 1 ? 700 : 400}">
            <div class="ta-chart-overall">#${overall}</div>
            <div class="ta-chart-val">${Math.round(val)}</div>
          </td>`;
        }
      }
      html += `</tr>`;
    }

    html += `</tbody></table></div>`;
    return html;
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
