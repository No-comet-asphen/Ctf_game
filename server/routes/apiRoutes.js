const express = require('express');
const crypto = require('crypto');
const config = require('../config');
const gameState = require('../gameState');
const integration = require('../integration');

const router = express.Router();

/**
 * Middleware: Session resolution from token or cookies/headers
 */
async function resolveSession(req, res, next) {
  let token = null;

  // 1. Authorization header: Bearer <token>
  const authHeader = req.headers['authorization'];
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.substring(7).trim();
  }

  // 2. Query param ?token=
  if (!token && req.query.token) {
    token = String(req.query.token).trim();
  }

  // 3. Body token
  if (!token && req.body && req.body.token) {
    token = String(req.body.token).trim();
  }

  // 4. Cookie ctf_token
  if (!token && req.cookies && req.cookies.ctf_token) {
    token = String(req.cookies.ctf_token).trim();
  }

  // Standalone fallback token
  if (!token) {
    token = 'mock-agent-007';
  }

  try {
    const session = await integration.getSession(token);
    req.playerId = session.playerId;
    req.teamName = session.teamName;
    req.token = token;

    // Set cookie for browser session persistence
    res.cookie('ctf_token', token, {
      path: '/',
      httpOnly: false, // Accessible to vanilla JS
      sameSite: 'lax',
      maxAge: 86400000 // 24 hours
    });

    const playerState = gameState.getOrCreatePlayerState(req.playerId, req.teamName);

    // If first load for this player, report round start to main event
    if (!playerState.roundStartedReported) {
      playerState.roundStartedReported = true;
      integration.reportRoundStart(req.playerId).catch(err => {
        console.warn(`[API] Async reportRoundStart error: ${err.message}`);
      });
    }

    next();
  } catch (err) {
    console.error(`[API ERROR] Session resolution failed: ${err.message}`);
    req.playerId = 'guest-player';
    req.teamName = 'Guest Crew';
    next();
  }
}

router.use(resolveSession);

/**
 * GET /api/state
 * Returns current player state, lives, score, hint statuses, etc.
 */
router.get('/state', (req, res) => {
  const clientState = gameState.getClientState(req.playerId);
  res.json({
    success: true,
    state: clientState,
    token: req.token
  });
});

/**
 * POST /api/puzzle/open
 * Mark puzzle as opened to begin hint timer
 */
router.post('/puzzle/open', (req, res) => {
  const { puzzleId } = req.body;
  if (!puzzleId || !config.PUZZLES[puzzleId]) {
    return res.status(400).json({ success: false, message: 'Invalid puzzle ID' });
  }

  gameState.markPuzzleOpened(req.playerId, puzzleId);
  const clientState = gameState.getClientState(req.playerId);
  res.json({ success: true, state: clientState });
});

/**
 * POST /api/hint/unlock
 * Unlock a hint tier if countdown has completed
 */
router.post('/hint/unlock', (req, res) => {
  const { puzzleId, tierIndex } = req.body;

  if (tierIndex === undefined || tierIndex === null || tierIndex < 0 || tierIndex > 2) {
    return res.status(400).json({ success: false, message: 'Invalid hint tier' });
  }

  const result = gameState.unlockHint(req.playerId, puzzleId, parseInt(tierIndex, 10));
  if (!result.success) {
    return res.status(400).json(result);
  }

  const clientState = gameState.getClientState(req.playerId);
  res.json({
    success: true,
    hintText: result.hintText,
    tier: result.tier,
    state: clientState
  });
});

/**
 * POST /api/submit-code
 * Validates puzzle solution codes, checks traps, handles encodings, awards points.
 */
