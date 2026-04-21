// ─── Modal Manager ───
const Modals = {
  _selectedPickIndex: null,

  open(title, bodyHTML) {
    document.getElementById("modal-title").textContent = title;
    document.getElementById("modal-body").innerHTML = bodyHTML;
    document.getElementById("modal-backdrop").classList.remove("hidden");
  },

  close() {
    document.getElementById("modal-backdrop").classList.add("hidden");
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

    this.open("Draft Player", `
      <div class="pick-info-box">
        <div class="pick-info-meta">Pick #${pick.overall} · Round ${pick.round} · Pick ${pick.pickInRound}</div>
        <div class="pick-info-team" style="color:${color}">${UI.esc(pick.currentOwner)}</div>
        ${traded ? `<span class="pick-info-via">(via ${UI.esc(pick.originalOwner)})</span>` : ""}
      </div>
      <input class="form-input form-input-lg" id="draft-player-input" placeholder="Player name…" autofocus
        onkeydown="if(event.key==='Enter')Modals.confirmDraft()" />
      <button class="btn btn-gold btn-full mt-12" style="padding:12px 0;font-size:16px"
        onclick="Modals.confirmDraft()">Confirm Pick</button>
    `);

    // Focus the input after modal renders
    setTimeout(() => {
      const input = document.getElementById("draft-player-input");
      if (input) input.focus();
    }, 50);
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
