const express = require('express');
const path = require('path');
const cookieParser = require('cookie-parser');
const config = require('./config');
const integration = require('./integration');
const pageRoutes = require('./routes/pageRoutes');
const apiRoutes = require('./routes/apiRoutes');

const app = express();

// Body parsers & cookie parser
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Static assets (CSS, JS, images)
const publicDir = path.join(__dirname, '..', 'public');
app.use('/public', express.static(publicDir));
if (config.BASE_PATH) {
  app.use(`${config.BASE_PATH}/public`, express.static(publicDir));
}

// API Routes
if (config.BASE_PATH) {
  app.use(`${config.BASE_PATH}/api`, apiRoutes);
}
app.use('/api', apiRoutes); // Also mount at /api for flexible direct requests

// Page Routes mounted under BASE_PATH
if (config.BASE_PATH) {
  app.use(config.BASE_PATH, pageRoutes);
  
  // Convenient root redirect to BASE_PATH
  app.get('/', (req, res) => {
    const tokenQuery = req.query.token ? `?token=${encodeURIComponent(req.query.token)}` : '';
    res.redirect(`${config.BASE_PATH}${tokenQuery}`);
  });
} else {
  app.use('/', pageRoutes);
}

// Global 404 handler
app.use((req, res) => {
  res.status(404).send(`
    <div style="font-family: sans-serif; background: #0a1128; color: #d4af37; height: 100vh; display: flex; flex-direction: column; align-items: center; justify-content: center;">
      <h1>404 – Vault Sector Not Found</h1>
      <p>The requested endpoint does not exist.</p>
      <a href="${config.BASE_PATH || '/'}" style="color: #fff; background: #c59b27; padding: 10px 20px; border-radius: 4px; text-decoration: none; margin-top: 15px;">Return to Heist Console</a>
    </div>
  `);
});

// Start Express Server helper
function startServer(port = config.PORT) {
  const server = app.listen(port, () => {
    const mockStatus = integration.isMockMode();
    console.log('====================================================');
    console.log(`🏦 IRONVAULT HEIST – CTF ROUND MODULE`);
    console.log(`📡 Server listening on http://localhost:${port}${config.BASE_PATH || '/'}`);
    console.log(`⚙️  Configured Base Path: "${config.BASE_PATH || '/'}"`);
    console.log(`🔑 Mock Mode Status:`);
    console.log(`   - Main Event API: ${mockStatus.mainEvent ? 'MOCK MODE ACTIVE (offline/fake data)' : 'CONNECTED (' + config.MAIN_EVENT_API_URL + ')'}`);
    console.log(`   - Leaderboard API: ${mockStatus.leaderboard ? 'MOCK MODE ACTIVE (offline/fake data)' : 'CONNECTED (' + config.LEADERBOARD_API_URL + ')'}`);
    console.log(`🛡️  Hard Mode Header (Puzzle 3): ${config.HARD_MODE_HEADER}`);
    console.log('====================================================');
  });
  return server;
}

if (require.main === module) {
  startServer();
}

module.exports = { app, startServer };
