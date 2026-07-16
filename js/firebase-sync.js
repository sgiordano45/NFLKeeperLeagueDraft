// ─── Firebase Realtime Sync ───
// Two-way sync: local mutations push to Firebase,
// remote changes update local state + UI.

const FirebaseSync = {
  _ref: null,
  _listening: false,
  _pushing: false,  // Debounce flag to avoid echo loops

  init() {
    if (!window.db) {
      console.warn("Firebase not initialized — running in offline mode.");
      this._offlineMode = true;
      return;
    }

    this._ref = window.db.ref(CONFIG.FB_PATH);
    this._startListening();
  },

  _startListening() {
    if (this._listening || !this._ref) return;
    this._listening = true;

    this._ref.on("value", (snapshot) => {
      // Skip if we just pushed this update ourselves
      if (this._pushing) return;

      const data = snapshot.val();
      if (data) {
        State.deserialize(data);
      }
    });

    // Connection status indicator
    const connRef = window.db.ref(".info/connected");
    connRef.on("value", (snap) => {
      const indicator = document.getElementById("connection-dot");
      if (indicator) {
        indicator.style.background = snap.val() ? "#2A9D8F" : "#E63946";
        indicator.title = snap.val() ? "Connected" : "Disconnected";
      }
    });
  },

  // Push local state to Firebase
  // Writes each key as a separate child update to stay within security rule paths.
  // (Writing to the year root is blocked by rules; children like picks/teams/etc. are allowed.)
  push(data) {
    if (this._offlineMode || !this._ref) return;

    this._pushing = true;
    const promises = Object.entries(data).map(([key, value]) =>
      this._ref.child(key).set(value)
    );

    Promise.all(promises)
      .then(() => {
        setTimeout(() => { this._pushing = false; }, 100);
      })
      .catch(err => {
        console.error("Firebase push failed:", err);
        this._pushing = false;
      });
  },

  // Load initial state from Firebase (returns promise)
  async loadInitial() {
    if (this._offlineMode || !this._ref) return null;

    try {
      const snapshot = await this._ref.once("value");
      return snapshot.val();
    } catch (err) {
      console.error("Firebase initial load failed:", err);
      return null;
    }
  },
};
