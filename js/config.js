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
  // Maps overall pick number → current owner (team name) after trades.
  // Only picks that changed hands are listed; all others retain their original owner.
  // Generated from the 2026 pre-draft trade data.
  TRADED_PICKS: {
    7:   "The Bowe Zone",          // Wonderful Secrets Rd1  → Bowe Zone
    8:   "The Wonderful Secrets",  // Slapsticks Rd1         → Wonderful Secrets
    9:   "Mr. Sunday",             // Miracle Men Rd1        → Mr. Sunday
    16:  "Who But",                // Miracle Men Rd2        → Who But
    17:  "The Bully's",            // Slapsticks Rd2         → Bully's
    18:  "Who But",                // Wonderful Secrets Rd2  → Who But
    28:  "The Bowe Zone",          // Who But Rd3            → Bowe Zone
    33:  "The Wonderful Secrets",  // Miracle Men Rd3        → Wonderful Secrets
    38:  "Sad George",             // Bowe Zone Rd4          → Sad George
    39:  "Who But",                // Emmett's Dad Rd4       → Who But
    40:  "Sad George",             // Miracle Men Rd4        → Sad George
    42:  "Mr. Sunday",             // Wonderful Secrets Rd4  → Mr. Sunday
    55:  "The Slapsticks",         // Wonderful Secrets Rd5  → Slapsticks
    57:  "Mr. Sunday",             // Miracle Men Rd5        → Mr. Sunday
    62:  "Emmett's Dad",           // Bowe Zone Rd6          → Emmett's Dad
    64:  "The Bowe Zone",          // Miracle Men Rd6        → Bowe Zone
    70:  "The Bowe Zone",          // Sad George Rd6         → Bowe Zone
    71:  "Slim Jim",               // Sheaquon Rd6           → Slim Jim
    73:  "The Slapsticks",         // Bully's Rd7            → Slapsticks
    75:  "Who But",                // Sad George Rd7         → Who But
    76:  "Mr. Sunday",             // Who But Rd7            → Mr. Sunday
    81:  "The Wonderful Secrets",  // Miracle Men Rd7        → Wonderful Secrets
    88:  "Who But",                // Miracle Men Rd8        → Who But
    89:  "Sheaquon",               // Slapsticks Rd8         → Sheaquon
    104: "Mr. Sunday",             // Slapsticks Rd9         → Mr. Sunday
    105: "Sad George",             // Miracle Men Rd9        → Sad George
    112: "Sad George",             // Miracle Men Rd10       → Sad George
    116: "Who But",                // Mr. Sunday Rd10        → Who But
    118: "Sheaquon",               // Sad George Rd10        → Sheaquon
    125: "Who But",                // Mr. Sunday Rd11        → Who But
    129: "Who But",                // Miracle Men Rd11       → Who But
    136: "Who But",                // Miracle Men Rd12       → Who But
    140: "The Wonderful Secrets",  // Mr. Sunday Rd12        → Wonderful Secrets
    147: "Who But",                // Sad George Rd13        → Who But
    149: "The Slapsticks",         // Mr. Sunday Rd13        → Slapsticks
    153: "Who But",                // Miracle Men Rd13       → Who But
    157: "The Slapsticks",         // Slim Jim Rd14          → Slapsticks
    160: "Who But",                // Miracle Men Rd14       → Who But
    164: "Who But",                // Mr. Sunday Rd14        → Who But
    166: "Who But",                // Sad George Rd14        → Who But
  },

  // Firebase path for this draft
  DRAFT_YEAR: "2026",
  get FB_PATH() { return `drafts/${this.DRAFT_YEAR}`; },
};
