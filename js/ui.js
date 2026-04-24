// ─── UI Rendering ───
// Pure rendering functions that read from State and update the DOM.
// Buttons are gated by Auth.role: commissioner sees everything,
// owners see their own controls, spectators see view-only.

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

    const isAdmin = Auth.canAdmin();
    const myTeamBtn = Auth.hasTeam() ? `<button class="btn" onclick="TeamPanel.toggle()">My Team</button>` : "";

    if (!State.draftStarted) {
      let buttons = "";

      if (isAdmin) {
        buttons += `
          <button class="btn" onclick="Modals.openTeams()">Teams</button>
          <button class="btn" onclick="Modals.openTrade()">Trade Picks</button>
          <button class="btn" onclick="Modals.openKeepers()">Keepers</button>
          <button class="btn" onclick="Modals.openPlayers()">Players</button>
          <button class="btn btn-gold" onclick="App.startDraft()">Start Draft</button>
          <button class="btn btn-danger btn-sm" onclick="App.resetDraft()">Reset</button>
        `;
      }

      if (Auth.user && !Auth.isCommissioner()) {
        buttons += `<button class="btn" onclick="Modals.openClaimTeam()">Claim Team</button>`;
      }

      if (isAdmin) {
        buttons += `<button class="btn" onclick="Modals.openManageClaims()">Manage Owners</button>`;
      }

      buttons += myTeamBtn;

      nav.innerHTML = buttons;
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

      let buttons = "";

      if (Auth.canDraftCurrentPick()) {
        buttons += `<button class="btn btn-gold" onclick="Modals.openDraft()">Draft Player</button>`;
      }

      if (isAdmin) {
        buttons += `<button class="btn" onclick="App.undoLast()">Undo</button>`;
      }

      buttons += `<button class="btn" onclick="Modals.openHistory()">History</button>`;
      buttons += `<button class="btn" onclick="Modals.openTimerSummary()">Timer</button>`;
      buttons += `<button class="btn" onclick="Modals.openTeamSummary()">Teams</button>`;
      buttons += myTeamBtn;

      if (isAdmin) {
        buttons += `<button class="btn btn-danger btn-sm" onclick="App.resetDraft()">Reset</button>`;
      }

      nav.innerHTML = buttons;

    } else {
      status.innerHTML = `<span class="draft-complete-text">Draft Complete</span>`;

      let buttons = `
        <button class="btn" onclick="Modals.openHistory()">History</button>
        <button class="btn" onclick="Modals.openTimerSummary()">Timer</button>
        <button class="btn" onclick="Modals.openTeamSummary()">Teams</button>
      `;
      buttons += myTeamBtn;

      if (isAdmin) {
        buttons += `
          <button class="btn" onclick="App.undoLast()">Undo Last</button>
          <button class="btn btn-danger btn-sm" onclick="App.resetDraft()">Reset</button>
        `;
      }

      nav.innerHTML = buttons;
    }
  },

  // ─── DRAFT BOARD (columns = teams, rows = rounds) ───
  renderBoard() {
    const thead = document.getElementById("board-head");
    const tbody = document.getElementById("board-body");

    // Header row: team names across the top
    let headHTML = `<tr><th class="round-header">Rd</th>`;
    State.teams.forEach((team, tIdx) => {
      const color = CONFIG.TEAM_COLORS[tIdx % CONFIG.TEAM_COLORS.length];
      const ownerName = Auth.getTeamOwnerName(team);
      const isMyTeam = Auth.claimedTeam === team;
      const myClass = isMyTeam ? " my-team-header" : "";

      let label = `<span>${this.esc(team)}</span>`;
      if (ownerName) {
        label += `<br><span class="team-owner-name">${this.esc(ownerName)}</span>`;
      }

      headHTML += `<th class="team-col-header${myClass}" style="color:${color};border-top:3px solid ${color}">${label}</th>`;
    });
    headHTML += `</tr>`;
    thead.innerHTML = headHTML;

    // Body: one row per round
    let bodyHTML = "";
    for (let r = 1; r <= CONFIG.NUM_ROUNDS; r++) {
      bodyHTML += `<tr>`;
      bodyHTML += `<td class="round-label">Rd ${r}</td>`;

      State.teams.forEach((team, tIdx) => {
        const color = CONFIG.TEAM_COLORS[tIdx % CONFIG.TEAM_COLORS.length];
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

        const bg = filled
          ? isKeeper
            ? `linear-gradient(135deg, ${color}cc, ${color}88)`
            : `${color}bb`
          : "";

        const borderColor = filled && !isCurrent ? "transparent" : "";
        const keeperBorder = !filled && isKeeper ? `border-color:${color}66` : "";

        let style = "";
        if (bg) style += `background:${bg};`;
        if (borderColor) style += `border-color:${borderColor};`;
        if (keeperBorder) style += keeperBorder + ";";

        let inner = "";
        if (isKeeper) inner += `<span class="keeper-badge">K</span>`;

        if (filled) {
          inner += `<span class="pick-player">${this.esc(pick.player)}</span>`;
          if (traded) inner += `<span class="pick-via">via ${this.esc(pick.originalOwner)}</span>`;
        } else {
          inner += `<span class="pick-empty-label">${pick.round}.${String(pick.pickInRound).padStart(2, "0")}</span>`;
        }
        inner += `<span class="pick-overall">${pick.overall}</span>`;

        let onclick = "";
        if (!filled && State.draftStarted && Auth.canDraftPick(pickIdx)) {
          onclick = `onclick="Modals.openDraftAt(${pickIdx})"`;
        }

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

    const draftBtn = document.getElementById("otc-draft-btn");
    if (Auth.canDraftCurrentPick()) {
      draftBtn.classList.remove("hidden");
    } else {
      draftBtn.classList.add("hidden");
    }
  },

  scrollToCurrent() {
    const currentEl = document.querySelector(".pick.is-current");
    if (currentEl) {
      currentEl.scrollIntoView({ behavior: "smooth", block: "center", inline: "center" });
    }
  },

  esc(str) {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  },
};