router.post('/submit-code', async (req, res) => {
  const { puzzleId, code } = req.body;
  const pId = parseInt(puzzleId, 10);
  const pConfig = config.PUZZLES[pId];

  if (!pConfig) {
    return res.status(400).json({ success: false, message: 'Unknown puzzle ID' });
  }

  const playerState = gameState.getOrCreatePlayerState(req.playerId);

  // Check if player has already run out of lives or completed round
  if (playerState.lives <= 0) {
    return res.status(403).json({
      success: false,
      isGameOver: true,
      message: 'Round terminated: You have 0 lives remaining.',
      state: gameState.getClientState(req.playerId)
    });
  }

  if (playerState.puzzles[pId] && playerState.puzzles[pId].solved) {
    return res.json({
      success: true,
      alreadySolved: true,
      message: 'This puzzle has already been solved.',
      teachingPanel: pConfig.teachingPanel,
      state: gameState.getClientState(req.playerId)
    });
  }

  // Rate limiting (10 submissions/minute)
  const rateLimitCheck = gameState.checkRateLimit(req.playerId);
  if (!rateLimitCheck.allowed) {
    return res.status(429).json({
      success: false,
      rateLimited: true,
      message: `Too many submissions. Please wait ${rateLimitCheck.retryAfterSeconds} seconds before trying again.`,
      retryAfterSeconds: rateLimitCheck.retryAfterSeconds
    });
  }

  const rawCode = (code || '').trim();
  const normalizedCode = rawCode.toUpperCase();

  // 1. Check if the submission is in encoded format
  const knownEncodedTokens = [
    config.PUZZLES[1].encodedToken.toUpperCase(), // SVZCLUXFVKEVMS03UTI=
    config.PUZZLES[2].encodedToken.toUpperCase(), // LYE-OHYHO2-5N8
    config.PUZZLES[3].encodedToken.toUpperCase()  // SVZCLUXFVKEVMY0ZTTK=
  ];

  if (knownEncodedTokens.includes(normalizedCode)) {
    return res.json({
      success: false,
      isEncodedNotice: true,
      message: "That looks encoded. Decode it first.",
      state: gameState.getClientState(req.playerId)
    });
  }

  // 2. Puzzle 3 specific trap answers
  if (pId === 3) {
    // Trap A: Submitting body decoy code "FAKE-000-DECOY"
    if (normalizedCode === 'FAKE-000-DECOY') {
      gameState.deductLife(req.playerId, 'Submitted body decoy audit_code');
      const updatedState = gameState.getClientState(req.playerId);

      if (updatedState.lives <= 0) {
        handleRoundEnd(req.playerId, updatedState);
      }

      return res.json({
        success: false,
        trapTriggered: true,
        lifeLost: true,
        message: "That's a decoy field. The real code doesn't live in the body.",
        state: updatedState
      });
    }

    // Trap B: Submitting the X-Request-Id (UUID)
    const isUuid = /^[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}$/i.test(rawCode) ||
                   rawCode.toLowerCase().startsWith('req-');
    if (isUuid) {
      gameState.deductLife(req.playerId, 'Submitted X-Request-Id UUID header');
      const updatedState = gameState.getClientState(req.playerId);

      if (updatedState.lives <= 0) {
        handleRoundEnd(req.playerId, updatedState);
      }

      return res.json({
        success: false,
        trapTriggered: true,
        lifeLost: true,
        message: "That's just a request ID, not an audit code — check the header name again.",
        state: updatedState
      });
    }
  }

  // 3. Check correct code (case-insensitive, trimmed)
  const targetCode = pConfig.code.trim().toUpperCase();

  if (normalizedCode === targetCode) {
    const solveResult = gameState.markPuzzleSolved(req.playerId, pId);
    const updatedState = gameState.getClientState(req.playerId);

    // Submit score to Leaderboard API after each solve
    integration.submitScore(
      req.playerId,
      req.teamName,
      solveResult.pointsEarned,
      { puzzleId: pId, totalScore: updatedState.score }
    ).catch(err => console.warn(`[API] Async submitScore error: ${err.message}`));

    // If all solved, report round complete
    if (solveResult.allSolved) {
      handleRoundEnd(req.playerId, updatedState);
    }

    return res.json({
      success: true,
      message: 'Vault sector breached! Flag verified.',
      pointsEarned: solveResult.pointsEarned,
      teachingPanel: pConfig.teachingPanel,
      state: updatedState
    });
  }

  // 4. Generic incorrect code (no life lost)
  return res.json({
    success: false,
    message: 'Incorrect code. Check your clues and try again.',
    state: gameState.getClientState(req.playerId)
  });
});

/**
 * Helper to trigger round completion reports
 */
function handleRoundEnd(playerId, clientState) {
  const pState = gameState.getOrCreatePlayerState(playerId);
  if (pState.roundCompletedReported) return;
  pState.roundCompletedReported = true;

  const stats = {
    solved: clientState.solvedCount,
    livesLeft: clientState.lives,
    timeSeconds: clientState.elapsedSeconds,
    score: clientState.score
  };

  // Report to Main Event API
  integration.reportRoundComplete(playerId, stats).catch(err => {
    console.warn(`[API] Async reportRoundComplete error: ${err.message}`);
  });

  // Final submitScore to Leaderboard API
  integration.submitScore(playerId, clientState.teamName, clientState.score, {
    final: true,
    solvedCount: clientState.solvedCount,
    livesLeft: clientState.lives
  }).catch(err => {
    console.warn(`[API] Async final submitScore error: ${err.message}`);
  });
}

/**
 * =============================================================================
 * PUZZLE 1: THE TELLER LOGIN (SQL Injection)
 * =============================================================================
 */
