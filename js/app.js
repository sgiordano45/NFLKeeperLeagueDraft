// ─── Application Entry Point ───
const App = {
  async init() {
    // Initialize state with defaults
    State.init();

    // Subscribe to state changes → re-render UI
    State.onChange(() => UI.render());

    // Initialize Firebase sync
    FirebaseSync.init();

    // Load existing draft from Firebase (if any)
    const saved = await FirebaseSync.loadInitial();
    if (saved && saved.picks && saved.picks.length > 0) {
      State.deserialize(saved);
    }

    // Initial render
    UI.render();

    // If draft is in progress, start the timer for current pick
    if (State.draftStarted && !State.draftComplete && State.currentPick) {
      Timer.start(State.currentPick.currentOwner);
    }

    // Wire up the OTC draft button
    document.getElementById("otc-draft-btn").addEventListener("click", () => {
      Modals.openDraft();
    });

    console.log("Fantasy Draft Board initialized.");
  },

  startDraft() {
    // Find first unfilled pick
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

    // Start timer for the first pick's team
    Timer.start(State.picks[firstOpen].currentOwner);

    setTimeout(() => UI.scrollToCurrent(), 300);
  },

  undoLast() {
    // Find last drafted non-keeper pick
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

    // Restart timer for the restored pick
    Timer.start(newPicks[lastIdx].currentOwner);
  },

  resetDraft() {
    if (!confirm("Reset entire draft? This will erase all picks, keepers, and trades. This cannot be undone.")) return;

    Timer.stop();
    State.init();
    State.mutate(State.serialize());
  },
};

// ─── Boot ───
document.addEventListener("DOMContentLoaded", () => App.init());
