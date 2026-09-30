const express = require('express');
const path = require('path');
const fs = require('fs');
const config = require('../config');

const router = express.Router();
const viewsDir = path.join(__dirname, '..', '..', 'views');

/**
 * Helper to serve HTML with injected config values
 */
function serveHtmlView(fileName, req, res) {
  const filePath = path.join(viewsDir, fileName);
  fs.readFile(filePath, 'utf8', (err, content) => {
    if (err) {
      console.error(`[PAGE ROUTE ERROR] Failed to load ${fileName}:`, err);
      return res.status(500).send('Error loading page.');
    }

    const token = req.token || req.query.token || req.cookies?.ctf_token || '';
    const rendered = content
      .replace(/{{BASE_PATH}}/g, config.BASE_PATH)
      .replace(/{{MAIN_SITE_URL}}/g, config.MAIN_SITE_URL)
      .replace(/{{TOKEN}}/g, token);

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(rendered);
  });
}

// Main CTF Round Page
router.get(['/', ''], (req, res) => {
  serveHtmlView('ctf-round.html', req, res);
});

// Bank Mini-site Pages
router.get('/bank/teller-login', (req, res) => {
  serveHtmlView('bank-login.html', req, res);
});

router.get('/bank/transfers', (req, res) => {
  serveHtmlView('bank-transfers.html', req, res);
});

router.get('/bank/dashboard', (req, res) => {
  serveHtmlView('bank-dashboard.html', req, res);
});

router.get('/bank/accounts', (req, res) => {
  serveHtmlView('bank-accounts.html', req, res);
});

router.get('/bank/audit', (req, res) => {
  serveHtmlView('bank-audit.html', req, res);
});

module.exports = router;
