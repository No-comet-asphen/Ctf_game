const config = require('./config');

// In-memory player state storage: Map<playerId, PlayerState>
const players = new Map();

/**
 * Initialize or get player state
 */
function getOrCreatePlayerState(playerId, teamName = 'Heist Crew') {
  if (!players.has(playerId)) {
    const now = Date.now();
    players.set(playerId, {
      playerId,
      teamName,
      lives: config.INITIAL_LIVES,
      score: 0,
      startTime: now,
      endTime: null,
      isCompleted: false,
      roundStartedReported: false,
      roundCompletedReported: false,
      balanceRequestCount: 0,
      submissionTimestamps: [],
      puzzles: {
        1: {
          openedAt: now, // Auto-mark opened or when first visited
          solved: false,
          solvedAt: null,
          score: 0,
          hintsUnlocked: [false, false, false],
          failedAttempts: 0
        },
        2: {
          openedAt: now,
          solved: false,
          solvedAt: null,
          score: 0,
          hintsUnlocked: [false, false, false],
          failedAttempts: 0
        },
        3: {
          openedAt: now,
          solved: false,
          solvedAt: null,
          score: 0,
          hintsUnlocked: [false, false, false],
          failedAttempts: 0
        }
      }
    });
  }

  const state = players.get(playerId);
  if (teamName && state.teamName !== teamName) {
    state.teamName = teamName;
  }
  return state;
}

/**
 * Mark a puzzle as opened to begin hint countdown
 */
function markPuzzleOpened(playerId, puzzleId) {
  const state = getOrCreatePlayerState(playerId);
  const pId = parseInt(puzzleId, 10);
  if (state.puzzles[pId] && !state.puzzles[pId].openedAt) {
    state.puzzles[pId].openedAt = Date.now();
  }
  return state;
}

/**
 * Deduct a life (trap triggered) - Penalties removed
 */
function deductLife(playerId, reason = 'Trap triggered') {
  const state = getOrCreatePlayerState(playerId);
  // Zero penalties: Log trap warning without deducting lives
  console.log(`[GAME STATE] Trap triggered for ${playerId}. Reason: "${reason}". (Zero penalty mode: integrity preserved)`);
  return state;
}

/**
 * Check rate limit (10 submissions per minute)
 */
function checkRateLimit(playerId) {
  const state = getOrCreatePlayerState(playerId);
  const now = Date.now();
  const oneMinuteAgo = now - 60000;

  // Purge old timestamps
  state.submissionTimestamps = state.submissionTimestamps.filter(ts => ts > oneMinuteAgo);

  if (state.submissionTimestamps.length >= config.SUBMISSION_RATE_LIMIT_PER_MINUTE) {
    return {
      allowed: false,
      retryAfterSeconds: Math.ceil((state.submissionTimestamps[0] + 60000 - now) / 1000)
    };
  }

  state.submissionTimestamps.push(now);
  return { allowed: true };
}

/**
 * Calculate available hints and countdowns for a puzzle
 */
function getHintStatus(puzzleState, puzzleConfig) {
  const now = Date.now();
  const openedAt = puzzleState.openedAt || now;
  const elapsedSeconds = Math.max(0, Math.floor((now - openedAt) / 1000));

  const hintTiers = config.HINT_TIERS_SECONDS; // [180, 360, 540]
  const hints = [];

  for (let i = 0; i < hintTiers.length; i++) {
    const requiredSeconds = hintTiers[i];
    const isUnlockedByTime = elapsedSeconds >= requiredSeconds;
    const isRevealed = !!puzzleState.hintsUnlocked[i];
    const secondsRemaining = Math.max(0, requiredSeconds - elapsedSeconds);

    hints.push({
      tier: i + 1,
      requiredSeconds,
      secondsRemaining,
      isAvailable: isUnlockedByTime,
      isRevealed,
      text: isRevealed ? puzzleConfig.hints[i] : null
    });
  }

  return {
    elapsedSeconds,
    hints
  };
}

/**
 * Unlock a specific hint tier
 */