router.post('/puzzle1/login', (req, res) => {
  const { username = '', password = '' } = req.body;

  // Filter: strip "--", ";", and "/*" from input
  const filterRegex = /(--|;|\/\*)/g;
  const filteredUsername = username.replace(filterRegex, '');
  const filteredPassword = password.replace(filterRegex, '');
  const wasFiltered = filterRegex.test(username) || filterRegex.test(password);

  // Reconstructed simulated query displayed in debug console
  const simulatedQuery = `SELECT * FROM tellers WHERE user='${filteredUsername}' AND pass='${filteredPassword}'`;

  // String-based evaluator for SQL injection tautologies
  // Block decoy ' OR '2'='2
  const combinedInput = `${filteredUsername} ${filteredPassword}`.toUpperCase();

  const isDecoyTwo = /'\s*OR\s*'?2'?\s*=\s*'?2'?/i.test(combinedInput);

  // Success pattern: ' OR '1'='1 or 1=1 tautology family
  const isAlwaysTrueTautology = (
    /'\s*OR\s*'?1'?\s*=\s*'?1'?/i.test(combinedInput) ||
    /'\s*OR\s*'?[A-Z]'?\s*=\s*'?[A-Z]'?/i.test(combinedInput) ||
    /1\s*=\s*1/i.test(combinedInput)
  );

  if (isDecoyTwo) {
    return res.json({
      success: false,
      query: simulatedQuery,
      filtered: wasFiltered,
      filterNotice: wasFiltered ? "Suspicious characters removed for your security." : null,
      message: "Login failed: Teller records matched decoy condition. Authorization denied."
    });
  }

  if (isAlwaysTrueTautology) {
    return res.json({
      success: true,
      query: simulatedQuery,
      filtered: wasFiltered,
      filterNotice: wasFiltered ? "Suspicious characters removed for your security." : null,
      message: "Authentication bypass successful. Access granted to Head Teller Portal.",
      memo: "Welcome, Sarah (Head Teller). Audit memo: SVZCLUxFVkVMMS03UTI=",
      tokenBase64: config.PUZZLES[1].encodedToken
    });
  }

  return res.json({
    success: false,
    query: simulatedQuery,
    filtered: wasFiltered,
    filterNotice: wasFiltered ? "Suspicious characters removed for your security." : null,
    message: "Login failed: Invalid teller username or password."
  });
});

/**
 * PUZZLE 1 TRAP: Emergency Access modal submission
 * Always fails and costs 1 life!
 */
router.post('/puzzle1/emergency-access', (req, res) => {
  gameState.deductLife(req.playerId, 'Emergency Access override attempt');
  const updatedState = gameState.getClientState(req.playerId);

  if (updatedState.lives <= 0) {
    handleRoundEnd(req.playerId, updatedState);
  }

  res.json({
    success: false,
    trapTriggered: true,
    lifeLost: true,
    message: "EMERGENCY OVERRIDE REJECTED: Intrusion attempt logged to Central Security! 1 life deducted.",
    state: updatedState
  });
});

/**
 * =============================================================================
 * PUZZLE 2: THE FROZEN TRANSFER BUTTON (DOM Editing)
 * =============================================================================
 */
router.post('/puzzle2/transfer', (req, res) => {
  const { fromAccount, toAccount, amount } = req.body;

  if (!fromAccount || !toAccount || !amount) {
    return res.status(400).json({
      success: false,
      message: "Missing transfer parameters."
    });
  }

  // Returns Caesar-shifted (+3) token: LYE-OHYHO2-5N8
  res.json({
    success: true,
    message: "Transfer executed successfully! Fraud shield bypassed.",
    caesarToken: config.PUZZLES[2].encodedToken,
    instructions: "Wire Reference Code issued: " + config.PUZZLES[2].encodedToken
  });
});

/**
 * PUZZLE 2 TRAP: "Unlock Transfers" button click
 * Undoes DOM edits and costs 1 life!
 */
router.post('/puzzle2/trap-unlock', (req, res) => {
  gameState.deductLife(req.playerId, 'Clicked Unlock Transfers trap button');
  const updatedState = gameState.getClientState(req.playerId);

  if (updatedState.lives <= 0) {
    handleRoundEnd(req.playerId, updatedState);
  }

  res.json({
    success: false,
    trapTriggered: true,
    lifeLost: true,
    message: "SECURITY TRIGGERED: Automated quick-unlock detected as tampering. Interface state reset! 1 life deducted.",
    state: updatedState
  });
});

/**
 * =============================================================================
 * PUZZLE 3: THE HIDDEN AUDIT HEADER (HTTP Response Headers)
 * =============================================================================
 */
router.get('/balance', (req, res) => {
  const acct = req.query.acct || '1001';
  const requestCount = gameState.recordBalanceRequest(req.playerId);

  // Decoy header: random UUID
  const requestId = crypto.randomUUID();
  res.setHeader('X-Request-Id', requestId);

  // Hard mode logic (HARD_MODE_HEADER=true):
  // Header only appears on the SECOND click/request per session (simulated cache miss)
  const shouldSendAuditHeader = !config.HARD_MODE_HEADER || requestCount >= 2;

  if (shouldSendAuditHeader) {
    res.setHeader('X-Audit-Code', config.PUZZLES[3].encodedToken);
  }

  res.json({
    acct,
    balance: '$4,213.50',
    audit_code: config.PUZZLES[3].decoyBodyCode
  });
});

module.exports = router;
