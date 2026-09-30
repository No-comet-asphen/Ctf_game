/**
 * =============================================================================
 * IRONVAULT HEIST – CTF ROUND CONTROLLER (round.js)
 * Vanilla JS logic for the CTF Console HUD, Hint Timers & Code Validation
 * =============================================================================
 */

(function () {
  'use strict';

  const config = window.__CTF_CONFIG__ || {
    basePath: '/ctf',
    mainSiteUrl: 'http://localhost:8080',
    token: ''
  };

  const API_BASE = `${config.basePath}/api`;

  let gameState = null;
  let timerInterval = null;
  let hintTickInterval = null;

  // DOM Elements
  const elTeamName = document.getElementById('hudTeamName');
  const elPlayerId = document.getElementById('hudPlayerId');
  const elScore = document.getElementById('hudScore');
  const elTimer = document.getElementById('hudTimer');
  const elSolvedCount = document.getElementById('hudSolvedCount');
  const elLivesContainer = document.getElementById('hudLives');
  const elPuzzlesGrid = document.getElementById('puzzlesGrid');
  const elToastContainer = document.getElementById('toastContainer');
  const elSummaryModal = document.getElementById('summaryModal');
  const elMissionLog = document.getElementById('missionLog');

  /**
   * Helper: Show Toast Notification
   */
  function showToast(message, type = 'warning', durationMs = 4500) {
    if (!elToastContainer) return;
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    
    let icon = 'ℹ️';
    if (type === 'error') icon = '🚨';
    if (type === 'success') icon = '🔓';
    if (type === 'warning') icon = '⚠️';

    toast.innerHTML = `
      <div style="font-size: 1.2rem;">${icon}</div>
      <div style="flex: 1;">${message}</div>
    `;

    elToastContainer.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateX(100%)';
      toast.style.transition = 'all 0.3s ease';
      setTimeout(() => toast.remove(), 300);
    }, durationMs);
  }

  /**
   * Helper: Add log line to mission console
   */
  function addMissionLog(message, type = '') {
    if (!elMissionLog) return;
    const timeStr = new Date().toLocaleTimeString();
    const line = document.createElement('div');
    line.className = 'mission-log-line';
    line.innerHTML = `<span class="time">[${timeStr}]</span> <span class="${type}">${message}</span>`;
    elMissionLog.appendChild(line);
    elMissionLog.scrollTop = elMissionLog.scrollHeight;
  }

  /**
   * Format seconds to HH:MM:SS or MM:SS
   */
  function formatTime(totalSeconds) {
    const sec = Math.max(0, Math.floor(totalSeconds));
    const hours = Math.floor(sec / 3600);
    const minutes = Math.floor((sec % 3600) / 60);
    const seconds = sec % 60;

    if (hours > 0) {
      return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    }
    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }

  /**
   * Fetch current game state from backend
   */
  async function fetchGameState() {
    try {
      const tokenParam = config.token ? `?token=${encodeURIComponent(config.token)}` : '';
      const res = await fetch(`${API_BASE}/state${tokenParam}`, { credentials: 'same-origin' });
      const data = await res.json();
      if (data.success && data.state) {
        gameState = data.state;
        renderHUD();
        renderPuzzles();
        checkGameCompletion();
      }
    } catch (err) {
      console.error('Failed to load game state:', err);
    }
  }

  /**
   * Render HUD elements (Lives, Score, Timer, Breached count)
   */
  function renderHUD() {
    if (!gameState) return;

    if (elTeamName) elTeamName.textContent = gameState.teamName || 'Unknown Crew';
    if (elPlayerId) elPlayerId.textContent = gameState.playerId || 'Agent';
    if (elScore) elScore.textContent = `${gameState.score} PTS`;
    if (elSolvedCount) elSolvedCount.textContent = `${gameState.solvedCount} / ${gameState.totalPuzzles}`;

    // Render Lives Pips
    if (elLivesContainer) {
      elLivesContainer.innerHTML = '';
      for (let i = 0; i < gameState.maxLives; i++) {
        const pip = document.createElement('div');
        const isActive = i < gameState.lives;
        pip.className = `life-pip ${isActive ? 'active' : 'lost'}`;
        pip.title = isActive ? 'Vault Integrity Active' : 'Vault Integrity Depleted';
        pip.innerHTML = isActive ? '❤️' : '💀';
        elLivesContainer.appendChild(pip);
      }
    }
  }

  /**
   * Render all 3 Puzzle Cards
   */
  function renderPuzzles() {
    if (!gameState || !elPuzzlesGrid) return;
    elPuzzlesGrid.innerHTML = '';

    for (const [pId, pData] of Object.entries(gameState.puzzles)) {
      const card = createPuzzleCardElement(pData);
      elPuzzlesGrid.appendChild(card);
    }
  }

  /**
   * Create DOM node for an individual puzzle card
   */
  function createPuzzleCardElement(p) {
    const card = document.createElement('div');
    card.className = `puzzle-card ${p.solved ? 'solved' : ''}`;
    card.id = `puzzle-card-${p.id}`;

    const bankUrl = `${config.basePath}${p.bankPageUrl}${config.token ? '?token=' + encodeURIComponent(config.token) : ''}`;

    let teachingPanelHtml = '';
    if (p.solved && p.teachingPanel) {
      teachingPanelHtml = `
        <div class="teaching-panel">
          <div class="teaching-panel-title">🛡️ Security Debrief & Fix:</div>
          <div class="teaching-panel-body">${p.teachingPanel}</div>
        </div>
      `;
    }

    let codeSectionHtml = '';
    if (!p.solved) {
      codeSectionHtml = `
        <div class="code-submission-box">
          <label class="form-label" for="codeInput-${p.id}">Authorize Access Code:</label>
          <div class="code-input-group">
            <input 
              type="text" 
              id="codeInput-${p.id}" 
              class="form-input code-mono" 
              placeholder="e.g. IVB-LEVEL${p.id}-..." 
              autocomplete="off" 
              spellcheck="false"
              ${gameState.lives <= 0 ? 'disabled' : ''}
            />
            <button class="btn btn-gold" id="btnSubmit-${p.id}" ${gameState.lives <= 0 ? 'disabled' : ''}>
              Submit
            </button>
          </div>
        </div>
      `;
    } else {
      codeSectionHtml = `
        <div class="code-submission-box" style="border-color: rgba(16, 185, 129, 0.4); background: rgba(16, 185, 129, 0.05);">
          <div style="color: #34d399; font-weight: 700; font-family: var(--font-mono); font-size: 0.9rem;">
            ✓ SECTOR SECURED (+${p.score} PTS)
          </div>
        </div>
      `;
    }

    // Hint Section
    let hintsHtml = '';
    if (!p.solved) {
      hintsHtml = `
        <div class="hints-container">
          <div class="hints-header">
            <h4>💡 Intel & Hints</h4>
          </div>
          <div class="hints-list" id="hintsList-${p.id}">
            ${renderHintsListHtml(p.id, p.hints)}
          </div>
        </div>
      `;
    }

    card.innerHTML = `
      <div class="puzzle-card-header">
        <div>
          <div class="sector-tag">SECTOR 0${p.id} // ${p.category}</div>
          <h3 class="puzzle-title">${p.title}</h3>
        </div>
        <span class="badge ${p.solved ? 'badge-green' : 'badge-gold'}">
          ${p.solved ? 'BREACHED' : 'SECURED'}
        </span>
      </div>

      <div class="story-box">
        "${p.story}"
      </div>

      <div class="puzzle-action-row">
        <a href="${bankUrl}" target="_blank" class="btn btn-outline-gold bank-page-btn" data-puzzle-id="${p.id}">
          🏦 Open Bank Page (Sector 0${p.id}) ↗
        </a>
      </div>

      ${codeSectionHtml}
      ${teachingPanelHtml}
      ${hintsHtml}
    `;

    // Attach event listeners
    const openBtn = card.querySelector(`[data-puzzle-id="${p.id}"]`);
    if (openBtn) {
      openBtn.addEventListener('click', () => {
        notifyPuzzleOpened(p.id);
      });
    }

    const submitBtn = card.querySelector(`#btnSubmit-${p.id}`);
    const inputEl = card.querySelector(`#codeInput-${p.id}`);
    if (submitBtn && inputEl) {
      const doSubmit = () => handleCodeSubmission(p.id, inputEl.value.trim());
      submitBtn.addEventListener('click', doSubmit);
      inputEl.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') doSubmit();
      });
    }

    // Attach hint unlock listeners
    const hintBtns = card.querySelectorAll('.btn-unlock-hint');
    hintBtns.forEach(btn => {
      btn.addEventListener('click', (e) => {
        const tierIdx = parseInt(e.target.dataset.tier, 10);
        handleUnlockHint(p.id, tierIdx);
      });
    });

    return card;
  }

  /**
   * Render HTML for hints in a puzzle
   */
  function renderHintsListHtml(puzzleId, hints) {
    if (!hints || hints.length === 0) return '';

    return hints.map((h, idx) => {
      if (h.isRevealed) {
        return `
          <div class="hint-tier-item">
            <div class="hint-tier-header">
              <span class="badge badge-gold">Hint Tier ${h.tier}</span>
              <span style="font-size: 0.75rem; color: #34d399;">Unlocked</span>
            </div>
            <div class="hint-content">${h.text}</div>
          </div>
        `;
      } else if (h.isAvailable) {
        return `
          <div class="hint-tier-item">
            <div class="hint-tier-header">
              <span class="badge badge-blue">Hint Tier ${h.tier}</span>
              <button class="btn btn-secondary btn-unlock-hint" style="padding: 4px 10px; font-size: 0.75rem;" data-tier="${idx}">
                Unlock Hint
              </button>
            </div>
          </div>
        `;
      } else {
        return `
          <div class="hint-tier-item">
            <div class="hint-tier-header">
              <span class="badge badge-gold" style="opacity: 0.6;">Hint Tier ${h.tier}</span>
              <span class="hint-timer-text" data-timer-puzzle="${puzzleId}" data-timer-tier="${idx}" data-seconds-left="${h.secondsRemaining}">
                Unlocks in ${formatTime(h.secondsRemaining)}
              </span>
            </div>
          </div>
        `;
      }
    }).join('');
  }

  /**
   * Mark puzzle opened on backend to start hint timer
   */
  async function notifyPuzzleOpened(puzzleId) {
    try {
      await fetch(`${API_BASE}/puzzle/open`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ puzzleId })
      });
    } catch (err) {
      console.warn('Failed to notify puzzle open:', err);
    }
  }

  /**
   * Handle code submission
   */
  async function handleCodeSubmission(puzzleId, code) {
    if (!code) {
      showToast('Please enter an authorization code.', 'warning');
      return;
    }

    addMissionLog(`Submitting code for Sector 0${puzzleId}: ${code}...`);

    try {
      const res = await fetch(`${API_BASE}/submit-code`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ puzzleId, code })
      });

      const data = await res.json();

      if (data.rateLimited) {
        showToast(data.message, 'warning');
        addMissionLog(`Rate limit engaged: ${data.message}`, 'warn');
        return;
      }

      if (data.state) {
        gameState = data.state;
        renderHUD();
      }

      if (data.trapTriggered) {
        showToast(data.message, 'warning', 6000);
        addMissionLog(`SECURITY WARNING: Sector 0${puzzleId} trap triggered.`, 'alert');
        renderPuzzles();
        checkGameCompletion();
        return;
      }

      if (data.success) {
        showToast(data.message, 'success', 5000);
        addMissionLog(`BREACH SUCCESSFUL! Sector 0${puzzleId} cracked (+${data.pointsEarned} pts).`, 'success');
        renderPuzzles();
        checkGameCompletion();
        return;
      }

      // Generic failure
      showToast(data.message || 'Incorrect code.', 'warning');
      addMissionLog(`Verification failed for Sector 0${puzzleId}.`, 'warn');
    } catch (err) {
      console.error('Submission error:', err);
      showToast('Network error during submission. Retrying...', 'error');
    }
  }

  /**
   * Handle Hint Unlock
   */
  async function handleUnlockHint(puzzleId, tierIndex) {
    try {
      const res = await fetch(`${API_BASE}/hint/unlock`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ puzzleId, tierIndex })
      });

      const data = await res.json();
      if (data.success) {
        showToast(`Hint Tier ${data.tier} unlocked.`, 'warning');
        addMissionLog(`Intel unlocked for Sector 0${puzzleId}: Hint Tier ${data.tier}.`, 'warn');
        if (data.state) {
          gameState = data.state;
          renderHUD();
          renderPuzzles();
        }
      } else {
        showToast(data.message || 'Hint unavailable.', 'warning');
      }
    } catch (err) {
      console.error('Hint unlock error:', err);
    }
  }

  /**
   * Check if round has ended (all 3 solved or 0 lives)
   */
  function checkGameCompletion() {
    if (!gameState) return;

    if (gameState.isCompleted || gameState.lives <= 0) {
      showSummaryModal();
    }
  }

  /**
   * Display Summary / Game Over Modal
   */
  function showSummaryModal() {
    if (!elSummaryModal || elSummaryModal.classList.contains('active')) return;

    const isVictory = gameState.solvedCount === gameState.totalPuzzles && gameState.lives > 0;
    const modalTitle = document.getElementById('summaryTitle');
    const modalContent = document.getElementById('summaryContent');
    const modalReturnBtn = document.getElementById('summaryReturnBtn');

    if (modalTitle) {
      modalTitle.textContent = isVictory ? '🏆 HEIST SUCCESSFUL – VAULT EMPTIED' : '🚨 HEIST ABORTED – OPERATOR CAUGHT';
      modalTitle.style.color = isVictory ? '#34d399' : '#f87171';
    }

    if (modalContent) {
      modalContent.innerHTML = `
        <div style="text-align: center; margin-bottom: 20px;">
          <div style="font-size: 3rem; margin-bottom: 10px;">${isVictory ? '💰' : '🚔'}</div>
          <p style="color: var(--text-main); font-size: 1.05rem;">
            ${isVictory 
              ? 'Outstanding performance, Agent. All security layers bypassed and reserves secured.' 
              : 'Central Security detected your unauthorized operations. Heist session terminated.'}
          </p>
        </div>

        <div style="background: var(--bg-secondary); border: 1px solid var(--border-color); border-radius: var(--radius-md); padding: 18px; margin-bottom: 20px;">
          <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
            <span style="color: var(--text-muted);">Sectors Breached:</span>
            <strong style="color: #fff;">${gameState.solvedCount} of ${gameState.totalPuzzles}</strong>
          </div>
          <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
            <span style="color: var(--text-muted);">Integrity / Lives Left:</span>
            <strong style="color: ${gameState.lives > 0 ? '#34d399' : '#f87171'};">${gameState.lives} of ${gameState.maxLives}</strong>
          </div>
          <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
            <span style="color: var(--text-muted);">Total Infiltration Time:</span>
            <strong style="color: var(--accent-cyan); font-family: var(--font-mono);">${formatTime(gameState.elapsedSeconds)}</strong>
          </div>
          <div style="display: flex; justify-content: space-between; border-top: 1px solid var(--border-color); padding-top: 8px; margin-top: 8px;">
            <span style="color: var(--gold-light); font-weight: 700;">Final Score:</span>
            <strong style="color: var(--gold-light); font-size: 1.25rem;">${gameState.score} PTS</strong>
          </div>
        </div>
      `;
    }

    if (modalReturnBtn) {
      modalReturnBtn.href = gameState.mainSiteUrl || config.mainSiteUrl || 'http://localhost:8080';
    }

    elSummaryModal.classList.add('active');
  }

  /**
   * Timers initialization
   */
  function startTimers() {
    // 1. Overall mission stopwatch
    timerInterval = setInterval(() => {
      if (gameState && !gameState.isCompleted && gameState.lives > 0) {
        gameState.elapsedSeconds++;
        if (elTimer) elTimer.textContent = formatTime(gameState.elapsedSeconds);
      }
    }, 1000);

    // 2. Hint countdown ticks
    hintTickInterval = setInterval(() => {
      const timerSpans = document.querySelectorAll('[data-seconds-left]');
      let reRenderNeeded = false;

      timerSpans.forEach(span => {
        let left = parseInt(span.dataset.secondsLeft, 10);
        if (left > 0) {
          left--;
          span.dataset.secondsLeft = left;
          span.textContent = `Unlocks in ${formatTime(left)}`;
          if (left === 0) {
            reRenderNeeded = true;
          }
        }
      });

      if (reRenderNeeded) {
        fetchGameState();
      }
    }, 1000);
  }

  // Initialize on DOM load
  document.addEventListener('DOMContentLoaded', () => {
    fetchGameState().then(startTimers);
    addMissionLog('Heist console initialized. Monitoring bank sectors...', 'warn');
  });
})();
