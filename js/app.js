// ─── Application Entry Point ───
const App = {
  _initialized: false,

  async boot() {
    // Auth initializes first — waits for Firebase auth state
    await Auth.init();
    // If user is already signed in, Auth._showApp() will call App.init()
    // If not, login screen stays visible
  },

  async init() {
    // Prevent double-init from auth state changes
    if (this._initialized) {
      UI.render();
      return;
    }
    this._initialized = true;

    // Initialize state with defaults
    State.init();

    // Subscribe to state changes → re-render UI
    State.onChange(() => UI.render());

    // Initialize Firebase sync
    FirebaseSync.init();

    // Start listening for landmine data (syncs to all clients silently)
    Landmines.listenForUpdates();

    // Load existing draft from Firebase (if any)
    const saved = await FirebaseSync.loadInitial();
    if (saved && saved.picks && saved.picks.length > 0) {
      State.deserialize(saved);
    }

    // Load player database
    await Players.init();

    // Initial render
    UI.render();

    // If draft is in progress, start the timer for current pick
    if (State.draftStarted && !State.draftComplete && State.currentPick) {
      Timer.start(State.currentPick.currentOwner);
    }

    // Wire up the OTC draft button
    document.getElementById("otc-draft-btn").addEventListener("click", () => {
      if (Auth.canDraftCurrentPick()) {
        Modals.openDraft();
      }
    });

    console.log(`Fantasy Draft Board initialized. Role: ${Auth.role}`);
  },

  async startDraft() {
    if (!Auth.canAdmin()) return;

    // Generate landmines (no-ops if already set in Firebase)
    await Landmines.generate();

    let firstOpen = -1;
    for (let i = 0; i < State.picks.length; i++) {
      if (!State.picks[i].player) { firstOpen = i; break; }
    }

    if (firstOpen === -1) {
      State.mutate({ draftStarted: true, draftComplete: true });
      return;
    }

    State.mutate({
      draftStarted: true,
      draftComplete: false,
      currentPickIndex: firstOpen,
    });

    Timer.start(State.picks[firstOpen].currentOwner);
    setTimeout(() => UI.scrollToCurrent(), 300);
  },

  undoLast() {
    if (!Auth.canAdmin()) return;

    let lastIdx = -1;
    for (let i = State.picks.length - 1; i >= 0; i--) {
      if (State.picks[i].player && !State.picks[i].isKeeper) {
        lastIdx = i;
        break;
      }
    }
    if (lastIdx === -1) return;

    Timer.stop();

    const newPicks = State.picks.map((p, i) =>
      i === lastIdx ? { ...p, player: null } : p
    );

    State.mutate({
      picks: newPicks,
      currentPickIndex: lastIdx,
      draftComplete: false,
      timerData: { ...State.timerData },
    });

    Timer.start(newPicks[lastIdx].currentOwner);
  },

  // One-time: regenerate picks with TRADED_PICKS applied, preserving keeper assignments
  applyTrades() {
    if (!Auth.canAdmin()) return;
    if (!confirm("Apply pre-draft pick trades? This regenerates pick ownership from CONFIG.TRADED_PICKS and preserves any keeper assignments already set.")) return;

    // Build fresh picks with trades applied
    const freshPicks = State.generateSnakeDraft(State.teams);

    // Re-apply any keeper assignments from current picks onto fresh picks
    State.picks.forEach(p => {
      if (p.isKeeper && p.player) {
        const match = freshPicks.find(fp => fp.overall === p.overall);
        if (match) {
          match.player = p.player;
          match.isKeeper = true;
        }
      }
    });

    const firstOpen = freshPicks.findIndex(fp => !fp.player);

    State.mutate({
      picks: freshPicks,
      currentPickIndex: firstOpen === -1 ? 0 : firstOpen,
      draftStarted: false,
      draftComplete: false,
      timerData: Object.fromEntries(State.teams.map(t => [t, 0])),
    });
  },

  resetDraft() {
    if (!Auth.canAdmin()) return;
    if (!confirm("Reset live draft picks? This clears all drafted players but preserves keepers, trades, and pick order. This cannot be undone.")) return;

    Timer.stop();

    // Only clear player values — preserve currentOwner, originalOwner, isKeeper, trades
    const clearedPicks = State.picks.map(p => ({
      ...p,
      player: p.isKeeper ? p.player : null,  // Keep keeper assignments, clear live picks
    }));

    // Find first open (non-keeper) pick to reset clock to
    const firstOpen = clearedPicks.findIndex(p => !p.player);

    State.mutate({
      picks: clearedPicks,
      currentPickIndex: firstOpen === -1 ? 0 : firstOpen,
      draftStarted: false,
      draftComplete: false,
      timerData: Object.fromEntries(State.teams.map(t => [t, 0])),
    });
  },
};

// ─── Boot ───
document.addEventListener("DOMContentLoaded", () => App.boot());
