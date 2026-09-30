const config = require('./config');

/**
 * =============================================================================
 * INTEGRATION FIELD & ENDPOINT MAPPINGS
 * Edit this mapping object when external API specifications or field names change.
 * All adapter functions strictly read from this configuration.
 * =============================================================================
 */
const FIELD_MAPPINGS = {
  mainEvent: {
    // Endpoints (relative to MAIN_EVENT_API_URL or full URLs)
    sessionEndpoint: '/api/session/validate',
    roundStartEndpoint: '/api/round/start',
    roundCompleteEndpoint: '/api/round/complete',

    // Request fields
    requestTokenKey: 'token',
    requestPlayerIdKey: 'playerId',
    requestRoundSolvedKey: 'solved',
    requestRoundLivesLeftKey: 'livesLeft',
    requestRoundTimeSecondsKey: 'timeSeconds',
    requestRoundScoreKey: 'score',

    // Response fields
    responsePlayerIdKey: 'playerId',
    responseTeamNameKey: 'teamName',
    responseSuccessKey: 'success'
  },
  leaderboard: {
    // Endpoints (relative to LEADERBOARD_API_URL or full URLs)
    submitScoreEndpoint: '/api/leaderboard/submit',

    // Request fields
    requestPlayerIdKey: 'playerId',
    requestTeamNameKey: 'teamName',
    requestPointsKey: 'points',
    requestMetaKey: 'meta',

    // Response fields
    responseSuccessKey: 'success',
    responseRankKey: 'rank'
  },
  headers: {
    apiKeyHeader: 'x-api-key',
    authorizationHeader: 'Authorization'
  }
};

// Background retry queue for failed API calls
const backgroundQueue = [];
let queueProcessorInterval = null;

/**
 * Helper: Perform HTTP fetch with timeout and retries (2x retries -> 3 attempts total)
 * @param {string} url 
 * @param {object} options 
 * @param {number} retries 
 * @param {number} timeoutMs 
 * @returns {Promise<any>}
 */
async function fetchWithRetry(url, options = {}, retries = 2, timeoutMs = 5000) {
  let lastError = null;

  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      if (attempt > 0) {
        console.log(`[INTEGRATION] Retry attempt ${attempt}/${retries} for URL: ${url}`);
        // Small exponential delay before retry
        await new Promise((resolve) => setTimeout(resolve, attempt * 1000));
      }

      const response = await fetch(url, {
        ...options,
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text().catch(() => '');
        throw new Error(`HTTP ${response.status} ${response.statusText}: ${errorText}`);
      }

      return await response.json();
    } catch (err) {
      clearTimeout(timeoutId);
      lastError = err;
      const isAbort = err.name === 'AbortError';
      console.warn(`[INTEGRATION WARN] Attempt ${attempt + 1} failed for ${url}: ${isAbort ? 'Timeout (5s)' : err.message}`);
    }
  }

  throw lastError || new Error(`Failed to call ${url} after ${retries + 1} attempts`);
}

/**
 * Helper: Enqueue failed request for background retry so gameplay never breaks
 */
