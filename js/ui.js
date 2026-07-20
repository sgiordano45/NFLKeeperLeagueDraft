// ─── UI Rendering ───
// Pure rendering functions that read from State and update the DOM.
// No state mutations happen here.
//
// Board layout: COLUMNS = teams, ROWS = rounds
// This is the classic "draft board on the wall" orientation.

const UI = {
  render() {
    this.renderHeader();
    this.renderBoard();
    this.renderOnTheClock();
  },

  // ─── HEADER ───
  renderHeader() {
    const nav = document.getElementById("header-nav");
    const status = document.getElementById("clock-status");
    nav.innerHTML = "";

    const isComm = Auth.isCommissioner();

    if (!State.draftStarted) {
      nav.innerHTML = `
        <button class="btn" onclick="Modals.openTeams()">Teams</button>
        <button class="btn" onclick="Modals.openTrade()">Trade Picks</button>
        <button class="btn" onclick="Modals.openKeepers()">Keepers</button>
        <button class="btn" onclick="TradeAnalyzer.open()">Trade Analyzer</button>
        ${isComm ? `<button class="btn" onclick="Modals.openPlayers()">Players</button>` : ''}
        ${isComm ? `<button class="btn" onclick="Modals.openAdminPanel()">Admin</button>` : ''}
        ${isComm ? `<button class="btn" onclick="Modals.openManageClaims()">Manage Owners</button>` : ''}
        ${isComm ? `<button class="btn btn-success btn-sm" onclick="App.applyTrades()">Apply Trades</button>` : ''}
        ${Auth.hasTeam() ? `<button class="btn" onclick="TeamPanel.toggle()">My Team</button>` : ''}
        <button class="btn btn-gold" onclick="App.startDraft()">Start Draft</button>
        <button class="btn btn-danger btn-sm" onclick="App.resetDraft()">Reset</button>
      `;
      status.innerHTML = "";
    } else if (!State.draftComplete) {
      const p = State.currentPick;
      if (p) {
        const color = State.teamColor(p.currentOwner);
        status.innerHTML = `
          Round ${p.round} · Pick ${p.pickInRound} ·
          <span style="color:${color};font-weight:700">${p.currentOwner}</span>
          on the clock
        `;
      }
      const resetBtn = isComm
        ? `<button class="btn btn-danger btn-sm" onclick="App.resetDraft()">Reset</button>`
        : ``;
      nav.innerHTML = `
        <button class="btn btn-gold" onclick="Modals.openDraft()">Draft Player</button>
        <button class="btn" onclick="App.undoLast()">Undo</button>
        <button class="btn" onclick="Modals.openHistory()">History</button>
        <button class="btn" onclick="Modals.openTimerSummary()">Timer</button>
        <button class="btn" onclick="TradeAnalyzer.open()">Trade Analyzer</button>
        ${Auth.hasTeam() ? `<button class="btn" onclick="TeamPanel.toggle()">My Team</button>` : ''}
        ${isComm ? `<button class="btn" onclick="Modals.openAdminPanel()">Admin</button>` : ''}
        ${resetBtn}
      `;
    } else {
      status.innerHTML = `<span class="draft-complete-text">Draft Complete</span>`;
      const resetBtn = isComm
        ? `<button class="btn btn-danger btn-sm" onclick="App.resetDraft()">Reset</button>`
        : ``;
      nav.innerHTML = `
        <button class="btn" onclick="Modals.openHistory()">History</button>
        <button class="btn" onclick="Modals.openTimerSummary()">Timer</button>
        <button class="btn" onclick="App.undoLast()">Undo Last</button>
        <button class="btn" onclick="TradeAnalyzer.open()">Trade Analyzer</button>
        ${Auth.hasTeam() ? `<button class="btn" onclick="TeamPanel.toggle()">My Team</button>` : ''}
        ${isComm ? `<button class="btn" onclick="Modals.openAdminPanel()">Admin</button>` : ''}
        ${resetBtn}
      `;
    }
  },

  // ─── DRAFT BOARD (flipped: rounds = rows, teams = columns) ───
  renderBoard() {
    const thead = document.getElementById("board-head");
    const tbody = document.getElementById("board-body");

    // Header row: team names across the top
    let headHTML = `<tr><th class="round-header">Rd</th>`;
    State.teams.forEach((team, tIdx) => {
      const color = CONFIG.TEAM_COLORS[tIdx % CONFIG.TEAM_COLORS.length];
      headHTML += `<th class="team-col-header" style="color:${color};border-top:3px solid ${color}">${this.esc(team)}</th>`;
    });
    headHTML += `</tr>`;
    thead.innerHTML = headHTML;

    // Body: one row per round
    let bodyHTML = "";
    for (let r = 1; r <= CONFIG.NUM_ROUNDS; r++) {
      bodyHTML += `<tr>`;
      bodyHTML += `<td class="round-label">Rd ${r}</td>`;

      State.teams.forEach((team, tIdx) => {
        const pick = State.pickForTeamRound(team, r);
        if (!pick) {
          bodyHTML += `<td class="pick-cell"><div class="pick-no-owner">—</div></td>`;
          return;
        }

        const pickIdx = State.picks.indexOf(pick);
        const isCurrent = State.draftStarted && !State.draftComplete && pickIdx === State.currentPickIndex;
        const filled = !!pick.player;
        const isKeeper = pick.isKeeper;
        const traded = pick.originalOwner !== pick.currentOwner;

        let classes = "pick";
        if (isCurrent) classes += " is-current";
        if (filled) classes += " is-filled";
        if (isKeeper) classes += " is-keeper";

        // Determine background color: position-based if filled, otherwise empty
        let bg = "";
        let playerTextColor = "#fff";
        const parsed = filled ? CONFIG.parsePlayer(pick.player) : null;

        if (filled) {
          // Use currentOwner's color (traded picks should reflect who owns the pick now)
          const ownerIdx = State.teams.indexOf(pick.currentOwner);
          const teamColor = CONFIG.TEAM_COLORS[(ownerIdx !== -1 ? ownerIdx : tIdx) % CONFIG.TEAM_COLORS.length];
          bg = isKeeper
            ? `linear-gradient(135deg, ${teamColor}cc, ${teamColor}88)`
            : `${teamColor}bb`;
        }

        const borderColor = filled && !isCurrent ? "transparent" : "";
        const teamColor = CONFIG.TEAM_COLORS[tIdx % CONFIG.TEAM_COLORS.length];
        const keeperBorder = !filled && isKeeper ? `border-color:${teamColor}66` : "";

        let style = "";
        if (bg) style += `background:${bg};`;
        if (borderColor) style += `border-color:${borderColor};`;
        if (keeperBorder) style += keeperBorder + ";";

        let inner = "";
        if (isKeeper) {
          inner += `<span class="keeper-badge">K</span>`;
        }

        if (filled) {
          if (parsed && parsed.pos) {
            inner += `<span class="pick-pos-tag">${parsed.pos}</span>`;
            inner += `<span class="pick-player" style="color:${playerTextColor}">${this.esc(parsed.name)}</span>`;
          } else {
            inner += `<span class="pick-player">${this.esc(pick.player)}</span>`;
          }
          if (traded) {
            inner += `<span class="pick-via">via ${this.esc(pick.originalOwner)}</span>`;
          }
        } else if (traded) {
          // Empty traded pick: show current owner as colored badge
          const ownerColor = State.teamColor(pick.currentOwner);
          inner += `<span class="trade-badge" style="background:${ownerColor}">${this.esc(pick.currentOwner)}</span>`;
          inner += `<span class="pick-empty-label">${pick.round}.${String(pick.pickInRound).padStart(2, "0")}</span>`;
        } else {
          inner += `<span class="pick-empty-label">${pick.round}.${String(pick.pickInRound).padStart(2, "0")}</span>`;
        }
        inner += `<span class="pick-overall">${pick.overall}</span>`;

        const onclick = (!filled && State.draftStarted) ? `onclick="Modals.openDraftAt(${pickIdx})"` : "";

        bodyHTML += `<td class="pick-cell"><div class="${classes}" style="${style}" ${onclick}>${inner}</div></td>`;
      });

      bodyHTML += `</tr>`;
    }

    tbody.innerHTML = bodyHTML;
  },

  // ─── ON THE CLOCK BANNER ───
  renderOnTheClock() {
    const el = document.getElementById("on-the-clock");
    if (!State.draftStarted || State.draftComplete || !State.currentPick) {
      el.classList.add("hidden");
      return;
    }

    el.classList.remove("hidden");
    const p = State.currentPick;
    const color = State.teamColor(p.currentOwner);

    document.getElementById("otc-pick-num").textContent = `Pick #${p.overall}`;
    const teamEl = document.getElementById("otc-team");
    teamEl.textContent = p.currentOwner;
    teamEl.style.color = color;
  },

  // ─── Scroll to current pick ───
  scrollToCurrent() {
    const currentEl = document.querySelector(".pick.is-current");
    if (currentEl) {
      currentEl.scrollIntoView({ behavior: "smooth", block: "center", inline: "center" });
    }
  },

  // ─── HTML escape ───
  esc(str) {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  },
};
