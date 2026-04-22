// ─── Player Database ───
// Stores all players in Firebase under drafts/{year}/players
// Commissioner uploads CSV, parsed client-side, pushed to Firebase.
// Available to all clients for autocomplete, roster display, etc.
//
// Player object shape:
// { name, pos, team, bye, adp, projPts }

const Players = {
  _db: [],          // Full player list from Firebase
  _byName: {},      // Quick lookup: uppercase name → player obj
  _loaded: false,

  // ─── Initialize: load from Firebase ───
  async init() {
    await this._loadFromFirebase();
    this._listenForChanges();
  },

  async _loadFromFirebase() {
    try {
      const snap = await window.db.ref(`${CONFIG.FB_PATH}/players`).once("value");
      const data = snap.val();
      if (data && Array.isArray(data)) {
        this._db = data;
      } else if (data) {
        // Firebase sometimes stores arrays as objects with numeric keys
        this._db = Object.values(data);
      } else {
        this._db = [];
      }
      this._buildIndex();
      this._loaded = true;
    } catch (e) {
      console.error("Failed to load players:", e);
      this._db = [];
    }
  },

  _listenForChanges() {
    window.db.ref(`${CONFIG.FB_PATH}/players`).on("value", (snap) => {
      const data = snap.val();
      if (data && Array.isArray(data)) {
        this._db = data;
      } else if (data) {
        this._db = Object.values(data);
      } else {
        this._db = [];
      }
      this._buildIndex();
      this._loaded = true;
    });
  },

  _buildIndex() {
    this._byName = {};
    this._db.forEach(p => {
      this._byName[p.name.toUpperCase()] = p;
    });
  },

  // ─── Lookup ───
  get(name) {
    if (!name) return null;
    return this._byName[name.toUpperCase()] || null;
  },

  getAll() {
    return this._db;
  },

  count() {
    return this._db.length;
  },

  isLoaded() {
    return this._loaded;
  },

  // ─── Search (for autocomplete) ───
  // Returns up to `limit` players matching the query, excluding already-drafted
  search(query, limit = 15) {
    if (!query || query.length < 2) return [];

    const q = query.toUpperCase();
    const drafted = State.draftedPlayers(); // Returns uppercase names

    // Also match against "Name, POS" format used in picks
    const draftedClean = drafted.map(d => d.replace(/,\s*(QB|RB|WR|TE|K|DEF|DST)\s*$/i, "").trim());

    const results = [];
    for (const p of this._db) {
      if (results.length >= limit) break;
      const nameUp = p.name.toUpperCase();
      if (!nameUp.includes(q)) continue;

      // Check if already drafted
      const isDrafted = draftedClean.includes(nameUp) || drafted.includes(nameUp) ||
        drafted.includes(`${p.name.toUpperCase()}, ${p.pos.toUpperCase()}`);
      if (isDrafted) continue;

      results.push(p);
    }
    return results;
  },

  // ─── Get all undrafted players sorted by ADP ───
  getAvailable(posFilter = null) {
    const drafted = State.draftedPlayers();
    const draftedClean = drafted.map(d => d.replace(/,\s*(QB|RB|WR|TE|K|DEF|DST)\s*$/i, "").trim());

    return this._db
      .filter(p => {
        const nameUp = p.name.toUpperCase();
        const isDrafted = draftedClean.includes(nameUp) ||
          drafted.includes(nameUp) ||
          drafted.includes(`${nameUp}, ${p.pos.toUpperCase()}`);
        if (isDrafted) return false;
        if (posFilter && p.pos.toUpperCase() !== posFilter.toUpperCase()) return false;
        return true;
      })
      .sort((a, b) => (a.adp || 999) - (b.adp || 999));
  },

  // ─── CSV Parsing ───
  // Flexible parser: auto-detects column mapping from header row
  parseCSV(csvText) {
    const lines = csvText.split(/\r?\n/).filter(l => l.trim());
    if (lines.length < 2) return { players: [], error: "CSV needs a header row and at least one data row." };

    // Parse header
    const headers = this._splitCSVLine(lines[0]).map(h => h.toLowerCase().trim());

    // Map columns — flexible matching
    const colMap = {
      name: this._findCol(headers, ["name", "player", "player_name", "playername", "full_name"]),
      pos: this._findCol(headers, ["pos", "position", "pos."]),
      team: this._findCol(headers, ["team", "tm", "nfl_team", "nflteam"]),
      bye: this._findCol(headers, ["bye", "bye_week", "byeweek", "bye week"]),
      adp: this._findCol(headers, ["adp", "rank", "ranking", "overall", "ovr", "avg_adp"]),
      projPts: this._findCol(headers, ["pts", "points", "proj", "projected", "proj_pts", "projpts", "fpts", "fantasy_pts", "fantasypts", "projected points", "proj points"]),
    };

    if (colMap.name === -1) return { players: [], error: "Could not find a 'Name' or 'Player' column in the CSV header." };
    if (colMap.pos === -1) return { players: [], error: "Could not find a 'Pos' or 'Position' column in the CSV header." };

    const players = [];
    const errors = [];

    for (let i = 1; i < lines.length; i++) {
      const cols = this._splitCSVLine(lines[i]);
      const name = (cols[colMap.name] || "").trim();
      const pos = (cols[colMap.pos] || "").trim().toUpperCase();

      if (!name || !pos) continue;

      // Normalize position
      const normPos = pos === "DST" ? "DEF" : pos;
      if (!["QB", "RB", "WR", "TE", "K", "DEF"].includes(normPos)) {
        errors.push(`Row ${i + 1}: Unknown position "${pos}" for ${name}`);
        continue;
      }

      players.push({
        name,
        pos: normPos,
        team: colMap.team >= 0 ? (cols[colMap.team] || "").trim().toUpperCase() : "",
        bye: colMap.bye >= 0 ? parseInt(cols[colMap.bye]) || 0 : 0,
        adp: colMap.adp >= 0 ? parseFloat(cols[colMap.adp]) || 999 : 999,
        projPts: colMap.projPts >= 0 ? parseFloat(cols[colMap.projPts]) || 0 : 0,
      });
    }

    // Sort by ADP
    players.sort((a, b) => a.adp - b.adp);

    return { players, errors };
  },

  _findCol(headers, aliases) {
    for (const alias of aliases) {
      const idx = headers.indexOf(alias);
      if (idx >= 0) return idx;
    }
    return -1;
  },

  _splitCSVLine(line) {
    const result = [];
    let current = "";
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        inQuotes = !inQuotes;
      } else if (ch === "," && !inQuotes) {
        result.push(current);
        current = "";
      } else {
        current += ch;
      }
    }
    result.push(current);
    return result;
  },

  // ─── Save to Firebase ───
  async saveToDB(players) {
    try {
      await window.db.ref(`${CONFIG.FB_PATH}/players`).set(players);
      this._db = players;
      this._buildIndex();
      return true;
    } catch (e) {
      console.error("Failed to save players:", e);
      return false;
    }
  },

  // ─── Update a single player ───
  async updatePlayer(index, updates) {
    if (index < 0 || index >= this._db.length) return;
    Object.assign(this._db[index], updates);
    await this.saveToDB(this._db);
  },

  // ─── Delete a player ───
  async deletePlayer(index) {
    if (index < 0 || index >= this._db.length) return;
    this._db.splice(index, 1);
    await this.saveToDB(this._db);
  },

  // ─── Clear all ───
  async clearAll() {
    await window.db.ref(`${CONFIG.FB_PATH}/players`).remove();
    this._db = [];
    this._byName = {};
  },
};