function enqueueBackgroundCall(taskType, payload) {
  backgroundQueue.push({
    id: `queue-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    type: taskType,
    payload,
    enqueuedAt: new Date().toISOString(),
    attempts: 0
  });

  console.log(`[INTEGRATION QUEUE] Enqueued background task '${taskType}' (queue length: ${backgroundQueue.length})`);
  startQueueProcessorIfNeeded();
}

/**
 * Background worker processing retries
 */
function startQueueProcessorIfNeeded() {
  if (queueProcessorInterval) return;

  queueProcessorInterval = setInterval(async () => {
    if (backgroundQueue.length === 0) {
      clearInterval(queueProcessorInterval);
      queueProcessorInterval = null;
      return;
    }

    const task = backgroundQueue.shift();
    task.attempts++;

    console.log(`[INTEGRATION QUEUE] Retrying queued task: ${task.type} (attempt ${task.attempts})`);

    try {
      if (task.type === 'reportRoundStart') {
        await reportRoundStart(task.payload.playerId, false);
      } else if (task.type === 'reportRoundComplete') {
        await reportRoundComplete(task.payload.playerId, task.payload.data, false);
      } else if (task.type === 'submitScore') {
        await submitScore(task.payload.playerId, task.payload.teamName, task.payload.points, task.payload.meta, false);
      }
      console.log(`[INTEGRATION QUEUE SUCCESS] Task ${task.id} completed successfully`);
    } catch (err) {
      console.warn(`[INTEGRATION QUEUE ERROR] Task ${task.id} failed again: ${err.message}`);
      if (task.attempts < 5) {
        // Re-enqueue if under max retry threshold
        backgroundQueue.push(task);
      } else {
        console.error(`[INTEGRATION QUEUE DROP] Dropping task ${task.id} after max retries`);
      }
    }
  }, 15000);

  if (queueProcessorInterval.unref) {
    queueProcessorInterval.unref();
  }
}

/**
 * Construct full URL from base and path
 */
function buildUrl(baseUrl, endpoint) {
  const cleanBase = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
  const cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
  return `${cleanBase}${cleanEndpoint}`;
}

// Check mock mode conditions
function isMainEventMockMode() {
  return !config.MAIN_EVENT_API_URL || !config.MAIN_EVENT_API_KEY;
}

function isLeaderboardMockMode() {
  return !config.LEADERBOARD_API_URL || !config.LEADERBOARD_API_KEY;
}

/**
 * 1. getSession(token) -> MAIN_EVENT_API
 * Validates player/team from token passed by main event (?token= or Authorization: Bearer).
 * Returns { playerId, teamName }
 * 
 * @param {string} token 
 * @returns {Promise<{ playerId: string, teamName: string }>}
 */
async function getSession(token) {
  if (isMainEventMockMode()) {
    console.log(`[INTEGRATION MOCK] getSession() called with token: "${token || 'NONE'}"`);
    // Return deterministic mock data based on token or default
    const safeToken = (token || '').trim();
    const playerId = safeToken ? `mock-player-${safeToken.replace(/[^a-zA-Z0-9]/g, '').slice(0, 8) || '01'}` : 'player-test-01';
    const teamName = safeToken ? `Heist Squad (${safeToken.slice(0, 4)})` : 'The Heist Crew';
    return { playerId, teamName };
  }

  const url = buildUrl(config.MAIN_EVENT_API_URL, FIELD_MAPPINGS.mainEvent.sessionEndpoint);
  try {
    const data = await fetchWithRetry(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        [FIELD_MAPPINGS.headers.apiKeyHeader]: config.MAIN_EVENT_API_KEY,
        [FIELD_MAPPINGS.headers.authorizationHeader]: `Bearer ${token}`
      },
      body: JSON.stringify({
        [FIELD_MAPPINGS.mainEvent.requestTokenKey]: token
      })
    }, 2, 5000);

    return {
      playerId: data[FIELD_MAPPINGS.mainEvent.responsePlayerIdKey] || 'unknown-player',
      teamName: data[FIELD_MAPPINGS.mainEvent.responseTeamNameKey] || 'Unknown Team'
    };
  } catch (err) {
    console.error(`[INTEGRATION ERROR] getSession failed: ${err.message}. Falling back to offline session.`);
    // Fallback so user can still play
    return {
      playerId: `fallback-${(token || 'guest').slice(0, 8)}`,
      teamName: 'Offline Heist Team'
    };
  }
}

/**
 * 2. reportRoundStart(playerId) -> MAIN_EVENT_API
 * 
 * @param {string} playerId 
 * @param {boolean} allowEnqueueOnFailure
 * @returns {Promise<object>}
 */
async function reportRoundStart(playerId, allowEnqueueOnFailure = true) {
  if (isMainEventMockMode()) {
    console.log(`[INTEGRATION MOCK] reportRoundStart() called for playerId: "${playerId}"`);
    return {
      success: true,
      mock: true,
      timestamp: new Date().toISOString()
    };
  }

  const url = buildUrl(config.MAIN_EVENT_API_URL, FIELD_MAPPINGS.mainEvent.roundStartEndpoint);
  try {
    const data = await fetchWithRetry(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        [FIELD_MAPPINGS.headers.apiKeyHeader]: config.MAIN_EVENT_API_KEY
      },
      body: JSON.stringify({
        [FIELD_MAPPINGS.mainEvent.requestPlayerIdKey]: playerId
      })
    }, 2, 5000);

    return data;
  } catch (err) {
    console.error(`[INTEGRATION ERROR] reportRoundStart failed for ${playerId}: ${err.message}`);
    if (allowEnqueueOnFailure) {
      enqueueBackgroundCall('reportRoundStart', { playerId });
    }
    // Never break gameplay
    return { success: false, queued: true, error: err.message };
  }
}

/**
 * 3. reportRoundComplete(playerId, { solved, livesLeft, timeSeconds, score }) -> MAIN_EVENT_API
 * 
 * @param {string} playerId 
 * @param {object} stats 
 * @param {boolean} allowEnqueueOnFailure
 * @returns {Promise<object>}
 */
async function reportRoundComplete(playerId, stats, allowEnqueueOnFailure = true) {
  const { solved, livesLeft, timeSeconds, score } = stats;

  if (isMainEventMockMode()) {
    console.log(`[INTEGRATION MOCK] reportRoundComplete() called for ${playerId} with stats:`, stats);
    return {
      success: true,
      mock: true,
      recordedAt: new Date().toISOString()
    };
  }

  const url = buildUrl(config.MAIN_EVENT_API_URL, FIELD_MAPPINGS.mainEvent.roundCompleteEndpoint);
  try {
    const data = await fetchWithRetry(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        [FIELD_MAPPINGS.headers.apiKeyHeader]: config.MAIN_EVENT_API_KEY
      },
      body: JSON.stringify({
        [FIELD_MAPPINGS.mainEvent.requestRoundCompletePlayerIdKey]: playerId,
        [FIELD_MAPPINGS.mainEvent.requestRoundSolvedKey]: solved,
        [FIELD_MAPPINGS.mainEvent.requestRoundLivesLeftKey]: livesLeft,
        [FIELD_MAPPINGS.mainEvent.requestRoundTimeSecondsKey]: timeSeconds,
        [FIELD_MAPPINGS.mainEvent.requestRoundScoreKey]: score
      })
    }, 2, 5000);

    return data;
  } catch (err) {
    console.error(`[INTEGRATION ERROR] reportRoundComplete failed for ${playerId}: ${err.message}`);
    if (allowEnqueueOnFailure) {
      enqueueBackgroundCall('reportRoundComplete', { playerId, data: stats });
    }
    // Never break gameplay
    return { success: false, queued: true, error: err.message };
  }
}

/**
 * 4. submitScore(playerId, teamName, points, meta) -> LEADERBOARD_API
 * Called after each puzzle solve and at round end.
 * 
 * @param {string} playerId 
 * @param {string} teamName 
 * @param {number} points 
 * @param {object} meta 
 * @param {boolean} allowEnqueueOnFailure
 * @returns {Promise<object>}
 */
async function submitScore(playerId, teamName, points, meta = {}, allowEnqueueOnFailure = true) {
  if (isLeaderboardMockMode()) {
    console.log(`[INTEGRATION MOCK] submitScore() called for ${playerId} (${teamName}): points=${points}, meta=`, meta);
    return {
      success: true,
      mock: true,
      points,
      rank: 1
    };
  }

  const url = buildUrl(config.LEADERBOARD_API_URL, FIELD_MAPPINGS.leaderboard.submitScoreEndpoint);
  try {
    const data = await fetchWithRetry(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        [FIELD_MAPPINGS.headers.apiKeyHeader]: config.LEADERBOARD_API_KEY
      },
      body: JSON.stringify({
        [FIELD_MAPPINGS.leaderboard.requestPlayerIdKey]: playerId,
        [FIELD_MAPPINGS.leaderboard.requestTeamNameKey]: teamName,
        [FIELD_MAPPINGS.leaderboard.requestPointsKey]: points,
        [FIELD_MAPPINGS.leaderboard.requestMetaKey]: meta
      })
    }, 2, 5000);

    return data;
  } catch (err) {
    console.error(`[INTEGRATION ERROR] submitScore failed for ${playerId}: ${err.message}`);
    if (allowEnqueueOnFailure) {
      enqueueBackgroundCall('submitScore', { playerId, teamName, points, meta });
    }
    // Never break gameplay
    return { success: false, queued: true, error: err.message };
  }
}

module.exports = {
  FIELD_MAPPINGS,
  getSession,
  reportRoundStart,
  reportRoundComplete,
  submitScore,
  // Exported for testing/inspection
  getQueueStatus: () => ({ queueLength: backgroundQueue.length, items: [...backgroundQueue] }),
  isMockMode: () => ({ mainEvent: isMainEventMockMode(), leaderboard: isLeaderboardMockMode() })
};
