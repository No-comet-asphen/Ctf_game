/**
 * =============================================================================
 * IRONVAULT BANK – NAVIGATION & HUD HELPER (bank-nav.js)
 * Preserves session token across bank pages and shows live operator integrity
 * =============================================================================
 */

(function () {
  'use strict';

  const config = window.__CTF_CONFIG__ || {
    basePath: '/ctf',
    token: ''
  };

  const API_BASE = `${config.basePath}/api`;

  function initBankNav() {
    const urlParams = new URLSearchParams(window.location.search);
    const token = config.token || urlParams.get('token') || '';

    // Append token to all internal bank navigation links
    if (token) {
      document.querySelectorAll('a[href]').forEach(link => {
        const href = link.getAttribute('href');
        if (href && !href.startsWith('http') && !href.startsWith('#') && !href.includes('token=')) {
          const separator = href.includes('?') ? '&' : '?';
          link.setAttribute('href', `${href}${separator}token=${encodeURIComponent(token)}`);
        }
      });
    }

    // Set Heist Console return link
    const returnLink = document.getElementById('returnToConsoleLink');
    if (returnLink) {
      returnLink.href = `${config.basePath}${token ? '?token=' + encodeURIComponent(token) : ''}`;
    }

    // Update bank operator HUD
    fetchStateAndRenderHUD();
  }

  async function fetchStateAndRenderHUD() {
    try {
      const res = await fetch(`${API_BASE}/state`, { credentials: 'same-origin' });
      const data = await res.json();
      if (data.success && data.state) {
        const livesEl = document.getElementById('bankHudLives');
        if (livesEl) {
          livesEl.textContent = `${data.state.lives} / ${data.state.maxLives}`;
          if (data.state.lives <= 1) {
            livesEl.style.color = '#ef4444';
          }
        }
        const scoreEl = document.getElementById('bankHudScore');
        if (scoreEl) {
          scoreEl.textContent = `${data.state.score} PTS`;
        }
      }
    } catch (err) {
      // Offline / standalone fallback
    }
  }

  document.addEventListener('DOMContentLoaded', initBankNav);
})();
