// ─── Modal Manager ───
const Modals = {
  _selectedPickIndex: null,

  open(title, bodyHTML, opts = {}) {
    document.getElementById("modal-title").textContent = title;
    document.getElementById("modal-body").innerHTML = bodyHTML;
    const modal = document.getElementById("modal");
    modal.style.width = opts.wide ? "95vw" : "";
    modal.style.maxWidth = opts.wide ? "1200px" : "";
    document.getElementById("modal-backdrop").classList.remove("hidden");
  },

  close() {
    document.getElementById("modal-backdrop").classList.add("hidden");
    document.getElementById("modal").style.width = "";
    document.getElementById("modal").style.maxWidth = "";
    this._selectedPickIndex = null;
  },

  // ─── TEAM NAMES ───
  openTeams() {
    let rows = State.teams.map((t, i) => {
      const color = CONFIG.TEAM_COLORS[i % CONFIG.TEAM_COLORS.length];
      return `
        <div class="team-edit-row">
          <div class="team-color-dot" style="background:${color}"></div>
          <input class="form-input" id="team-edit-${i}" value="${UI.esc(t)}" />
        </div>`;
    }).join("");

    this.open("Team Names", `
      ${rows}
      <button class="btn btn-gold btn-full mt-12" onclick="Modals.saveTeams()">Save Teams</button>
    `);
  },

  saveTeams() {
    const newTeams = State.teams.map((_, i) => {
      const input = document.getElementById(`team-edit-${i}`);
      return input ? input.value.trim() || `Team ${i + 1}` : `Team ${i + 1}`;
    });

    const newPicks = State.picks.map(p => {
      const oldOrigIdx = State.teams.indexOf(p.originalOwner);
      const oldCurIdx = State.teams.indexOf(p.currentOwner);
      return {
        ...p,
        originalOwner: oldOrigIdx >= 0 ? newTeams[oldOrigIdx] : p.originalOwner,
        currentOwner: oldCurIdx >= 0 ? newTeams[oldCurIdx] : p.currentOwner,
      };
    });

    // Update timer data keys
    const newTimerData = {};
    State.teams.forEach((oldName, i) => {
      newTimerData[newTeams[i]] = State.timerData[oldName] || 0;
    });

    State.mutate({ teams: newTeams, picks: newPicks, timerData: newTimerData });
    this.close();
  },

  // ─── TRADE / ASSIGN PICKS ───
  openTrade() {
    const teamOptions = State.teams.map(t => `<option value="${UI.esc(t)}">${UI.esc(t)}</option>`).join("");

    // Traded picks table
    const traded = State.picks.filter(p => p.originalOwner !== p.currentOwner);
    let tradedRows = traded.length === 0
      ? `<tr class="empty-row"><td colspan="4">No traded picks yet</td></tr>`
      : traded.map(p => `
          <tr>
            <td>${p.overall}</td>
            <td>${p.round}.${String(p.pickInRound).padStart(2, "0")}</td>
            <td style="color:var(--text-secondary)">${UI.esc(p.originalOwner)}</td>
            <td style="font-weight:700">${UI.esc(p.currentOwner)}</td>
          </tr>`).join("");

    this.open("Trade / Assign Picks", `
      <p class="modal-hint">Reassign any pick to a different team. The overall pick # is shown in the bottom-left corner of each cell on the board.</p>
      <div class="form-row mb-8">
        <div>
          <label class="form-label">Overall Pick #</label>
          <input class="form-input" type="number" id="trade-pick" min="1" max="${CONFIG.NUM_ROUNDS * CONFIG.NUM_TEAMS}" placeholder="e.g. 15" />
        </div>
        <div style="flex:2">
          <label class="form-label">Assign To</label>
          <select class="form-select" id="trade-team">
            <option value="">Select team…</option>
            ${teamOptions}
          </select>
        </div>
      </div>
      <button class="btn btn-success btn-full" onclick="Modals.executeTrade()">Assign Pick</button>

      <div class="mt-20" style="max-height:260px;overflow-y:auto">
        <table class="data-table">
          <thead><tr><th>#</th><th>Rd</th><th>Original</th><th>Current</th></tr></thead>
          <tbody>${tradedRows}</tbody>
        </table>
      </div>
    `);
  },

  executeTrade() {
    const overall = parseInt(document.getElementById("trade-pick").value);
    const toTeam = document.getElementById("trade-team").value;
    if (!overall || !toTeam) return;

    const newPicks = State.picks.map(p =>
      p.overall === overall ? { ...p, currentOwner: toTeam } : p
    );
    State.mutate({ picks: newPicks });
    this.openTrade(); // Refresh the modal
  },

  // ─── KEEPERS ───
  openKeepers() {
    const teamOptions = State.teams.map(t => `<option value="${UI.esc(t)}">${UI.esc(t)}</option>`).join("");
    const roundOptions = Array.from({ length: CONFIG.NUM_ROUNDS }, (_, i) =>
      `<option value="${i + 1}">Round ${i + 1}</option>`
    ).join("");

    const keepers = State.picks.filter(p => p.isKeeper);
    let keeperList = keepers.length === 0
      ? `<p style="color:var(--text-muted);font-size:13px">No keepers set</p>`
      : keepers.map(p => {
          const color = State.teamColor(p.currentOwner);
          return `
            <div class="keeper-item">
              <span style="font-size:13px">
                <strong style="color:${color}">${UI.esc(p.currentOwner)}</strong>
                — ${UI.esc(p.player)} (Rd ${p.round})
              </span>
              <button class="keeper-remove" onclick="Modals.removeKeeper(${p.overall})">&times;</button>
            </div>`;
        }).join("");

    this.open("Set Keepers", `
      <p class="modal-hint">Mark a player as a keeper. This locks them into the specified round for that team.</p>
      <div class="form-group">
        <label class="form-label">Team</label>
        <select class="form-select" id="keeper-team">${teamOptions}</select>
      </div>
      <div class="form-group">
        <label class="form-label">Player Name</label>
        <input class="form-input" id="keeper-player" placeholder="e.g. Patrick Mahomes" />
      </div>
      <div class="form-group">
        <label class="form-label">Round</label>
        <select class="form-select" id="keeper-round">
          <option value="">Select round…</option>
          ${roundOptions}
        </select>
      </div>
      <button class="btn btn-success btn-full" onclick="Modals.setKeeper()">Set Keeper</button>

      <div class="mt-20">
        <h3 style="font-family:var(--font-display);font-size:14px;text-transform:uppercase;color:var(--text-secondary);margin-bottom:8px">
          Current Keepers
        </h3>
        ${keeperList}
      </div>
    `);
  },

  setKeeper() {
    const team = document.getElementById("keeper-team").value;
    const player = document.getElementById("keeper-player").value.trim();
    const round = parseInt(document.getElementById("keeper-round").value);
    if (!team || !player || !round) return;

    const newPicks = State.picks.map(p => {
      if (p.round === round && p.currentOwner === team && !p.player) {
        return { ...p, player, isKeeper: true };
      }
      return p;
    });
    State.mutate({ picks: newPicks });
    this.openKeepers(); // Refresh
  },

  removeKeeper(overall) {
    const newPicks = State.picks.map(p =>
      p.overall === overall ? { ...p, player: null, isKeeper: false } : p
    );
    State.mutate({ picks: newPicks });
    this.openKeepers(); // Refresh
  },

  // ─── DRAFT PLAYER ───
  openDraft() {
    this._selectedPickIndex = null;
    this._renderDraftModal(State.currentPickIndex);
  },

  openDraftAt(pickIndex) {
    if (State.picks[pickIndex]?.player) return;
    this._selectedPickIndex = pickIndex;
    this._renderDraftModal(pickIndex);
  },

  _renderDraftModal(pickIndex) {
    const pick = State.picks[pickIndex];
    if (!pick) return;

    const color = State.teamColor(pick.currentOwner);
    const traded = pick.originalOwner !== pick.currentOwner;
    const hasPlayers = Players.count() > 0;

    this.open("Draft Player", `
      <div class="pick-info-box">
        <div class="pick-info-meta">Pick #${pick.overall} · Round ${pick.round} · Pick ${pick.pickInRound}</div>
        <div class="pick-info-team" style="color:${color}">${UI.esc(pick.currentOwner)}</div>
        ${traded ? `<span class="pick-info-via">(via ${UI.esc(pick.originalOwner)})</span>` : ""}
      </div>
      <div style="position:relative">
        <input class="form-input form-input-lg" id="draft-player-input"
          placeholder="${hasPlayers ? 'Search player…' : 'Player name…'}" autofocus
          oninput="Modals.onDraftSearch(this.value)"
          onkeydown="Modals.onDraftKeydown(event)" />
        <div id="draft-autocomplete" class="draft-autocomplete hidden"></div>
      </div>
      <div id="draft-selected-info" class="draft-selected-info hidden"></div>
      <button class="btn btn-gold btn-full mt-12" style="padding:12px 0;font-size:16px"
        onclick="Modals.confirmDraft()">Confirm Pick</button>
    `);

    this._draftAutoIdx = -1;
    this._draftResults = [];

    setTimeout(() => {
      const input = document.getElementById("draft-player-input");
      if (input) input.focus();
    }, 50);
  },

  _draftAutoIdx: -1,
  _draftResults: [],

  onDraftSearch(query) {
    const ac = document.getElementById("draft-autocomplete");
    const info = document.getElementById("draft-selected-info");
    if (!ac) return;

    if (!query || query.length < 2 || Players.count() === 0) {
      ac.classList.add("hidden");
      ac.innerHTML = "";
      info.classList.add("hidden");
      this._draftResults = [];
      this._draftAutoIdx = -1;
      return;
    }

    this._draftResults = Players.search(query, 10);
    this._draftAutoIdx = -1;

    if (this._draftResults.length === 0) {
      ac.innerHTML = `<div class="ac-empty">No available players found</div>`;
      ac.classList.remove("hidden");
      return;
    }

    ac.innerHTML = this._draftResults.map((p, i) => `
      <div class="ac-item ${i === this._draftAutoIdx ? 'ac-active' : ''}"
        onmousedown="Modals.selectDraftPlayer(${i})"
        onmouseenter="Modals._draftAutoIdx=${i};Modals._highlightAC()">
        <span class="ac-name">${UI.esc(p.name)}</span>
        <span class="ac-meta">
          <span class="player-pos-badge pos-${p.pos.toLowerCase()}">${p.pos === 'DEF' ? 'D/ST' : p.pos}</span>
          ${p.team ? `<span class="ac-team">${UI.esc(p.team)}</span>` : ''}
          ${p.bye ? `<span class="ac-bye">Bye ${p.bye}</span>` : ''}
          ${p.adp < 999 ? `<span class="ac-adp">ADP ${Math.round(p.adp)}</span>` : ''}
        </span>
      </div>
    `).join('');
    ac.classList.remove("hidden");
  },

  onDraftKeydown(e) {
    const ac = document.getElementById("draft-autocomplete");
    if (!ac || ac.classList.contains("hidden") || this._draftResults.length === 0) {
      if (e.key === "Enter") this.confirmDraft();
      return;
    }

    if (e.key === "ArrowDown") {
      e.preventDefault();
      this._draftAutoIdx = Math.min(this._draftAutoIdx + 1, this._draftResults.length - 1);
      this._highlightAC();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      this._draftAutoIdx = Math.max(this._draftAutoIdx - 1, -1);
      this._highlightAC();
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (this._draftAutoIdx >= 0) {
        this.selectDraftPlayer(this._draftAutoIdx);
      } else {
        this.confirmDraft();
      }
    } else if (e.key === "Escape") {
      ac.classList.add("hidden");
    }
  },

  _highlightAC() {
    const items = document.querySelectorAll("#draft-autocomplete .ac-item");
    items.forEach((el, i) => {
      el.classList.toggle("ac-active", i === this._draftAutoIdx);
    });
  },

  selectDraftPlayer(idx) {
    const p = this._draftResults[idx];
    if (!p) return;

    const input = document.getElementById("draft-player-input");
    // Store as "Name, POS" for roster categorization
    input.value = `${p.name}, ${p.pos}`;

    const ac = document.getElementById("draft-autocomplete");
    ac.classList.add("hidden");

    // Show selected player info
    const info = document.getElementById("draft-selected-info");
    info.classList.remove("hidden");
    info.innerHTML = `
      <div class="selected-player-card">
        <span class="player-pos-badge pos-${p.pos.toLowerCase()}" style="font-size:12px;padding:2px 8px">${p.pos === 'DEF' ? 'D/ST' : p.pos}</span>
        <span class="selected-player-name">${UI.esc(p.name)}</span>
        <div class="selected-player-meta">
          ${p.team ? `<span>${p.team}</span>` : ''}
          ${p.bye ? `<span>Bye ${p.bye}</span>` : ''}
          ${p.adp < 999 ? `<span>ADP ${Math.round(p.adp)}</span>` : ''}
          ${p.projPts ? `<span>${p.projPts.toFixed(1)} pts</span>` : ''}
        </div>
      </div>
    `;

    this._draftResults = [];
    this._draftAutoIdx = -1;
  },

  confirmDraft() {
    const input = document.getElementById("draft-player-input");
    const player = input ? input.value.trim() : "";
    if (!player) return;

    const idx = this._selectedPickIndex != null ? this._selectedPickIndex : State.currentPickIndex;

    // Stop timer, bank the time
    Timer.stop();

    // Make the pick
    const newPicks = State.picks.map((p, i) =>
      i === idx ? { ...p, player } : p
    );

    // Advance to next open pick
    let nextIdx = State.currentPickIndex;
    let complete = false;
    if (this._selectedPickIndex == null || this._selectedPickIndex === State.currentPickIndex) {
      let found = -1;
      for (let i = State.currentPickIndex + 1; i < newPicks.length; i++) {
        if (!newPicks[i].player) { found = i; break; }
      }
      if (found === -1) {
        complete = true;
      } else {
        nextIdx = found;
      }
    }

    State.mutate({
      picks: newPicks,
      currentPickIndex: nextIdx,
      draftComplete: complete,
      timerData: { ...State.timerData },
    });

    this.close();

    // Start timer for next team if draft continues
    if (!complete) {
      const nextPick = State.picks[nextIdx];
      if (nextPick) Timer.start(nextPick.currentOwner);
    }

    // Scroll to current pick after a beat
    setTimeout(() => UI.scrollToCurrent(), 200);
  },

  // ─── HISTORY ───
  openHistory() {
    const allPicked = State.picks
      .filter(p => p.player)
      .sort((a, b) => a.overall - b.overall);

    let rows = allPicked.length === 0
      ? `<tr class="empty-row"><td colspan="4">No picks made yet</td></tr>`
      : allPicked.map(p => {
          const color = State.teamColor(p.currentOwner);
          return `
            <tr>
              <td style="color:var(--text-secondary)">${p.round}.${String(p.pickInRound).padStart(2, "0")}</td>
              <td style="color:${color};font-weight:700">${UI.esc(p.currentOwner)}</td>
              <td>${UI.esc(p.player)}</td>
              <td>${p.isKeeper
                ? '<span style="color:var(--gold);font-size:11px;font-family:var(--font-display)">KEEPER</span>'
                : '<span style="color:var(--text-muted);font-size:11px">Draft</span>'
              }</td>
            </tr>`;
        }).join("");

    this.open("Draft History", `
      <div class="history-container">
        <table class="data-table">
          <thead><tr><th>Pick</th><th>Team</th><th>Player</th><th>Type</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    `);
  },

  // ─── TIMER SUMMARY ───
  openTimerSummary() {
    const timerRows = State.teams
      .map(team => ({
        team,
        total: Timer.getTeamTotalLive(team),
        picks: State.picks.filter(p => p.currentOwner === team && p.player && !p.isKeeper).length,
      }))
      .sort((a, b) => b.total - a.total);

    let rows = timerRows.map(r => {
      const color = State.teamColor(r.team);
      const avg = r.picks > 0 ? Math.round(r.total / r.picks) : 0;
      return `
        <tr>
          <td style="color:${color};font-weight:700">${UI.esc(r.team)}</td>
          <td>${Timer.formatTimeLong(r.total)}</td>
          <td>${r.picks}</td>
          <td>${avg > 0 ? Timer.formatTime(avg) : "—"}</td>
        </tr>`;
    }).join("");

    this.open("Draft Timer Summary", `
      <p class="modal-hint">Cumulative time on the clock per team. Sorted slowest to fastest for maximum judgment.</p>
      <table class="data-table">
        <thead><tr><th>Team</th><th>Total Time</th><th>Picks</th><th>Avg/Pick</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    `);
  },

  // ─── CLAIM TEAM (for owners) ───
  openClaimTeam() {
    const claims = Auth._teamClaims || {};

    let teamRows = State.teams.map((team, i) => {
      const color = CONFIG.TEAM_COLORS[i % CONFIG.TEAM_COLORS.length];
      const claim = claims[team];
      const isMine = claim && Auth.user && claim.uid === Auth.user.uid;
      const isTaken = claim && !isMine;

      let status = "";
      let action = "";

      if (isMine) {
        status = `<span class="claim-status claimed-mine">You</span>`;
        action = `<button class="btn btn-sm btn-danger" onclick="Auth.unclaimTeam('${UI.esc(team)}');Modals.openClaimTeam()">Release</button>`;
      } else if (isTaken) {
        status = `<span class="claim-status claimed-other">${UI.esc(claim.displayName)}</span>`;
        action = "";
      } else {
        status = `<span class="claim-status unclaimed">Available</span>`;
        action = `<button class="btn btn-sm btn-success" onclick="Auth.claimTeam('${UI.esc(team)}');Modals.openClaimTeam()">Claim</button>`;
      }

      return `
        <tr>
          <td style="color:${color};font-weight:700;font-family:var(--font-display)">${UI.esc(team)}</td>
          <td>${status}</td>
          <td style="text-align:right">${action}</td>
        </tr>`;
    }).join("");

    this.open("Claim Your Team", `
      <p class="modal-hint">Select a team to control. You'll be able to draft when it's your team's turn.</p>
      <table class="data-table">
        <thead><tr><th>Team</th><th>Owner</th><th></th></tr></thead>
        <tbody>${teamRows}</tbody>
      </table>
    `);
  },

  // ─── MANAGE CLAIMS (commissioner) ───
  openManageClaims() {
    const claims = Auth._teamClaims || {};

    let teamRows = State.teams.map((team, i) => {
      const color = CONFIG.TEAM_COLORS[i % CONFIG.TEAM_COLORS.length];
      const claim = claims[team];

      let ownerCol = "";
      let actionCol = "";

      if (claim) {
        ownerCol = `<span>${UI.esc(claim.displayName)}<br><span style="font-size:11px;color:var(--text-muted)">${UI.esc(claim.email)}</span></span>`;
        actionCol = `<button class="btn btn-sm btn-danger" onclick="Auth.unclaimTeam('${team.replace(/'/g, "\\'")}');Modals.openManageClaims()">Remove</button>`;
      } else {
        ownerCol = `<span class="claim-status unclaimed">No owner</span>`;
        actionCol = `<button class="btn btn-sm btn-success" onclick="Auth.claimTeam('${team.replace(/'/g, "\\'")}');Modals.openManageClaims()">Claim</button>`;
      }

      return `
        <tr>
          <td style="color:${color};font-weight:700;font-family:var(--font-display)">${UI.esc(team)}</td>
          <td>${ownerCol}</td>
          <td style="text-align:right">${actionCol}</td>
        </tr>`;
    }).join("");

    this.open("Manage Team Owners", `
      <p class="modal-hint">View and manage which users have claimed each team. Owners sign in with Google and claim a team from the board.</p>
      <table class="data-table">
        <thead><tr><th>Team</th><th>Owner</th><th></th></tr></thead>
        <tbody>${teamRows}</tbody>
      </table>
    `);
  },

  // ─── MANAGE PLAYERS (commissioner) ───
  openPlayers() {
    const count = Players.count();
    const posBreakdown = this._getPositionBreakdown();

    this.open("Manage Players", `
      <p class="modal-hint">Upload a CSV with player data. Required columns: Name, Position. Optional: Team, Bye, ADP/Rank, Projected Points.</p>

      <div class="tp-section" style="margin-bottom:16px">
        <div style="display:flex;align-items:center;gap:12px;margin-bottom:12px">
          <label class="btn btn-success" style="cursor:pointer;margin:0">
            Upload CSV
            <input type="file" accept=".csv,.txt" id="csv-upload" style="display:none"
              onchange="Modals.handleCSVUpload(this)" />
          </label>
          <span style="font-size:13px;color:var(--text-secondary)">
            ${count > 0 ? `${count} players loaded` : 'No players loaded'}
          </span>
          ${count > 0 ? `<button class="btn btn-danger btn-sm" onclick="Modals.clearPlayers()">Clear All</button>` : ''}
        </div>

        ${count > 0 ? `
          <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:12px">
            ${posBreakdown.map(p => `
              <span class="tp-need" style="padding:4px 10px;flex-direction:row;gap:6px;display:inline-flex">
                <span class="tp-need-pos" style="font-size:11px">${p.pos}</span>
                <span style="font-size:11px;color:var(--text-secondary)">${p.count}</span>
              </span>
            `).join('')}
          </div>
        ` : ''}
      </div>

      <div id="csv-upload-status"></div>

      ${count > 0 ? `
        <div style="margin-bottom:8px">
          <input class="form-input" id="player-search-manage" placeholder="Search players…"
            oninput="Modals.filterPlayerList(this.value)" />
        </div>
        <div id="player-list-container" style="max-height:350px;overflow-y:auto">
          ${this._renderPlayerTable(Players.getAll().slice(0, 50))}
        </div>
        <p style="font-size:11px;color:var(--text-muted);margin-top:8px">Showing top 50 by ADP. Use search to find specific players.</p>
      ` : `
        <div style="padding:24px;text-align:center;color:var(--text-muted)">
          <p style="font-size:14px;margin-bottom:8px">No players loaded yet</p>
          <p style="font-size:12px">Upload a CSV file with columns like:<br>
          <code style="color:var(--text-secondary)">Name, Pos, Team, Bye, ADP, Points</code></p>
        </div>
      `}
    `);
  },

  _getPositionBreakdown() {
    const counts = {};
    Players.getAll().forEach(p => {
      const pos = p.pos === "DEF" ? "D/ST" : p.pos;
      counts[pos] = (counts[pos] || 0) + 1;
    });
    return Object.entries(counts)
      .map(([pos, count]) => ({ pos, count }))
      .sort((a, b) => b.count - a.count);
  },

  _renderPlayerTable(players) {
    if (players.length === 0) {
      return `<p style="text-align:center;color:var(--text-muted);padding:12px">No results</p>`;
    }

    let rows = players.map((p, i) => {
      const globalIdx = Players.getAll().indexOf(p);
      return `
        <tr>
          <td style="font-size:12px;color:var(--text-muted)">${p.adp < 999 ? Math.round(p.adp) : '—'}</td>
          <td style="font-weight:600">${UI.esc(p.name)}</td>
          <td><span class="player-pos-badge pos-${p.pos.toLowerCase()}">${p.pos === 'DEF' ? 'D/ST' : p.pos}</span></td>
          <td>${UI.esc(p.team || '—')}</td>
          <td>${p.bye || '—'}</td>
          <td>${p.projPts ? p.projPts.toFixed(1) : '—'}</td>
          <td><button class="keeper-remove" onclick="Modals.deletePlayer(${globalIdx})">&times;</button></td>
        </tr>`;
    }).join('');

    return `
      <table class="data-table">
        <thead><tr><th>ADP</th><th>Name</th><th>Pos</th><th>Team</th><th>Bye</th><th>Pts</th><th></th></tr></thead>
        <tbody>${rows}</tbody>
      </table>`;
  },

  filterPlayerList(query) {
    const container = document.getElementById("player-list-container");
    if (!container) return;

    let players;
    if (!query || query.length < 2) {
      players = Players.getAll().slice(0, 50);
    } else {
      const q = query.toUpperCase();
      players = Players.getAll().filter(p =>
        p.name.toUpperCase().includes(q) ||
        p.pos.toUpperCase().includes(q) ||
        (p.team && p.team.toUpperCase().includes(q))
      ).slice(0, 50);
    }
    container.innerHTML = this._renderPlayerTable(players);
  },

  async handleCSVUpload(input) {
    const file = input.files[0];
    if (!file) return;

    const statusEl = document.getElementById("csv-upload-status");
    statusEl.innerHTML = `<p style="color:var(--text-secondary);font-size:13px">Parsing ${UI.esc(file.name)}…</p>`;

    try {
      const text = await file.text();
      const { players, errors } = Players.parseCSV(text);

      if (players.length === 0) {
        statusEl.innerHTML = `<p style="color:var(--danger);font-size:13px">${errors[0] || 'No valid players found in CSV.'}</p>`;
        return;
      }

      const ok = await Players.saveToDB(players);
      if (!ok) {
        statusEl.innerHTML = `<p style="color:var(--danger);font-size:13px">Failed to save to Firebase.</p>`;
        return;
      }

      let msg = `<p style="color:var(--success);font-size:13px">Loaded ${players.length} players.</p>`;
      if (errors.length > 0) {
        msg += `<p style="color:var(--gold);font-size:12px">${errors.length} row(s) skipped:</p>`;
        msg += `<ul style="font-size:11px;color:var(--text-muted);padding-left:16px;max-height:80px;overflow-y:auto">`;
        errors.slice(0, 10).forEach(e => msg += `<li>${UI.esc(e)}</li>`);
        if (errors.length > 10) msg += `<li>…and ${errors.length - 10} more</li>`;
        msg += `</ul>`;
      }
      statusEl.innerHTML = msg;

      // Refresh modal after a moment
      setTimeout(() => this.openPlayers(), 1000);

    } catch (e) {
      statusEl.innerHTML = `<p style="color:var(--danger);font-size:13px">Error reading file: ${UI.esc(e.message)}</p>`;
    }
  },

  async deletePlayer(index) {
    await Players.deletePlayer(index);
    this.openPlayers();
  },

  async clearPlayers() {
    if (!confirm("Remove all players from the database?")) return;
    await Players.clearAll();
    this.openPlayers();
  },

  // ─── TEAM SUMMARY ───
  _summaryDetailTeam: null,

  openTeamSummary() {
    this._summaryDetailTeam = null;
    this._renderTeamSummary();
  },

  _renderTeamSummary() {
    if (this._summaryDetailTeam) {
      this._renderTeamDetail(this._summaryDetailTeam);
      return;
    }

    const positions = ["QB", "RB", "WR", "TE", "K", "DEF"];

    // Build roster data for each team
    const teamData = State.teams.map((team, tIdx) => {
      const color = CONFIG.TEAM_COLORS[tIdx % CONFIG.TEAM_COLORS.length];
      const picks = State.picks.filter(p => p.currentOwner === team && p.player);
      const roster = {};
      const uncategorized = [];
      positions.forEach(pos => roster[pos] = []);

      picks.forEach(p => {
        const pos = this._detectPos(p.player);
        if (pos && roster[pos]) {
          roster[pos].push(p);
        } else {
          uncategorized.push(p);
        }
      });

      // Total projected points
      let totalPts = 0;
      picks.forEach(p => {
        const info = this._getPlayerDB(p.player);
        if (info && info.projPts) totalPts += info.projPts;
      });

      return { team, color, picks, roster, uncategorized, totalPts };
    });

    // Sort by total projected points (highest first) if players loaded
    const sorted = Players.count() > 0
      ? [...teamData].sort((a, b) => b.totalPts - a.totalPts)
      : teamData;

    let cardsHTML = sorted.map((td, rank) => {
      const pickCount = td.picks.length;
      const remaining = State.picks.filter(p => p.currentOwner === td.team && !p.player).length;

      let posRow = positions.map(pos => {
        const players = td.roster[pos];
        const posLabel = pos === "DEF" ? "D/ST" : pos;
        if (players.length === 0) {
          return `<div class="ts-pos-cell ts-pos-empty"><span class="ts-pos-label">${posLabel}</span><span class="ts-pos-dash">—</span></div>`;
        }
        return `<div class="ts-pos-cell">
          <span class="ts-pos-label">${posLabel}</span>
          ${players.map(p => {
            const name = this._cleanPlayerName(p.player);
            const info = this._getPlayerDB(p.player);
            const bye = info && info.bye ? info.bye : null;
            return `<span class="ts-player-name">${UI.esc(name)}${bye ? `<span class="ts-bye">B${bye}</span>` : ''}</span>`;
          }).join('')}
        </div>`;
      }).join('');

      return `
        <div class="ts-card" onclick="Modals._summaryDetailTeam='${td.team.replace(/'/g, "\\'")}';Modals._renderTeamSummary()" style="border-top:3px solid ${td.color}">
          <div class="ts-card-header">
            <span class="ts-team-name" style="color:${td.color}">${UI.esc(td.team)}</span>
            <div class="ts-card-stats">
              <span>${pickCount} player${pickCount !== 1 ? 's' : ''}</span>
              ${remaining > 0 ? `<span>${remaining} left</span>` : ''}
              ${td.totalPts > 0 ? `<span class="ts-total-pts">${td.totalPts.toFixed(1)} pts</span>` : ''}
            </div>
          </div>
          <div class="ts-pos-row">${posRow}</div>
        </div>`;
    }).join('');

    this.open("Team Summary", `
      <p class="modal-hint">All teams by position. Click a team for full detail.${Players.count() > 0 ? ' Sorted by projected points.' : ''}</p>
      <div class="ts-grid">${cardsHTML}</div>
    `, { wide: true });
  },

  _renderTeamDetail(teamName) {
    const tIdx = State.teams.indexOf(teamName);
    const color = CONFIG.TEAM_COLORS[tIdx % CONFIG.TEAM_COLORS.length];
    const positions = ["QB", "RB", "WR", "TE", "K", "DEF"];
    const picks = State.picks.filter(p => p.currentOwner === teamName && p.player);
    const remaining = State.picks.filter(p => p.currentOwner === teamName && !p.player);

    const roster = {};
    positions.forEach(pos => roster[pos] = []);
    const uncategorized = [];

    picks.forEach(p => {
      const pos = this._detectPos(p.player);
      if (pos && roster[pos]) {
        roster[pos].push(p);
      } else {
        uncategorized.push(p);
      }
    });

    // Total projected
    let totalPts = 0;

    // Build position sections
    let rosterHTML = positions.map(pos => {
      const players = roster[pos];
      const posLabel = pos === "DEF" ? "D/ST" : pos;

      let rows = '';
      if (players.length === 0) {
        rows = `<tr><td colspan="6" style="color:var(--text-muted);font-style:italic;padding:6px 8px">—</td></tr>`;
      } else {
        rows = players.map(p => {
          const name = this._cleanPlayerName(p.player);
          const info = this._getPlayerDB(p.player);
          const pts = info && info.projPts ? info.projPts : 0;
          totalPts += pts;
          return `<tr>
            <td style="font-weight:600">${UI.esc(name)}</td>
            <td>${info && info.team ? info.team : '—'}</td>
            <td>${info && info.bye ? info.bye : '—'}</td>
            <td>Rd ${p.round}${p.isKeeper ? ' <span style="color:var(--gold);font-size:10px;font-family:var(--font-display)">K</span>' : ''}</td>
            <td>${info && info.adp < 999 ? Math.round(info.adp) : '—'}</td>
            <td style="font-weight:700">${pts > 0 ? pts.toFixed(1) : '—'}</td>
          </tr>`;
        }).join('');
      }

      return `
        <div class="ts-detail-section">
          <h4 class="ts-detail-pos-header">
            <span class="player-pos-badge pos-${pos.toLowerCase()}" style="font-size:11px;padding:2px 8px">${posLabel}</span>
            <span class="ts-detail-pos-count">${players.length}</span>
          </h4>
          <table class="data-table">
            <thead><tr><th>Player</th><th>Team</th><th>Bye</th><th>Pick</th><th>ADP</th><th>Proj</th></tr></thead>
            <tbody>${rows}</tbody>
          </table>
        </div>`;
    }).join('');

    // Uncategorized
    if (uncategorized.length > 0) {
      rosterHTML += `<div class="ts-detail-section">
        <h4 class="ts-detail-pos-header"><span style="font-size:11px">Other</span><span class="ts-detail-pos-count">${uncategorized.length}</span></h4>
        <table class="data-table"><tbody>
          ${uncategorized.map(p => `<tr><td style="font-weight:600">${UI.esc(p.player)}</td><td colspan="5">Rd ${p.round}</td></tr>`).join('')}
        </tbody></table>
      </div>`;
    }

    // Remaining picks
    let remainHTML = '';
    if (remaining.length > 0) {
      remainHTML = `<div class="ts-detail-section">
        <h4 class="ts-detail-pos-header"><span style="font-size:11px">Remaining Picks</span><span class="ts-detail-pos-count">${remaining.length}</span></h4>
        <div style="display:flex;flex-wrap:wrap;gap:6px">
          ${remaining.map(p => {
            const traded = p.originalOwner !== p.currentOwner;
            return `<span class="ts-remaining-pick">Rd ${p.round} #${p.overall}${traded ? ` <span style="font-size:9px;color:var(--text-muted)">via ${UI.esc(p.originalOwner)}</span>` : ''}</span>`;
          }).join('')}
        </div>
      </div>`;
    }

    // Bye week summary
    const byeCounts = {};
    picks.forEach(p => {
      const info = this._getPlayerDB(p.player);
      if (info && info.bye) {
        byeCounts[info.bye] = (byeCounts[info.bye] || 0) + 1;
      }
    });
    const byeEntries = Object.entries(byeCounts).sort((a, b) => b[1] - a[1]);
    let byeHTML = '';
    if (byeEntries.length > 0) {
      byeHTML = `<div class="ts-detail-section">
        <h4 class="ts-detail-pos-header"><span style="font-size:11px">Bye Week Conflicts</span></h4>
        <div style="display:flex;flex-wrap:wrap;gap:6px">
          ${byeEntries.map(([bye, count]) => {
            const isConflict = count >= 3;
            return `<span class="ts-bye-chip ${isConflict ? 'ts-bye-conflict' : ''}">Week ${bye}: ${count} player${count > 1 ? 's' : ''}</span>`;
          }).join('')}
        </div>
      </div>`;
    }

    this.open("Team Summary", `
      <button class="btn btn-sm" onclick="Modals._summaryDetailTeam=null;Modals._renderTeamSummary()" style="margin-bottom:16px">← All Teams</button>
      <div class="ts-detail-header" style="border-color:${color}">
        <span class="ts-detail-team" style="color:${color}">${UI.esc(teamName)}</span>
        <div class="ts-detail-totals">
          <span>${picks.length} players</span>
          ${totalPts > 0 ? `<span class="ts-total-pts" style="font-size:16px">${totalPts.toFixed(1)} projected pts</span>` : ''}
        </div>
      </div>
      ${rosterHTML}
      ${byeHTML}
      ${remainHTML}
    `, { wide: true });
  },

  // Helpers for team summary (avoid dependency on TeamPanel)
  _detectPos(playerStr) {
    if (!playerStr) return null;
    const match = playerStr.match(/,\s*(QB|RB|WR|TE|K|DEF|DST)\s*$/i);
    if (match) return match[1].toUpperCase() === "DST" ? "DEF" : match[1].toUpperCase();
    const dbPlayer = Players.get(playerStr);
    if (dbPlayer) return dbPlayer.pos;
    return null;
  },

  _cleanPlayerName(playerStr) {
    if (!playerStr) return "";
    return playerStr.replace(/,\s*(QB|RB|WR|TE|K|DEF|DST)\s*$/i, "").trim();
  },

  _getPlayerDB(playerStr) {
    const clean = this._cleanPlayerName(playerStr);
    return Players.get(clean) || Players.get(playerStr) || null;
  },
};

// ─── Modal event listeners ───
document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("modal-backdrop").addEventListener("click", (e) => {
    if (e.target === e.currentTarget) Modals.close();
  });
  document.getElementById("modal-close").addEventListener("click", () => Modals.close());
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") Modals.close();
  });
});
