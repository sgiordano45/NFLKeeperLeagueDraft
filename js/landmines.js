// ─── Landmines (Shot Game) ───
// 10 random top-100 players (non-K, non-DEF, non-keeper) are secretly
// selected when the draft starts. If you draft one — SHOTS.
//
// Stored in Firebase under drafts/{year}/landmines (array of player names).
// The admin cannot see them in the app UI — only in the Firebase console.

const Landmines = {
  _mines: [],       // Array of player name strings (clean names, no POS suffix)
  _revealed: [],    // Names already triggered this session (avoid double-popup)
  _loaded: false,

  // ─── Generate landmines at draft start ───
  // Called once by App.startDraft(). No-ops if already set in Firebase.
  async generate() {
    // Check Firebase first — don't regenerate if already set
    try {
      const snap = await window.db.ref(`${CONFIG.FB_PATH}/landmines`).once("value");
      const existing = snap.val();
      if (existing && Array.isArray(existing) && existing.length === 10) {
        this._mines = existing;
        this._loaded = true;
        console.log("Landmines already set — loaded from Firebase.");
        return;
      }
    } catch (e) {
      console.error("Landmines: failed to check Firebase:", e);
    }

    // Get all eligible players: top 100 ADP, not K/DEF/DST, not a keeper
    const keeperNames = State.picks
      .filter(p => p.isKeeper && p.player)
      .map(p => this._cleanName(p.player).toUpperCase());

    const eligible = Players.getAll()
      .filter(p => {
        const pos = p.pos ? p.pos.toUpperCase() : "";
        if (pos === "K" || pos === "DEF" || pos === "DST") return false;
        if ((p.adp || 999) > 100) return false;
        if (keeperNames.includes(p.name.toUpperCase())) return false;
        return true;
      })
      .sort((a, b) => (a.adp || 999) - (b.adp || 999));

    if (eligible.length < 10) {
      console.warn(`Landmines: only ${eligible.length} eligible players found, need 10.`);
      if (eligible.length === 0) return;
    }

    // Fisher-Yates shuffle, pick 10
    const pool = [...eligible];
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    const chosen = pool.slice(0, Math.min(10, pool.length)).map(p => p.name);

    this._mines = chosen;
    this._loaded = true;

    // Save to Firebase (silently — don't expose in UI)
    try {
      await window.db.ref(`${CONFIG.FB_PATH}/landmines`).set(chosen);
      console.log("Landmines set:", chosen.length, "mines hidden.");
    } catch (e) {
      console.error("Landmines: failed to save to Firebase:", e);
    }
  },

  // ─── Load from Firebase (for non-commissioner clients) ───
  async load() {
    if (this._loaded) return;
    try {
      const snap = await window.db.ref(`${CONFIG.FB_PATH}/landmines`).once("value");
      const data = snap.val();
      if (data && Array.isArray(data)) {
        this._mines = data;
        this._loaded = true;
      }
    } catch (e) {
      console.error("Landmines: load failed:", e);
    }
  },

  // ─── Check if a drafted player is a landmine ───
  // playerStr can be "Name, POS" format or plain name
  // Returns the clean player name if it's a mine, null otherwise
  check(playerStr) {
    if (!this._loaded || this._mines.length === 0) return null;
    const clean = this._cleanName(playerStr).toUpperCase();
    const hit = this._mines.find(m => m.toUpperCase() === clean);
    if (!hit) return null;
    // Don't trigger twice for the same player
    if (this._revealed.includes(clean)) return null;
    this._revealed.push(clean);
    return hit;
  },

  // ─── BOOM: show the landmine popup ───
  trigger(playerName, teamName) {
    // Close any open modal first
    Modals.close();

    const teamColor = State.teamColor(teamName);

    // Build overlay
    const overlay = document.createElement("div");
    overlay.id = "landmine-overlay";
    overlay.innerHTML = `
      <div class="lm-backdrop"></div>
      <div class="lm-content">
        <div class="lm-warning-strip">⚠️ LANDMINE DETECTED ⚠️</div>

        <div class="lm-bomb">💣</div>

        <div class="lm-team" style="color:${teamColor}">${UI.esc(teamName)}</div>
        <div class="lm-drafted-label">just drafted a LANDMINE:</div>
        <div class="lm-player-name">${UI.esc(playerName)}</div>

        <div class="lm-shots-text">DO A SHOT! 🥃</div>

        <div class="lm-video-wrap">
          <iframe
            id="lm-yt-frame"
            width="480"
            height="270"
            src="https://www.youtube.com/embed/m8wysqpxtro?autoplay=1&start=0"
            frameborder="0"
            allow="autoplay; encrypted-media"
            allowfullscreen
          ></iframe>
        </div>

        <button class="lm-close-btn" onclick="Landmines.dismiss()">
          💀 DRINK UP · CLOSE
        </button>
      </div>
    `;

    document.body.appendChild(overlay);

    // Animate in
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        overlay.classList.add("lm-visible");
      });
    });

    // Shake the screen
    document.body.classList.add("lm-shake");
    setTimeout(() => document.body.classList.remove("lm-shake"), 800);
  },

  dismiss() {
    const overlay = document.getElementById("landmine-overlay");
    if (!overlay) return;
    overlay.classList.remove("lm-visible");
    setTimeout(() => overlay.remove(), 400);
  },

  // ─── Clear landmines (commissioner reset) ───
  async clear() {
    this._mines = [];
    this._revealed = [];
    this._loaded = false;
    try {
      await window.db.ref(`${CONFIG.FB_PATH}/landmines`).remove();
    } catch (e) {
      console.error("Landmines: failed to clear:", e);
    }
  },

  // ─── Helpers ───
  _cleanName(playerStr) {
    if (!playerStr) return "";
    return playerStr.replace(/,\s*(QB|RB|WR|TE|K|DEF|DST)\s*$/i, "").trim();
  },

  // ─── Listen for Firebase updates (so all clients know the mines) ───
  listenForUpdates() {
    window.db.ref(`${CONFIG.FB_PATH}/landmines`).on("value", (snap) => {
      const data = snap.val();
      if (data && Array.isArray(data)) {
        this._mines = data;
        this._loaded = true;
      }
    });
  },
};
