// ─── Team Panel (slide-in sidebar) ───
// Shows: My Roster (by position), Watchlist, Draft Needs tracker
// Watchlist is stored per-user in Firebase under teamClaims/{team}/watchlist

const TeamPanel = {
  _open: false,
  _watchlist: [],  // Array of player name strings

  // ─── Toggle panel ───
  toggle() {
    this._open ? this.close() : this.open();
  },

  open() {
    if (!Auth.hasTeam()) return;
    this._open = true;
    this._loadWatchlist().then(() => this.render());
    document.getElementById("team-panel").classList.add("is-open");
    document.getElementById("team-panel-overlay").classList.remove("hidden");
  },

  close() {
    this._open = false;
    document.getElementById("team-panel").classList.remove("is-open");
    document.getElementById("team-panel-overlay").classList.add("hidden");
  },

  // ─── Render panel contents ───
  render() {
    if (!this._open || !Auth.hasTeam()) return;

    const team = Auth.claimedTeam;
    const color = State.teamColor(team);
    const body = document.getElementById("team-panel-body");

    const myPicks = State.picks.filter(p => p.currentOwner === team);
    const filledPicks = myPicks.filter(p => p.player);
    const remainingPicks = myPicks.filter(p => !p.player);

    // ── Categorize roster by position ──
    const positions = ["QB", "RB", "WR", "TE", "K", "DEF"];
    const roster = {};
    const uncategorized = [];

    positions.forEach(pos => roster[pos] = []);

    filledPicks.forEach(p => {
      const pos = this._detectPosition(p.player);
      if (pos && roster[pos]) {
        roster[pos].push(p);
      } else {
        uncategorized.push(p);
      }
    });

    // ── Roster HTML ──
    let rosterHTML = `<div class="tp-section">
      <h3 class="tp-section-title">My Roster <span class="tp-count">${filledPicks.length} players</span></h3>`;

    positions.forEach(pos => {
      const players = roster[pos];
      const posLabel = pos === "DEF" ? "D/ST" : pos;
      rosterHTML += `<div class="tp-pos-group">
        <div class="tp-pos-header">${posLabel} <span class="tp-pos-count">${players.length}</span></div>`;
      if (players.length === 0) {
        rosterHTML += `<div class="tp-empty">—</div>`;
      } else {
        players.forEach(p => {
          const name = this._cleanName(p.player);
          const info = this._getPlayerInfo(p.player);
          let metaParts = [`Rd ${p.round}`];
          if (p.isKeeper) metaParts.push('K');
          if (info && info.team) metaParts.push(info.team);
          if (info && info.bye) metaParts.push(`Bye ${info.bye}`);
          rosterHTML += `<div class="tp-player">
            <span class="tp-player-name">${UI.esc(name)}</span>
            <span class="tp-player-meta">${metaParts.join(' · ')}${info && info.projPts ? ` · <strong>${info.projPts.toFixed(1)}pts</strong>` : ''}</span>
          </div>`;
        });
      }
      rosterHTML += `</div>`;
    });

    if (uncategorized.length > 0) {
      rosterHTML += `<div class="tp-pos-group">
        <div class="tp-pos-header">Other <span class="tp-pos-count">${uncategorized.length}</span></div>`;
      uncategorized.forEach(p => {
        const info = this._getPlayerInfo(p.player);
        rosterHTML += `<div class="tp-player">
          <span class="tp-player-name">${UI.esc(p.player)}</span>
          <span class="tp-player-meta">Rd ${p.round}${info && info.team ? ' · ' + info.team : ''}${info && info.bye ? ' · Bye ' + info.bye : ''}</span>
        </div>`;
      });
      rosterHTML += `</div>`;
    }

    rosterHTML += `</div>`;

    // ── Remaining picks ──
    let remainHTML = `<div class="tp-section">
      <h3 class="tp-section-title">Remaining Picks <span class="tp-count">${remainingPicks.length}</span></h3>`;
    if (remainingPicks.length === 0) {
      remainHTML += `<div class="tp-empty">All picks used</div>`;
    } else {
      remainingPicks.forEach(p => {
        const traded = p.originalOwner !== p.currentOwner;
        remainHTML += `<div class="tp-pick-remaining">
          <span>Rd ${p.round} · #${p.overall}</span>
          ${traded ? `<span class="tp-via">via ${UI.esc(p.originalOwner)}</span>` : ""}
        </div>`;
      });
    }
    remainHTML += `</div>`;

    // ── Draft Needs ──
    const needs = this._calcNeeds(roster);
    let needsHTML = `<div class="tp-section">
      <h3 class="tp-section-title">Draft Needs</h3>
      <div class="tp-needs-grid">`;
    needs.forEach(n => {
      const urgencyClass = n.urgency === "high" ? "tp-need-high"
        : n.urgency === "medium" ? "tp-need-medium"
        : "tp-need-low";
      needsHTML += `<div class="tp-need ${urgencyClass}">
        <span class="tp-need-pos">${n.pos}</span>
        <span class="tp-need-have">${n.have}/${n.ideal}</span>
        <span class="tp-need-label">${n.label}</span>
      </div>`;
    });
    needsHTML += `</div></div>`;

    // ── Watchlist ──
    let watchHTML = `<div class="tp-section">
      <h3 class="tp-section-title">Watchlist <span class="tp-count">${this._watchlist.length}</span></h3>
      <div class="tp-watchlist-add">
        <input class="form-input" id="watchlist-input" placeholder="Add player…"
          onkeydown="if(event.key==='Enter')TeamPanel.addToWatchlist()" />
        <button class="btn btn-sm btn-success" onclick="TeamPanel.addToWatchlist()">+</button>
      </div>`;

    if (this._watchlist.length === 0) {
      watchHTML += `<div class="tp-empty">No players on watchlist</div>`;
    } else {
      const draftedPlayers = State.draftedPlayers();
      this._watchlist.forEach((player, i) => {
        const isDrafted = draftedPlayers.includes(player.toUpperCase());
        watchHTML += `<div class="tp-watch-item ${isDrafted ? 'is-drafted' : ''}">
          <span class="tp-watch-name">${UI.esc(player)}${isDrafted ? ' <span class="tp-drafted-tag">DRAFTED</span>' : ''}</span>
          <button class="keeper-remove" onclick="TeamPanel.removeFromWatchlist(${i})">&times;</button>
        </div>`;
      });
    }
    watchHTML += `</div>`;

    body.innerHTML = `
      <div class="tp-team-header" style="border-color:${color}">
        <span class="tp-team-name" style="color:${color}">${UI.esc(team)}</span>
      </div>
      ${rosterHTML}
      ${needsHTML}
      ${remainHTML}
      ${watchHTML}
    `;
  },

  // ─── Watchlist persistence (Firebase) ───
  async _loadWatchlist() {
    if (!Auth.hasTeam()) return;
    try {
      const snap = await window.db.ref(`${CONFIG.FB_PATH}/watchlists/${Auth.claimedTeam}`).once("value");
      this._watchlist = snap.val() || [];
    } catch (e) {
      this._watchlist = [];
    }
  },

  async _saveWatchlist() {
    if (!Auth.hasTeam()) return;
    try {
      await window.db.ref(`${CONFIG.FB_PATH}/watchlists/${Auth.claimedTeam}`).set(this._watchlist);
    } catch (e) {
      console.error("Failed to save watchlist:", e);
    }
  },

  addToWatchlist() {
    const input = document.getElementById("watchlist-input");
    if (!input) return;
    const name = input.value.trim();
    if (!name) return;

    // Don't add duplicates
    if (this._watchlist.some(p => p.toUpperCase() === name.toUpperCase())) {
      input.value = "";
      return;
    }

    this._watchlist.push(name);
    this._saveWatchlist();
    input.value = "";
    this.render();
  },

  removeFromWatchlist(index) {
    this._watchlist.splice(index, 1);
    this._saveWatchlist();
    this.render();
  },

  // ─── Position detection from player name ───
  // First checks "Name, POS" format, then looks up in Players database
  _detectPosition(playerStr) {
    if (!playerStr) return null;
    // Check comma format first
    const match = playerStr.match(/,\s*(QB|RB|WR|TE|K|DEF|DST)\s*$/i);
    if (match) return match[1].toUpperCase() === "DST" ? "DEF" : match[1].toUpperCase();
    // Fall back to Players database
    const dbPlayer = Players.get(playerStr);
    if (dbPlayer) return dbPlayer.pos;
    return null;
  },

  _cleanName(playerStr) {
    if (!playerStr) return "";
    // Strip comma+position suffix
    const cleaned = playerStr.replace(/,\s*(QB|RB|WR|TE|K|DEF|DST)\s*$/i, "").trim();
    return cleaned;
  },

  // Get full player info for display
  _getPlayerInfo(playerStr) {
    const cleanName = this._cleanName(playerStr);
    return Players.get(cleanName) || Players.get(playerStr) || null;
  },

  // ─── Draft needs calculator ───
  _calcNeeds(roster) {
    // Typical 14-round roster targets
    const targets = {
      QB: { ideal: 2, label: "Quarterbacks" },
      RB: { ideal: 4, label: "Running Backs" },
      WR: { ideal: 4, label: "Wide Receivers" },
      TE: { ideal: 2, label: "Tight Ends" },
      K:  { ideal: 1, label: "Kickers" },
      DEF:{ ideal: 1, label: "Defense" },
    };

    return Object.entries(targets).map(([pos, t]) => {
      const have = roster[pos] ? roster[pos].length : 0;
      let urgency = "low";
      if (have === 0) urgency = "high";
      else if (have < t.ideal) urgency = "medium";
      return { pos: pos === "DEF" ? "D/ST" : pos, have, ideal: t.ideal, label: t.label, urgency };
    });
  },
};

// ─── Listen for state changes to update panel if open ───
document.addEventListener("DOMContentLoaded", () => {
  State.onChange(() => {
    if (TeamPanel._open) TeamPanel.render();
  });
});
