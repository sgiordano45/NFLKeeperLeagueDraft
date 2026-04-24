// ─── State Management ───
// Single source of truth for the draft. All mutations go through
// mutateState() which triggers Firebase sync + UI re-render.

const State = {
  teams: [...CONFIG.DEFAULT_TEAMS],
  picks: [],           // Array of pick objects, ordered by overall #
  currentPickIndex: 0, // Index into picks[] for the current pick
  draftStarted: false,
  draftComplete: false,
  timerData: {},       // { teamName: totalSeconds }
  _listeners: [],

  // Subscribe to state changes
  onChange(fn) {
    this._listeners.push(fn);
  },

  // Notify all listeners
  _notify() {
    this._listeners.forEach(fn => fn(this));
  },

  // Apply a partial update, sync to Firebase, and re-render
  mutate(partial, opts = {}) {
    Object.assign(this, partial);
    this._notify();
    if (!opts.skipSync) {
      FirebaseSync.push(this.serialize());
    }
  },

  // Generate a clean snake draft
  generateSnakeDraft(teams) {
    const picks = [];
    for (let r = 0; r < CONFIG.NUM_ROUNDS; r++) {
      const order = r % 2 === 0 ? [...teams] : [...teams].reverse();
      order.forEach((team, i) => {
        picks.push({
          overall: r * CONFIG.NUM_TEAMS + i + 1,
          round: r + 1,
          pickInRound: i + 1,
          originalOwner: team,
          currentOwner: team,
          player: null,
          isKeeper: false,
        });
      });
    }
    return picks;
  },

  // Initialize with default state
  init() {
    this.picks = this.generateSnakeDraft(this.teams);
    this.currentPickIndex = 0;
    this.draftStarted = false;
    this.draftComplete = false;
    this.timerData = {};
    CONFIG.DEFAULT_TEAMS.forEach((_, i) => {
      this.timerData[this.teams[i]] = 0;
    });
  },

  // Serialize for Firebase
  serialize() {
    return {
      teams: this.teams,
      picks: this.picks,
      currentPickIndex: this.currentPickIndex,
      draftStarted: this.draftStarted,
      draftComplete: this.draftComplete,
      timerData: this.timerData,
    };
  },

  // Deserialize from Firebase snapshot
  deserialize(data) {
    if (!data) return;
    if (data.teams) this.teams = data.teams;
    if (data.picks) this.picks = data.picks;
    if (typeof data.currentPickIndex === "number") this.currentPickIndex = data.currentPickIndex;
    if (typeof data.draftStarted === "boolean") this.draftStarted = data.draftStarted;
    if (typeof data.draftComplete === "boolean") this.draftComplete = data.draftComplete;
    if (data.timerData) this.timerData = data.timerData;
    this._notify();
  },

  // ─── Derived helpers ───
  get currentPick() {
    return this.picks[this.currentPickIndex] || null;
  },

  teamIndex(teamName) {
    return this.teams.indexOf(teamName);
  },

  teamColor(teamName) {
    const idx = this.teamIndex(teamName);
    return CONFIG.TEAM_COLORS[idx % CONFIG.TEAM_COLORS.length] || "#888";
  },

  // Get the pick for a specific draft slot (original team position) in a round
  pickForTeamRound(team, round) {
    return this.picks.find(p => p.round === round && p.originalOwner === team) || null;
  },

  // Find next open pick after a given index
  nextOpenPickIndex(afterIndex) {
    for (let i = afterIndex + 1; i < this.picks.length; i++) {
      if (!this.picks[i].player) return i;
    }
    return -1;
  },

  // All drafted players (for duplicate checking)
  draftedPlayers() {
    return this.picks.filter(p => p.player).map(p => p.player.toUpperCase());
  },
};
