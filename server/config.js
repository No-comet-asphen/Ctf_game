require('dotenv').config();

// Helper to normalize base path: leading slash, no trailing slash (e.g. '/ctf')
function normalizeBasePath(path) {
  if (!path || path === '/') return '';
  const trimmed = path.trim();
  const withLeading = trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
  return withLeading.endsWith('/') ? withLeading.slice(0, -1) : withLeading;
}

const config = {
  PORT: parseInt(process.env.PORT || '3000', 10),
  BASE_PATH: normalizeBasePath(process.env.BASE_PATH || '/ctf'),
  
  // External APIs
  MAIN_EVENT_API_URL: process.env.MAIN_EVENT_API_URL || '',
  MAIN_EVENT_API_KEY: process.env.MAIN_EVENT_API_KEY || '',
  LEADERBOARD_API_URL: process.env.LEADERBOARD_API_URL || '',
  LEADERBOARD_API_KEY: process.env.LEADERBOARD_API_KEY || '',
  
  // Navigation return link
  MAIN_SITE_URL: process.env.MAIN_SITE_URL || 'http://localhost:8080',
  
  // Hard mode flag for Puzzle 3 (header on 2nd request)
  HARD_MODE_HEADER: process.env.HARD_MODE_HEADER !== 'false',

  // Game rules - zero penalties
  INITIAL_LIVES: 3,
  
  // Scoring rules (zero penalties)
  SCORING: {
    BASE_POINTS: 100,
    HINT_PENALTY: 0, // No penalties for using hints
    MIN_POINTS: 100,
    MAX_TIME_BONUS: 30, // Time bonus if solved quickly
    BONUS_DECAY_SECONDS: 600 // Decays over 10 minutes
  },

  // Hint timers (seconds from when player first opens puzzle)
  HINT_TIERS_SECONDS: [180, 360, 540], // 3 min, 6 min, 9 min

  // Rate limiting
  SUBMISSION_RATE_LIMIT_PER_MINUTE: 10,

  // Puzzle configuration (Direct codes - NO encoding)
  PUZZLES: {
    1: {
      id: 1,
      title: "The Teller Login",
      category: "SQL Injection",
      story: "A teller forgot their password. The portal is old — when login fails, it shows you the query it tried to run. Maybe that's useful.",
      code: "IVB-LEVEL1-7Q2",
      hints: [
        "What does the debug console show you about the query structure?",
        "The filter blocks -- and ;. Can you make the condition true without a comment?",
        "Try closing the quote and introducing an always-true condition: ' OR '1'='1"
      ],
      teachingPanel: "Real fix: parameterized queries (prepared statements), never concatenate user input into SQL, and validate/allowlist input instead of blacklisting characters.",
      bankPageUrl: "/bank/teller-login"
    },
    2: {
      id: 2,
      title: "The Frozen Transfer Button",
      category: "DOM Manipulation",
      story: "The Transfer button is disabled and a transparent overlay blocks the form.",
      code: process.env.PUZZLE_2_CODE || "IVB-LEVEL2-5K8",
      hints: [
        "Some elements are being blocked or disabled — inspect the page.",
        "Look at the button's attributes and at what sits on top of the form.",
        "Remove `disabled` and delete div.fraud-shield, then click Transfer to reveal the code."
      ],
      teachingPanel: "Client-side restrictions are not security. Anything in the browser can be modified; real controls must be enforced on the server.",
      bankPageUrl: "/bank/transfers"
    },
    3: {
      id: 3,
      title: "The Hidden Audit Header",
      category: "HTTP Response Inspection",
      story: "Your dashboard loads your balance fine. But the bank's internal audit code isn't in the page — it travels with the response, not inside it.",
      code: "IVB-LEVEL3-3M9",
      decoyBodyCode: "FAKE-000-DECOY",
      hints: [
        "The visible balance data isn't the whole response. What else does a response carry?",
        "Look in Response Headers, not the body.",
        "The exact header name is X-Audit-Code containing the code."
      ],
      teachingPanel: "In real APIs, sensitive metadata should never travel in custom headers either — this puzzle exaggerates it for teaching purposes. The broader lesson: always inspect full HTTP responses, not just what's rendered on the page.",
      bankPageUrl: "/bank/dashboard"
    }
  }
};

module.exports = config;
