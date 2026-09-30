/**
 * =============================================================================
 * PUZZLE 3: THE HIDDEN AUDIT HEADER (dashboard.js)
 * Dashboard Balance Refresher Controller
 * =============================================================================
 */

(function () {
  'use strict';

  const config = window.__CTF_CONFIG__ || { basePath: '/ctf' };
  const API_BASE = `${config.basePath}/api`;

  const refreshBtn = document.getElementById('refreshBalanceBtn');
  const balanceDisplay = document.getElementById('accountBalanceDisplay');
  const auditSyncStatus = document.getElementById('auditSyncStatus');
  const balanceSyncLog = document.getElementById('balanceSyncLog');

  let clickCount = 0;

  if (refreshBtn) {
    refreshBtn.addEventListener('click', async () => {
      clickCount++;
      refreshBtn.disabled = true;
      refreshBtn.textContent = 'Syncing Ledger...';

      try {
        const res = await fetch(`${API_BASE}/balance?acct=1001`, {
          method: 'GET',
          headers: { 'Accept': 'application/json' }
        });

        const data = await res.json();

        if (balanceDisplay && data.balance) {
          balanceDisplay.textContent = data.balance;
        }

        if (auditSyncStatus) {
          auditSyncStatus.textContent = `Ledger Query #${clickCount} Synced. Status: HTTP ${res.status} OK`;
        }

        if (balanceSyncLog) {
          const timeStr = new Date().toLocaleTimeString();
          const logEntry = document.createElement('div');
          logEntry.style.fontSize = '0.82rem';
          logEntry.style.color = '#94a3b8';
          logEntry.style.marginTop = '4px';
          logEntry.innerHTML = `<span style="color:#38bdf8;">[${timeStr}]</span> GET /api/balance?acct=1001 → 200 OK | Body audit_code: <span style="color:#f59e0b;">${data.audit_code || 'none'}</span>`;
          balanceSyncLog.appendChild(logEntry);
        }
      } catch (err) {
        console.error('Balance fetch error:', err);
        if (auditSyncStatus) auditSyncStatus.textContent = 'Network sync failed.';
      } finally {
        setTimeout(() => {
          refreshBtn.disabled = false;
          refreshBtn.textContent = '🔄 Refresh Balance';
        }, 500);
      }
    });
  }
})();
