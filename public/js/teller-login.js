/**
 * =============================================================================
 * PUZZLE 1: THE TELLER LOGIN (teller-login.js)
 * SQL Injection evaluator & Debug Console Controller
 * =============================================================================
 */

(function () {
  'use strict';

  const config = window.__CTF_CONFIG__ || { basePath: '/ctf' };
  const API_BASE = `${config.basePath}/api`;

  const loginForm = document.getElementById('tellerLoginForm');
  const userInput = document.getElementById('tellerUser');
  const passInput = document.getElementById('tellerPass');
  const debugQueryEl = document.getElementById('debugQueryOutput');
  const debugFilterBanner = document.getElementById('debugFilterBanner');
  const successMemoCard = document.getElementById('tellerSuccessMemo');
  const memoTextEl = document.getElementById('memoCodeText');

  // Emergency Access Trap Modal
  const emergencyLink = document.getElementById('emergencyAccessLink');
  const emergencyModal = document.getElementById('emergencyModal');
  const emergencyForm = document.getElementById('emergencyForm');
  const emergencyCancelBtn = document.getElementById('emergencyCancelBtn');

  // Handle Login Submission
  if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
      e.preventDefault();

      const username = (userInput.value || '').trim();
      const password = (passInput.value || '').trim();

      try {
        const res = await fetch(`${API_BASE}/puzzle1/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username, password })
        });

        const data = await res.json();

        // Update debug query output
        if (debugQueryEl && data.query) {
          debugQueryEl.textContent = `[DEBUG QUERY]: ${data.query}`;
        }

        // Show/hide filter banner
        if (debugFilterBanner) {
          if (data.filtered) {
            debugFilterBanner.textContent = data.filterNotice || "Suspicious characters removed for your security.";
            debugFilterBanner.style.display = 'block';
          } else {
            debugFilterBanner.style.display = 'none';
          }
        }

        if (data.success) {
          // Injection successful!
          if (successMemoCard) {
            successMemoCard.style.display = 'block';
            if (memoTextEl) {
              memoTextEl.textContent = data.authCode || 'IVB-LEVEL1-7Q2';
            }
          }
          alert(`LOGIN SUCCESSFUL: ${data.message}`);
        } else {
          if (successMemoCard) successMemoCard.style.display = 'none';
          alert(data.message || 'Login failed.');
        }
      } catch (err) {
        console.error('Login error:', err);
        alert('Server connection error. Check console.');
      }
    });
  }

  // Handle Emergency Access Modal Trap
  if (emergencyLink && emergencyModal) {
    emergencyLink.addEventListener('click', (e) => {
      e.preventDefault();
      emergencyModal.classList.add('active');
    });
  }

  if (emergencyCancelBtn && emergencyModal) {
    emergencyCancelBtn.addEventListener('click', () => {
      emergencyModal.classList.remove('active');
    });
  }

  if (emergencyForm && emergencyModal) {
    emergencyForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const codeInput = document.getElementById('overrideCodeInput');
      const overrideCode = (codeInput ? codeInput.value : '').trim();

      try {
        const res = await fetch(`${API_BASE}/puzzle1/emergency-access`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ overrideCode })
        });

        const data = await res.json();
        emergencyModal.classList.remove('active');

        // Alert user
        alert(`⚠️ SECURITY WARNING: ${data.message}`);

        // Update lives in nav HUD if present
        const livesEl = document.getElementById('bankHudLives');
        if (livesEl && data.state) {
          livesEl.textContent = `${data.state.lives} / ${data.state.maxLives}`;
          if (data.state.lives <= 1) livesEl.style.color = '#ef4444';
        }
      } catch (err) {
        console.error('Emergency access error:', err);
      }
    });
  }
})();
