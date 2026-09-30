/**
 * =============================================================================
 * PUZZLE 2: THE FROZEN TRANSFER BUTTON (transfers.js)
 * DOM Manipulation Challenge Controller
 * =============================================================================
 */

(function () {
  'use strict';

  const config = window.__CTF_CONFIG__ || { basePath: '/ctf' };
  const API_BASE = `${config.basePath}/api`;

  const transferForm = document.getElementById('transferForm');
  const trapUnlockBtn = document.getElementById('trapUnlockBtn');
  const transferSuccessModal = document.getElementById('transferSuccessModal');
  const tokenDisplayEl = document.getElementById('caesarTokenDisplay');
  const modalCloseBtn = document.getElementById('modalCloseBtn');

  // Handle Transfer Submission (Only possible after DevTools edits remove disabled + fraud shield)
  if (transferForm) {
    transferForm.addEventListener('submit', async (e) => {
      e.preventDefault();

      const fromAccount = document.getElementById('fromAccount')?.value || '1001';
      const toAccount = document.getElementById('toAccount')?.value || '';
      const amount = document.getElementById('amount')?.value || '1000';

      try {
        const res = await fetch(`${API_BASE}/puzzle2/transfer`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fromAccount, toAccount, amount })
        });

        const data = await res.json();

        if (data.success) {
          if (tokenDisplayEl) {
            tokenDisplayEl.textContent = data.authCode || 'IVB-LEVEL2-5K8';
          }
          if (transferSuccessModal) {
            transferSuccessModal.classList.add('active');
          }
        } else {
          alert(data.message || 'Transfer failed.');
        }
      } catch (err) {
        console.error('Transfer error:', err);
        alert('Server connection error. Check console.');
      }
    });
  }

  // Handle Trap Button ("Unlock Transfers")
  if (trapUnlockBtn) {
    trapUnlockBtn.addEventListener('click', async () => {
      try {
        const res = await fetch(`${API_BASE}/puzzle2/trap-unlock`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' }
        });

        const data = await res.json();

        alert(`⚠️ SECURITY NOTICE: ${data.message}\nInterface state has been reset.`);

        // Force page reload to undo any DOM edits
        window.location.reload();
      } catch (err) {
        console.error('Trap unlock error:', err);
        window.location.reload();
      }
    });
  }

  // Close Success Modal
  if (modalCloseBtn && transferSuccessModal) {
    modalCloseBtn.addEventListener('click', () => {
      transferSuccessModal.classList.remove('active');
    });
  }
})();
