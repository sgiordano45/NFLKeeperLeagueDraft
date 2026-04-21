// ─── League Configuration ───
const CONFIG = {
  NUM_TEAMS: 12,
  NUM_ROUNDS: 14,
  KEEPERS_PER_TEAM: 2,

  DEFAULT_TEAMS: [
    "Team 1", "Team 2", "Team 3", "Team 4", "Team 5", "Team 6",
    "Team 7", "Team 8", "Team 9", "Team 10", "Team 11", "Team 12"
  ],

  TEAM_COLORS: [
    "#E63946", "#457B9D", "#2A9D8F", "#E9C46A", "#F4A261", "#264653",
    "#6A0572", "#1B998B", "#FF6B35", "#004E89", "#A23B72", "#C18C5D"
  ],

  // Firebase path for this draft
  DRAFT_YEAR: "2026",
  get FB_PATH() { return `drafts/${this.DRAFT_YEAR}`; },
};
