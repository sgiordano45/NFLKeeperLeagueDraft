// ─── Draft Pick Timer ───
// Tracks cumulative time each team spends on the clock.
// Not a countdown — it counts UP, and the total is saved per team.

const Timer = {
  _interval: null,
  _currentTeam: null,
  _tickStart: null,

  start(teamName) {
    this.stop(); // Clear any existing timer
    this._currentTeam = teamName;
    this._tickStart = Date.now();

    this._interval = setInterval(() => {
      this._updateDisplay();
    }, 1000);

    this._updateDisplay();
  },

  stop() {
    if (this._interval) {
      clearInterval(this._interval);
      this._interval = null;
    }

    // Bank the elapsed time for the current team
    if (this._currentTeam && this._tickStart) {
      const elapsed = Math.floor((Date.now() - this._tickStart) / 1000);
      if (!State.timerData[this._currentTeam]) {
        State.timerData[this._currentTeam] = 0;
      }
      State.timerData[this._currentTeam] += elapsed;
    }

    this._currentTeam = null;
    this._tickStart = null;
  },

  // Get current elapsed time for display (banked + live)
  getCurrentElapsed() {
    if (!this._currentTeam || !this._tickStart) return 0;
    const live = Math.floor((Date.now() - this._tickStart) / 1000);
    return live;
  },

  // Get total time for a team (banked only)
  getTeamTotal(teamName) {
    return State.timerData[teamName] || 0;
  },

  // Get total time including live for current team
  getTeamTotalLive(teamName) {
    let total = State.timerData[teamName] || 0;
    if (this._currentTeam === teamName && this._tickStart) {
      total += Math.floor((Date.now() - this._tickStart) / 1000);
    }
    return total;
  },

  // Format seconds to M:SS
  formatTime(seconds) {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${String(s).padStart(2, "0")}`;
  },

  // Format seconds to H:MM:SS for longer totals
  formatTimeLong(seconds) {
    if (seconds < 3600) return this.formatTime(seconds);
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  },

  _updateDisplay() {
    const el = document.getElementById("otc-timer");
    if (el) {
      el.textContent = this.formatTime(this.getCurrentElapsed());
    }
  },
};
