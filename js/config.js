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

  // ─── TRADED PICKS ───
  // Maps overall pick number → current owner (owner name) after trades.
  // Owner names: Kipp, Scott, Geo, Weaver, Kevin, Stephen, Hughes, Joey, JP, Popson, Drew, Slim Jim
  // Only picks that changed hands are listed; all others retain their original owner.
  TRADED_PICKS: {
    7:   "Drew",     // Hughes Rd1  → Drew
    8:   "Hughes",   // Joey Rd1    → Hughes
    9:   "Kevin",    // JP Rd1      → Kevin
    11:  "Weaver",   // Drew Rd1    → Weaver
    14:  "Weaver",   // Drew Rd2    → Weaver
    17:  "Kipp",     // Joey Rd2    → Kipp
    18:  "JP",       // Hughes Rd2  → JP
    26:  "Geo",      // Scott Rd3   → Geo
    28:  "Drew",     // Weaver Rd3  → Drew
    33:  "Hughes",   // JP Rd3      → Hughes
    38:  "Geo",      // Drew Rd4    → Geo
    39:  "JP",       // Popson Rd4  → JP
    40:  "Geo",      // JP Rd4      → Geo
    42:  "Kevin",    // Hughes Rd4  → Kevin
    55:  "Joey",     // Hughes Rd5  → Joey
    57:  "Kevin",    // JP Rd5      → Kevin
    62:  "Popson",   // Drew Rd6    → Popson
    64:  "Drew",     // JP Rd6      → Drew
    70:  "Drew",     // Geo Rd6     → Drew
    71:  "Slim Jim", // Scott Rd6   → Slim Jim
    73:  "Joey",     // Kipp Rd7    → Joey
    75:  "JP",       // Geo Rd7     → JP
    76:  "Kevin",    // Weaver Rd7  → Kevin
    81:  "Hughes",   // JP Rd7      → Hughes
    89:  "Scott",    // Joey Rd8    → Scott
    104: "Kevin",    // Joey Rd9    → Kevin
    105: "Geo",      // JP Rd9      → Geo
    112: "Geo",      // JP Rd10     → Geo
    116: "JP",       // Kevin Rd10  → JP
    118: "Scott",    // Geo Rd10    → Scott
    125: "JP",       // Kevin Rd11  → JP
    140: "Hughes",   // Kevin Rd12  → Hughes
    147: "JP",       // Geo Rd13    → JP
    149: "Joey",     // Kevin Rd13  → Joey
    157: "Joey",     // Slim Jim Rd14 → Joey
    164: "JP",       // Kevin Rd14  → JP
    166: "JP",       // Geo Rd14    → JP
  },

  // Firebase path for this draft
  DRAFT_YEAR: "2026",
  get FB_PATH() { return `drafts/${this.DRAFT_YEAR}`; },
};
