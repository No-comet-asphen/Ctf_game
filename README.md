# IronVault Heist – CTF Round

> **Self-contained CTF mini-game module** built for a larger Money-Heist-themed cybersecurity event platform.  
> Mountable under any configurable base path (default: `/ctf`) or via iframe/reverse proxy, with an isolated integration adapter for upstream event and leaderboard APIs.

---

## 📁 File Tree

```
ironvault-heist-ctf/
├── .env                        # Local runtime environment variables (starts in mock mode)
├── .env.example                # Template of required & optional configuration variables
├── package.json                # Project dependencies and npm scripts
├── README.md                   # Comprehensive documentation and integration contract
├── server/
│   ├── config.js               # Centralized configuration (ports, BASE_PATH, puzzle codes, scoring)
│   ├── gameState.js            # Server-side player state (lives, hint timers, rate limiting, scores)
│   ├── index.js                # Express application entry point, static asset & route mounting
│   ├── integration.js          # The SINGLE integration adapter file (field mappings, retry queue, mock mode)
│   └── routes/
│       ├── apiRoutes.js        # Internal game APIs (login evaluator, transfer, balance, submissions)
│       └── pageRoutes.js       # Dynamic HTML view delivery with BASE_PATH and token injection
├── views/
│   ├── ctf-round.html          # Main CTF Infiltration Console (/ctf)
│   ├── bank-login.html         # Sector 01: Teller Portal Login (SQL Injection)
│   ├── bank-transfers.html     # Sector 02: Institutional Transfers (DOM Manipulation)
│   ├── bank-dashboard.html     # Sector 03: Vault Custody Dashboard (HTTP Response Headers)
│   ├── bank-accounts.html      # Linked Bank Page: Master Institutional Accounts Directory
│   └── bank-audit.html         # Linked Bank Page: Information Security Guidelines & Lore Memos
├── public/
│   ├── css/
│   │   ├── common.css          # Shared theme variables, typography, modals, toasts, inputs
│   │   ├── round.css           # CTF mission control HUD, puzzle cards, hint timers, debrief modal
│   │   └── bank.css            # IronVault Bank corporate styling, debug terminal, fraud shield
│   └── js/
│       ├── round.js            # Client controller for the CTF Console (stopwatch, hints, submissions)
│       ├── bank-nav.js         # Token preservation across bank pages & live operator integrity HUD
│       ├── teller-login.js     # Client controller for Puzzle 1 (query debugger & emergency modal trap)
│       ├── transfers.js        # Client controller for Puzzle 2 (DOM editing check & trap reload)
│       └── dashboard.js        # Client controller for Puzzle 3 (balance API fetcher & ledger logs)
└── test/
    └── suite.js                # Automated end-to-end test suite
```

---

## 🚀 Quick Start

### 1. Requirements
- Node.js `>= 18.0.0`
- npm `>= 9.0.0`

### 2. Installation
```bash
npm install
```

### 3. Run in Standalone / Mock Mode
When `MAIN_EVENT_API_URL` or `LEADERBOARD_API_URL` are empty or omitted in `.env`, the server automatically operates in **Standalone Mock Mode**. No external services are required.

```bash
npm start
```
The server will start at:
👉 **`http://localhost:3000/ctf`** (or whichever `BASE_PATH` is set)

### 4. Run the Automated Test Suite
A comprehensive test suite validates all 4 integration functions, SQL injection evaluation, DOM manipulation, header extraction, encoded answer detection, life deductions, and rate limiting:
```bash
npm test
```

---

## 🔌 Integration Contract (`/server/integration.js`)