function unlockHint(playerId, puzzleId, tierIndex) {
  const state = getOrCreatePlayerState(playerId);
  const pId = parseInt(puzzleId, 10);
  const puzzle = state.puzzles[pId];

  if (!puzzle) {
    return { success: false, message: 'Invalid puzzle ID' };
  }

  if (puzzle.solved) {
    return { success: false, message: 'Puzzle is already solved' };
  }

  const hintStatus = getHintStatus(puzzle, config.PUZZLES[pId]);
  const tierInfo = hintStatus.hints[tierIndex];

  if (!tierInfo) {
    return { success: false, message: 'Invalid hint tier' };
  }

  if (!tierInfo.isAvailable) {
    return {
      success: false,
      message: `Hint tier ${tierIndex + 1} unlocks in ${tierInfo.secondsRemaining}s`,
      secondsRemaining: tierInfo.secondsRemaining
    };
  }

  puzzle.hintsUnlocked[tierIndex] = true;

  return {
    success: true,
    tier: tierIndex + 1,
    hintText: config.PUZZLES[pId].hints[tierIndex]
  };
}

/**
 * Calculate score for a solved puzzle (Zero penalties mode)
 */
function calculatePuzzleScore(puzzleState) {
  const basePoints = config.SCORING.BASE_POINTS; // 100 points full base

  // Time bonus based on time to solve
  const solveDurationSeconds = puzzleState.solvedAt && puzzleState.openedAt
    ? Math.max(0, Math.floor((puzzleState.solvedAt - puzzleState.openedAt) / 1000))
    : 0;

  const timeDecayFraction = Math.max(0, 1 - (solveDurationSeconds / config.SCORING.BONUS_DECAY_SECONDS));
  const timeBonus = Math.round(config.SCORING.MAX_TIME_BONUS * timeDecayFraction);

  return basePoints + timeBonus;
}

/**
 * Mark a puzzle as solved
 */
function markPuzzleSolved(playerId, puzzleId) {
  const state = getOrCreatePlayerState(playerId);
  const pId = parseInt(puzzleId, 10);
  const puzzle = state.puzzles[pId];

  if (!puzzle || puzzle.solved) {
    return { alreadySolved: true, state };
  }

  puzzle.solved = true;
  puzzle.solvedAt = Date.now();
  const pointsEarned = config.PUZZLES[pId].points;
  puzzle.score = pointsEarned;
  state.score += pointsEarned;

  // Check if all 3 puzzles are now solved
  const allSolved = Object.values(state.puzzles).every(p => p.solved);
  if (allSolved) {
    state.isCompleted = true;
    state.endTime = Date.now();
  }

  return {
    alreadySolved: false,
    pointsEarned,
    allSolved,
    state
  };
}

/**
 * Increment and get balance request count for player
 */
function recordBalanceRequest(playerId) {
  const state = getOrCreatePlayerState(playerId);
  state.balanceRequestCount = (state.balanceRequestCount || 0) + 1;
  return state.balanceRequestCount;
}

/**
 * Get sanitized client-safe view of player state
 */
function getClientState(playerId) {
  const state = getOrCreatePlayerState(playerId);
  const now = Date.now();
  const elapsedTotalSeconds = Math.floor(((state.endTime || now) - state.startTime) / 1000);

  const puzzlesClient = {};
  for (const [id, p] of Object.entries(state.puzzles)) {
    const pConfig = config.PUZZLES[id];
    const hintInfo = getHintStatus(p, pConfig);

    puzzlesClient[id] = {
      id: parseInt(id, 10),
      title: pConfig.title,
      category: pConfig.category,
      story: pConfig.story,
      bankPageUrl: pConfig.bankPageUrl,
      solved: p.solved,
      solvedAt: p.solvedAt,
      score: p.score,
      hints: hintInfo.hints,
      teachingPanel: p.solved ? pConfig.teachingPanel : null
    };
  }

  const solvedCount = Object.values(state.puzzles).filter(p => p.solved).length;

  return {
    playerId: state.playerId,
    teamName: state.teamName,
    lives: state.lives,
    maxLives: config.INITIAL_LIVES,
    score: state.score,
    elapsedSeconds: elapsedTotalSeconds,
    isCompleted: state.isCompleted || state.lives <= 0,
    solvedCount,
    totalPuzzles: Object.keys(config.PUZZLES).length,
    puzzles: puzzlesClient,
    mainSiteUrl: config.MAIN_SITE_URL
  };
}

module.exports = {
  getOrCreatePlayerState,
  markPuzzleOpened,
  deductLife,
  checkRateLimit,
  unlockHint,
  markPuzzleSolved,
  recordBalanceRequest,
  getClientState
};
