// ─── Authentication & Roles ───
// Roles:
//   commissioner — full control, set via Firebase console
//   owner        — signed in + claimed a team, can draft their own picks
//   spectator    — view-only (signed in but no team, or not signed in)

const Auth = {
  user: null,         // Firebase user object
  role: "spectator",  // "commissioner" | "owner" | "spectator"
  claimedTeam: null,  // Team name this user owns
  isSpectating: false,
  _teamClaims: {},    // { teamName: { uid, displayName, email } }

  async init() {
    // Listen for team claims from Firebase
    this._listenForClaims();

    return new Promise((resolve) => {
      window.auth.onAuthStateChanged(async (user) => {
        if (user) {
          this.user = user;
          this.isSpectating = false;
          await this._resolveRole(user);
          this._showApp();
        }
        // If not signed in, show login screen (default state)
        resolve();
      });
    });
  },

  async signIn() {
    const provider = new firebase.auth.GoogleAuthProvider();
    try {
      await window.auth.signInWithPopup(provider);
    } catch (err) {
      console.error("Sign-in failed:", err);
      if (err.code === "auth/popup-closed-by-user") return;
      alert("Sign-in failed. Please try again.");
    }
  },

  async signOut() {
    Timer.stop();
    await window.auth.signOut();
    this.user = null;
    this.role = "spectator";
    this.claimedTeam = null;
    this.isSpectating = false;
    this._showLogin();
  },

  spectate() {
    this.user = null;
    this.role = "spectator";
    this.claimedTeam = null;
    this.isSpectating = true;
    this._showApp();
  },

  // ─── Role resolution ───
  async _resolveRole(user) {
    // Check if user is commissioner
    let isComm = false;
    try {
      const commSnap = await window.db.ref("commissioner").once("value");
      const commEmail = commSnap.val();
      if (commEmail && user.email.toLowerCase() === commEmail.toLowerCase()) {
        isComm = true;
        this.role = "commissioner";
      }
    } catch (err) {
      console.error("Error checking commissioner:", err);
    }

    // Check preassigned emails (commissioner sets these in advance)
    try {
      const preSnap = await window.db.ref(`${CONFIG.FB_PATH}/preassignedEmails`).once("value");
      const preMap = preSnap.val() || {}; // { "encoded,email,key": "TeamName" }
      // Encode the user's email the same way it was stored (periods → commas)
      const emailKey = user.email.toLowerCase().replace(/\./g, ',');
      if (preMap[emailKey]) {
        const assignedTeam = preMap[emailKey];
        // Auto-claim the team if not already claimed by someone else
        const claimRef = window.db.ref(`${CONFIG.FB_PATH}/teamClaims/${assignedTeam}`);
        const claimSnap = await claimRef.once("value");
        const existing = claimSnap.val();
        if (!existing || existing.uid === user.uid) {
          await claimRef.set({
            uid: user.uid,
            displayName: user.displayName || user.email,
            email: user.email,
          });
          this.claimedTeam = assignedTeam;
          if (!isComm) this.role = "owner";
          return; // Skip the manual claim check below
        }
      }
    } catch (err) {
      console.error("Error checking preassigned emails:", err);
    }

    // Check if user has claimed a team (commissioner can also have one)
    const claimSnap = await window.db.ref(`${CONFIG.FB_PATH}/teamClaims`).once("value");
    const claims = claimSnap.val() || {};
    this._teamClaims = claims;

    for (const [teamName, claim] of Object.entries(claims)) {
      if (claim.uid === user.uid) {
        this.claimedTeam = teamName;
        if (!isComm) this.role = "owner";
        return;
      }
    }

    // No team claimed
    this.claimedTeam = null;
    if (!isComm) {
      this.role = "spectator";
    }
  },

  // ─── Team claiming ───
  _listenForClaims() {
    window.db.ref(`${CONFIG.FB_PATH}/teamClaims`).on("value", (snap) => {
      this._teamClaims = snap.val() || {};
      // Re-render if app is visible
      if (!document.getElementById("header").classList.contains("hidden")) {
        UI.render();
      }
    });
  },

  async claimTeam(teamName) {
    if (!this.user) return;

    // Check if already claimed by someone else
    if (this._teamClaims[teamName] && this._teamClaims[teamName].uid !== this.user.uid) {
      alert(`${teamName} is already claimed by ${this._teamClaims[teamName].displayName}`);
      return;
    }

    // Remove any existing claim by this user
    for (const [name, claim] of Object.entries(this._teamClaims)) {
      if (claim.uid === this.user.uid) {
        await window.db.ref(`${CONFIG.FB_PATH}/teamClaims/${name}`).remove();
      }
    }

    // Set new claim
    await window.db.ref(`${CONFIG.FB_PATH}/teamClaims/${teamName}`).set({
      uid: this.user.uid,
      displayName: this.user.displayName || this.user.email,
      email: this.user.email,
    });

    // Commissioner keeps commissioner role, others become owner
    if (!this.isCommissioner()) {
      this.role = "owner";
    }
    this.claimedTeam = teamName;
    this._updateUserBar();
    UI.render();
  },

  async unclaimTeam(teamName) {
    await window.db.ref(`${CONFIG.FB_PATH}/teamClaims/${teamName}`).remove();
    if (this.claimedTeam === teamName) {
      if (!this.isCommissioner()) {
        this.role = "spectator";
      }
      this.claimedTeam = null;
    }
    this._updateUserBar();
    UI.render();
  },

  // ─── Permission checks ───
  isCommissioner() {
    return this.role === "commissioner";
  },

  isOwner() {
    return this.role === "owner";
  },

  // Can this user make a pick right now?
  canDraftCurrentPick() {
    if (this.isCommissioner()) return true;
    if (!this.isOwner() || !State.currentPick) return false;
    return State.currentPick.currentOwner === this.claimedTeam;
  },

  // Can this user draft a specific pick?
  canDraftPick(pickIndex) {
    if (this.isCommissioner()) return true;
    if (!this.isOwner()) return false;
    const pick = State.picks[pickIndex];
    return pick && pick.currentOwner === this.claimedTeam;
  },

  // Can this user access commissioner controls?
  canAdmin() {
    return this.isCommissioner();
  },

  // ─── UI helpers ───
  _showLogin() {
    document.getElementById("login-screen").classList.remove("hidden");
    document.getElementById("header").classList.add("hidden");
    document.getElementById("board-container").classList.add("hidden");
    document.getElementById("on-the-clock").classList.add("hidden");
    document.getElementById("user-bar").classList.add("hidden");
  },

  _showApp() {
    document.getElementById("login-screen").classList.add("hidden");
    document.getElementById("header").classList.remove("hidden");
    document.getElementById("board-container").classList.remove("hidden");
    this._updateUserBar();
    App.init();
  },

  _updateUserBar() {
    const bar = document.getElementById("user-bar");
    const avatar = document.getElementById("user-avatar");
    const name = document.getElementById("user-name");
    const role = document.getElementById("user-role");

    if (this.isSpectating) {
      bar.classList.remove("hidden");
      avatar.style.display = "none";
      name.textContent = "Spectator";
      role.textContent = "VIEW ONLY";
      role.className = "user-role-badge role-spectator";
      // Hide sign out, show sign in instead
      bar.querySelector(".btn").textContent = "Sign In";
      bar.querySelector(".btn").setAttribute("onclick", "Auth.signIn()");
      return;
    }

    if (!this.user) {
      bar.classList.add("hidden");
      return;
    }

    bar.classList.remove("hidden");
    avatar.style.display = "";
    avatar.src = this.user.photoURL || "";
    name.textContent = this.user.displayName || this.user.email;

    // Reset sign out button
    bar.querySelector(".btn").textContent = "Sign Out";
    bar.querySelector(".btn").setAttribute("onclick", "Auth.signOut()");

    if (this.isCommissioner()) {
      role.textContent = "COMMISSIONER";
      role.className = "user-role-badge role-commissioner";
      // Also show team if commissioner has claimed one
      if (this.claimedTeam) {
        role.textContent = `COMMISH · ${this.claimedTeam}`;
      }
    } else if (this.isOwner()) {
      role.textContent = this.claimedTeam;
      role.className = "user-role-badge role-owner";
    } else {
      role.textContent = "NO TEAM";
      role.className = "user-role-badge role-spectator";
    }
  },

  // Does this user have a team (commissioner or owner)?
  hasTeam() {
    return !!this.claimedTeam;
  },

  // Get the owner name for a team (for display)
  getTeamOwnerName(teamName) {
    const claim = this._teamClaims[teamName];
    return claim ? claim.displayName : null;
  },
};
