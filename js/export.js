// ─── Draft Export Module ───
const DraftExport = {

  // ─── Build the full export payload from current state ───
  _buildPayload() {
    const now = new Date();
    const draftedPicks = State.picks.filter(p => p.player);

    // Rosters grouped by team → position
    const positions = ["QB", "RB", "WR", "TE"];
    const rosters = {};
    State.teams.forEach(team => {
      rosters[team] = { QB: [], RB: [], WR: [], TE: [], Other: [] };
      State.picks
        .filter(p => p.currentOwner === team && p.player)
        .forEach(p => {
          const pos = this._detectPos(p.player);
          const bucket = pos && rosters[team][pos] ? pos : "Other";
          rosters[team][bucket].push({
            player: p.player,
            round: p.round,
            pick: p.pickInRound,
            overall: p.overall,
            isKeeper: p.isKeeper || false,
            tradedFrom: p.originalOwner !== p.currentOwner ? p.originalOwner : null,
          });
        });
    });

    // Trade log — picks where owner changed
    const trades = State.picks
      .filter(p => p.originalOwner !== p.currentOwner)
      .map(p => ({
        overall: p.overall,
        round: p.round,
        pick: p.pickInRound,
        originalOwner: p.originalOwner,
        currentOwner: p.currentOwner,
        player: p.player || null,
      }));

    return {
      meta: {
        draftYear: CONFIG.DRAFT_YEAR,
        exportedAt: now.toISOString(),
        exportedAtDisplay: now.toLocaleString(),
        numTeams: CONFIG.NUM_TEAMS,
        numRounds: CONFIG.NUM_ROUNDS,
        totalPicks: draftedPicks.length,
        draftComplete: State.draftComplete,
      },
      pickLog: State.picks
        .filter(p => p.player)
        .sort((a, b) => a.overall - b.overall)
        .map(p => ({
          overall: p.overall,
          round: p.round,
          pick: p.pickInRound,
          team: p.currentOwner,
          player: p.player,
          isKeeper: p.isKeeper || false,
          tradedFrom: p.originalOwner !== p.currentOwner ? p.originalOwner : null,
        })),
      rosters,
      trades,
      teams: State.teams,
    };
  },

  // ─── JSON Export ───
  exportJSON() {
    const payload = this._buildPayload();
    const json = JSON.stringify(payload, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    this._download(blob, `draft-results-${CONFIG.DRAFT_YEAR}.json`);
  },

  // ─── CSV Export ───
  exportCSV() {
    const payload = this._buildPayload();
    const rows = [
      ["Overall", "Round", "Pick", "Team", "Player", "Type", "Traded From"],
      ...payload.pickLog.map(p => [
        p.overall,
        p.round,
        p.pick,
        p.team,
        p.player,
        p.isKeeper ? "Keeper" : "Draft",
        p.tradedFrom || "",
      ])
    ];
    const csv = rows.map(r => r.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    this._download(blob, `draft-results-${CONFIG.DRAFT_YEAR}.csv`);
  },

  // ─── Trigger browser download ───
  _download(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  },

  // ─── Position detection (mirrors Modals helper) ───
  _detectPos(playerStr) {
    if (!playerStr) return null;
    const match = playerStr.match(/,\s*(QB|RB|WR|TE|K|DEF|DST)\s*$/i);
    if (match) return match[1].toUpperCase() === "DST" ? "DEF" : match[1].toUpperCase();
    const dbPlayer = Players.get(playerStr);
    if (dbPlayer) return dbPlayer.pos;
    return null;
  },

  // ─── Auto-prompt shown once when draft completes ───
  _promptShown: false,

  maybePrompt() {
    if (this._promptShown) return;
    if (!State.draftComplete) return;
    if (!Auth.canAdmin()) return;
    this._promptShown = true;

    // Small delay so the board finishes rendering first
    setTimeout(() => Modals.openExportPrompt(), 600);
  },

  resetPrompt() {
    this._promptShown = false;
  },
};
