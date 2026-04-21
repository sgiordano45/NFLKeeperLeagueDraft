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

  // Position colors for drafted players
  POSITION_COLORS: {
    QB:  { bg: "#5C1D91", text: "#E8D0FF" },  // Purple
    RB:  { bg: "#1A6B3C", text: "#C8F7D8" },  // Green
    WR:  { bg: "#1565C0", text: "#BBDEFB" },  // Blue
    TE:  { bg: "#BF360C", text: "#FFCCBC" },  // Orange-red
    K:   { bg: "#4E342E", text: "#D7CCC8" },  // Brown
    DEF: { bg: "#37474F", text: "#CFD8DC" },  // Steel
    DST: { bg: "#37474F", text: "#CFD8DC" },  // Alias for DEF
  },

  // Parse "Player Name, POS" → { name, pos }
  parsePlayer(str) {
    if (!str) return { name: str, pos: null };
    const match = str.match(/^(.+?),\s*(QB|RB|WR|TE|K|DEF|DST)\s*$/i);
    if (match) {
      return { name: match[1].trim(), pos: match[2].toUpperCase() };
    }
    return { name: str, pos: null };
  },

  // Get color for a position
  posColor(pos) {
    if (!pos) return null;
    return this.POSITION_COLORS[pos.toUpperCase()] || null;
  },

  // Firebase path for this draft
  DRAFT_YEAR: "2026",
  get FB_PATH() { return `drafts/${this.DRAFT_YEAR}`; },
};