All communication with the external event platform and leaderboard occurs **exclusively** inside [`server/integration.js`](file:///C:/Users/patel/Documents/proj/server/integration.js). No keys or external URLs are ever exposed to the browser.

### Field Mappings Object
To accommodate schema changes in upstream services, all endpoint paths and JSON field names are isolated in the `FIELD_MAPPINGS` object at the top of [`server/integration.js`](file:///C:/Users/patel/Documents/proj/server/integration.js):

```javascript
const FIELD_MAPPINGS = {
  mainEvent: {
    sessionEndpoint: '/api/session/validate',
    roundStartEndpoint: '/api/round/start',
    roundCompleteEndpoint: '/api/round/complete',

    requestTokenKey: 'token',
    requestPlayerIdKey: 'playerId',
    requestRoundSolvedKey: 'solved',
    requestRoundLivesLeftKey: 'livesLeft',
    requestRoundTimeSecondsKey: 'timeSeconds',
    requestRoundScoreKey: 'score',

    responsePlayerIdKey: 'playerId',
    responseTeamNameKey: 'teamName',
    responseSuccessKey: 'success'
  },
  leaderboard: {
    submitScoreEndpoint: '/api/leaderboard/submit',

    requestPlayerIdKey: 'playerId',
    requestTeamNameKey: 'teamName',
    requestPointsKey: 'points',
    requestMetaKey: 'meta',

    responseSuccessKey: 'success',
    responseRankKey: 'rank'
  },
  headers: {
    apiKeyHeader: 'x-api-key',
    authorizationHeader: 'Authorization'
  }
};
```

---

### Adapter Functions & JSON Payloads

#### 1. `getSession(token)` &rarr; `MAIN_EVENT_API`
Validates player and team identity from the session token passed by the main event platform.

- **Trigger:** On initial page load or when resolving player state via `?token=` query param, `Authorization: Bearer <token>` header, or cookie.
- **Request:**
  - **Method:** `POST`
  - **URL:** `${MAIN_EVENT_API_URL}/api/session/validate`
  - **Headers:**  
    `Content-Type: application/json`  
    `x-api-key: <MAIN_EVENT_API_KEY>`  
    `Authorization: Bearer <token>`
  - **Body JSON:**
    ```json
    {
      "token": "heist-session-token-abc123"
    }
    ```
- **Expected Response JSON:**
  ```json
  {
    "success": true,
    "playerId": "agent-tokyo-44",
    "teamName": "The Royal Mint Squad"
  }
  ```
- **Returns:** `{ playerId: string, teamName: string }`
- **Mock Fallback:** When keys are absent, logs `[INTEGRATION MOCK] getSession()` and generates a deterministic mock player: `{ playerId: "mock-player-...", teamName: "Heist Squad (...)" }`.

---

#### 2. `reportRoundStart(playerId)` &rarr; `MAIN_EVENT_API`
Notifies the main event platform that the player has entered the round and their timer has begun.

- **Trigger:** Automatically invoked the first time a player's session is initialized.
- **Request:**
  - **Method:** `POST`
  - **URL:** `${MAIN_EVENT_API_URL}/api/round/start`
  - **Headers:**  
    `Content-Type: application/json`  
    `x-api-key: <MAIN_EVENT_API_KEY>`
  - **Body JSON:**
    ```json
    {
      "playerId": "agent-tokyo-44"
    }
    ```
- **Expected Response JSON:**
  ```json
  {
    "success": true,
    "startedAt": "2026-09-30T14:00:00.000Z"
  }
  ```
- **Mock Fallback:** Logs `[INTEGRATION MOCK] reportRoundStart()` and returns `{ success: true, mock: true }`.

---

#### 3. `reportRoundComplete(playerId, stats)` &rarr; `MAIN_EVENT_API`
Reports final round metrics when all 3 puzzles are solved or when the player's lives reach 0.

- **Trigger:** When `solvedCount === 3` or `lives === 0`.
- **Request:**
  - **Method:** `POST`
  - **URL:** `${MAIN_EVENT_API_URL}/api/round/complete`
  - **Headers:**  
    `Content-Type: application/json`  
    `x-api-key: <MAIN_EVENT_API_KEY>`
  - **Body JSON:**
    ```json
    {
      "playerId": "agent-tokyo-44",
      "solved": 3,
      "livesLeft": 2,
      "timeSeconds": 345,
      "score": 285
    }
    ```
- **Expected Response JSON:**
  ```json
  {
    "success": true,
    "recordedAt": "2026-09-30T14:05:45.000Z"
  }
  ```
- **Mock Fallback:** Logs `[INTEGRATION MOCK] reportRoundComplete()` with the final stats and returns `{ success: true, mock: true }`.

---

#### 4. `submitScore(playerId, teamName, points, meta)` &rarr; `LEADERBOARD_API`
Transmits points to the external live leaderboard.

- **Trigger:** Called **after each puzzle solve** and **at final round completion**.
- **Request:**
  - **Method:** `POST`
  - **URL:** `${LEADERBOARD_API_URL}/api/leaderboard/submit`
  - **Headers:**  
    `Content-Type: application/json`  
    `x-api-key: <LEADERBOARD_API_KEY>`
  - **Body JSON (Mid-Round Solve):**
    ```json
    {
      "playerId": "agent-tokyo-44",
      "teamName": "The Royal Mint Squad",
      "points": 100,
      "meta": {
        "puzzleId": 1,
        "totalScore": 100
      }
    }
    ```
  - **Body JSON (Round End):**
    ```json
    {
      "playerId": "agent-tokyo-44",
      "teamName": "The Royal Mint Squad",
      "points": 285,
      "meta": {
        "final": true,
        "solvedCount": 3,
        "livesLeft": 2
      }
    }
    ```
- **Expected Response JSON:**
  ```json
  {
    "success": true,
    "rank": 3,
    "updatedPoints": 285
  }
  ```
- **Mock Fallback:** Logs `[INTEGRATION MOCK] submitScore()` and returns `{ success: true, mock: true, rank: 1 }`.

---

### Resilience, Timeouts & Background Retry Queue
To ensure that an external network glitch **never halts or degrades the player's gaming experience**:
1. Every external HTTP request has a **5-second timeout** enforced via `AbortController`.
2. Failed requests undergo **2 automatic retries** (3 total attempts) with exponential backoff.
3. If an external API remains unreachable after 3 attempts, the call is placed into an in-memory **`backgroundQueue`**.
4. A non-blocking background queue processor re-attempts failed calls in the background while gameplay continues uninterrupted.

---

## ⚙️ Configuration & Environment Variables

Create `.env` based on `.env.example`:

```bash
# Main Event Platform API
MAIN_EVENT_API_URL=https://platform.event.example.com
MAIN_EVENT_API_KEY=secret_main_event_key_123

# Leaderboard Service API
LEADERBOARD_API_URL=https://leaderboard.event.example.com
LEADERBOARD_API_KEY=secret_leaderboard_key_456

# Server Network Configuration
PORT=3000
BASE_PATH=/ctf

# Navigation Link for Heist Completion
MAIN_SITE_URL=https://event.example.com/hub

# Puzzle 3 Hard Mode (simulated cache miss on first request)
HARD_MODE_HEADER=true

# Puzzle 2 Code Override (optional)
PUZZLE_2_CODE=IVB-LEVEL2-5K8
```

| Variable | Default | Description |
|---|---|---|
| `PORT` | `3000` | Port on which the Express server listens. |
| `BASE_PATH` | `/ctf` | Base path under which all CTF routes, bank pages, and APIs are mounted. |
| `MAIN_EVENT_API_URL` | `""` (Empty = Mock Mode) | Base URL of the main event platform. |
| `MAIN_EVENT_API_KEY` | `""` | API key sent in `x-api-key` header to the main event platform. |
| `LEADERBOARD_API_URL` | `""` (Empty = Mock Mode) | Base URL of the leaderboard service. |
| `LEADERBOARD_API_KEY` | `""` | API key sent in `x-api-key` header to the leaderboard service. |
| `MAIN_SITE_URL` | `http://localhost:8080` | URL linked by the "Back to Main Event" button on the completion screen. |
| `HARD_MODE_HEADER` | `true` | If `true`, Puzzle 3 omits `X-Audit-Code` on the 1st request and delivers it on the 2nd. |

---

## 🏗️ Mounting Under the Main Site

This module is designed to mount anywhere without conflicts:

### Option A: Direct Link or Subpath Mount
Mount this Node.js app behind an Nginx or Caddy reverse proxy at `/ctf`:
```nginx
location /ctf/ {
    proxy_pass http://127.0.0.1:3000/ctf/;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
}
```
Direct players to:
```html
<a href="https://your-main-site.com/ctf?token=PLAYER_SESSION_TOKEN">
  Enter IronVault CTF Round
</a>
```

### Option B: Seamless `<iframe>` Embedding
Because the frontend is plain HTML5/CSS3 with vanilla JS and responsive layouts, the main platform can embed it directly inside any dashboard:
```html
<iframe 
  src="https://your-main-site.com/ctf?token=PLAYER_SESSION_TOKEN"
  width="100%" 
  height="900px" 
  frameborder="0"
  allow="clipboard-write">
</iframe>
```

---

## 🎮 Game Rules & Puzzle Guide

### Core Mechanics
- **Zero Penalties Mode:**
  - **No Hint Penalty:** Hints unlock over time without deducting points (0 penalty).
  - **No Life Loss Penalties:** Traps provide educational security warnings without terminating the session or docking lives.
- **Scoring:**
  - Base: **100 points** per puzzle.
  - Time Bonus: Up to **+30 points** based on rapid solve time (decays linearly over 10 minutes).
- **Hints:** 3 tiers per puzzle, unlocked server-side based on elapsed time since the player first visited/opened that puzzle (**3 min**, **6 min**, **9 min**).
- **Direct Codes (No Encoding):** All challenges reveal the exact plaintext code directly upon bypass (no Base64 decoding or Caesar ciphers required).
- **Rate Limit:** 10 code submissions per minute per player. Exceeding triggers HTTP 429 with retry cooldown.

---

### Puzzle 1 – "The Teller Login" (SQL Injection)
- **Sector ID:** Sector 01
- **Page:** `/ctf/bank/teller-login`
- **Solution Plaintext Code:** `IVB-LEVEL1-7Q2`
- **Story:** A legacy teller portal displays attempted SQL queries in a debug console upon failure.
- **Challenge:**
  - The login query is constructed via string concatenation: `SELECT * FROM tellers WHERE user='<USER>' AND pass='<PASS>'`.
  - A server filter strips `--`, `;`, and `/*` from input and warns: *"Suspicious characters removed for your security."* This blocks `admin'--`.
  - Submitting tautologies from the `1=1` family (e.g. `' OR '1'='1` or `' OR 1=1`) satisfies the query without requiring comment syntax.
  - Decoy condition `' OR '2'='2` is caught by logic and fails.
  - **Trap:** Clicking *"Emergency Teller Access (Supervisor Override)"* and submitting any override code triggers a security alarm warning (zero penalty).
- **Flag Reveal:** Successful injection logs into Sarah's account and directly displays:  
  `Welcome, Sarah (Head Teller). Vault Authorization Code: IVB-LEVEL1-7Q2`
- **Teaching Panel:**  
  *"Real fix: parameterized queries (prepared statements), never concatenate user input into SQL, and validate/allowlist input instead of blacklisting characters."*

---

### Puzzle 2 – "The Frozen Transfer Button" (DOM Editing)
- **Sector ID:** Sector 02
- **Page:** `/ctf/bank/transfers`
- **Solution Plaintext Code:** `IVB-LEVEL2-5K8`
- **Story:** The transfer button is disabled and a transparent overlay blocks the form.
- **Challenge:**
  - The "Authorize Transfer" button contains the `disabled` HTML attribute.
  - The form is covered by a transparent element: `<div class="fraud-shield" id="fraudShield"></div>`.
  - Solution: In browser DevTools Elements panel:
    1. Delete or remove `<div class="fraud-shield">`.
    2. Remove the `disabled` attribute from the `<button id="transferBtn">`.
    3. Click *"Execute Reserve Transfer"*.
  - **Trap:** A button labeled *"Quick Bypass: Automated Interface Unlock"* resets DOM edits with a security warning (zero penalty).
- **Flag Reveal:** A success modal directly displays the authorization code:  
  `IVB-LEVEL2-5K8`
- **Teaching Panel:**  
  *"Client-side restrictions are not security. Anything in the browser can be modified; real controls must be enforced on the server."*

---

### Puzzle 3 – "The Hidden Audit Header" (HTTP Response Headers)
- **Sector ID:** Sector 03
- **Page:** `/ctf/bank/dashboard`
- **Solution Plaintext Code:** `IVB-LEVEL3-3M9`
- **Story:** Balance data loads into the page, but internal audit codes travel with the response headers.
- **Challenge:**
  - Clicking *"Refresh Balance"* calls `GET /api/balance?acct=1001`.
  - The JSON response body includes:  
    `{ "acct": "1001", "balance": "$4,213.50", "audit_code": "FAKE-000-DECOY" }`
  - In **Hard Mode** (`HARD_MODE_HEADER=true`), the first click simulates a cache miss and does **not** include the audit header. Clicking "Refresh Balance" a **second time** attaches the header containing the direct code:  
    `X-Audit-Code: IVB-LEVEL3-3M9`
  - The response also contains a decoy header `X-Request-Id: <UUID>`.
  - **Traps:**
    - Submitting `FAKE-000-DECOY` &rarr; *"That's a decoy field! The real code travels in the response header X-Audit-Code."*
    - Submitting the `X-Request-Id` UUID &rarr; *"That's just a request ID, not the audit code — check header X-Audit-Code."*
- **Teaching Panel:**  
  *"In real APIs, sensitive metadata should never travel in custom headers either — this puzzle exaggerates it for teaching purposes. The broader lesson: always inspect full HTTP responses, not just what's rendered on the page."*

---

### Answer Validation Behavior
- Answers are **case-insensitive** and **trimmed**.
- Flags and correct answers are stored **exclusively server-side** and are never exposed in client-side console scripts.
