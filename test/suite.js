/**
 * Automated test suite for IronVault Heist CTF Module (Money Heist Red/Black, Zero Penalties, Direct Codes)
 */
const assert = require('assert');
const config = require('../server/config');
const integration = require('../server/integration');
const gameState = require('../server/gameState');

async function runTests() {
  console.log('🧪 RUNNING COMPREHENSIVE TESTS FOR MONEY HEIST CTF ROUND...\n');

  // Test 1: Integration Adapter Mock Mode
  console.log('--- Test 1: Integration Adapter Mock Mode ---');
  const session = await integration.getSession('test-token-xyz');
  assert.strictEqual(typeof session.playerId, 'string');
  assert.strictEqual(typeof session.teamName, 'string');
  console.log('✓ getSession returns valid player & team:', session);

  const startRes = await integration.reportRoundStart('test-player-01');
  assert.strictEqual(startRes.success, true);
  console.log('✓ reportRoundStart succeeds in mock mode');

  const scoreRes = await integration.submitScore('test-player-01', 'Test Team', 100, { puzzle: 1 });
  assert.strictEqual(scoreRes.success, true);
  console.log('✓ submitScore succeeds in mock mode');

  const compRes = await integration.reportRoundComplete('test-player-01', {
    solved: 3,
    livesLeft: 3,
    timeSeconds: 120,
    score: 300
  });
  assert.strictEqual(compRes.success, true);
  console.log('✓ reportRoundComplete succeeds in mock mode\n');

  // Test 2: Game State & Zero Penalties
  console.log('--- Test 2: Game State & Zero Penalties ---');
  const playerId = 'player-agent-test';
  const state = gameState.getOrCreatePlayerState(playerId, 'La Resistencia Squad');
  assert.strictEqual(state.lives, 3);
  assert.strictEqual(state.score, 0);

  // Trap trigger preserves lives in zero penalties mode
  gameState.deductLife(playerId, 'Test Trap');
  const updatedState = gameState.getClientState(playerId);
  assert.strictEqual(updatedState.lives, 3);
  console.log('✓ Zero penalty mode: Trap alert triggered with full integrity preserved (3 lives)');

  // Test 3: Puzzle 1 SQL Injection Evaluator & Direct Code
  console.log('\n--- Test 3: Puzzle 1 Logic & Direct Code ---');
  const { app } = require('../server/index');
  const server = app.listen(3099);

  try {
    const baseUrl = `http://localhost:3099${config.BASE_PATH}/api`;

    // 3a: Bad login
    let res = await fetch(`${baseUrl}/puzzle1/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'sarah', password: 'wrongpassword' })
    });
    let data = await res.json();
    assert.strictEqual(data.success, false);
    assert.ok(data.query.includes("WHERE user='sarah' AND pass='wrongpassword'"));
    console.log('✓ Plain failed login returns query in debug console');

    // 3b: Filter check for --, ;, /*
    res = await fetch(`${baseUrl}/puzzle1/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: "admin'--", password: "x" })
    });
    data = await res.json();
    assert.strictEqual(data.filtered, true);
    assert.ok(!data.query.includes('--'));
    console.log('✓ Filter strips "--" and alerts user');

    // 3c: Decoy tautology ' OR '2'='2
    res = await fetch(`${baseUrl}/puzzle1/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: "' OR '2'='2", password: "" })
    });
    data = await res.json();
    assert.strictEqual(data.success, false);
    console.log("✓ Decoy ' OR '2'='2 correctly fails");

    // 3d: Valid SQL injection ' OR '1'='1 (Returns DIRECT code, NO Base64)
    res = await fetch(`${baseUrl}/puzzle1/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: "' OR '1'='1", password: "" })
    });
    data = await res.json();
    assert.strictEqual(data.success, true);
    assert.strictEqual(data.authCode, 'IVB-LEVEL1-7Q2');
    console.log("✓ Valid SQL injection ' OR '1'='1 succeeds and directly reveals IVB-LEVEL1-7Q2");

    // 3e: Emergency access trap: Zero penalties mode
    res = await fetch(`${baseUrl}/puzzle1/emergency-access`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ overrideCode: 'TEST-OVERRIDE' })
    });
    data = await res.json();
    assert.strictEqual(data.trapTriggered, true);
    assert.strictEqual(data.lifeLost, false);
    console.log('✓ Emergency Access trap triggers warning without deducting lives (zero penalties)');

    // Test 4: Puzzle 2 Transfer & Direct Code (NO Caesar Cipher)
    console.log('\n--- Test 4: Puzzle 2 Transfers & Direct Code ---');
    res = await fetch(`${baseUrl}/puzzle2/transfer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fromAccount: '1001', toAccount: 'IVB-OFFSHORE-1', amount: '1000' })
    });
    data = await res.json();
    assert.strictEqual(data.success, true);
    assert.strictEqual(data.authCode, 'IVB-LEVEL2-5K8');
    console.log('✓ Wire transfer directly returns plaintext code IVB-LEVEL2-5K8 (No Caesar cipher)');

    // Puzzle 2 trap unlock button (Zero penalties)
    res = await fetch(`${baseUrl}/puzzle2/trap-unlock`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });
    data = await res.json();
    assert.strictEqual(data.trapTriggered, true);
    assert.strictEqual(data.lifeLost, false);
    console.log('✓ Puzzle 2 trap button triggers warning without deducting lives');

    // Test 5: Puzzle 3 Balance & Direct Header (NO Base64)
    console.log('\n--- Test 5: Puzzle 3 Balance & Direct Header ---');
    const testSessionCookie = `ctf_token=hard-mode-tester-${Date.now()}`;
    res = await fetch(`${baseUrl}/balance?acct=1001`, {
      headers: { 'Cookie': testSessionCookie }
    });
    data = await res.json();
    assert.strictEqual(data.audit_code, 'FAKE-000-DECOY');
    assert.ok(res.headers.get('x-request-id'));
    assert.strictEqual(res.headers.get('x-audit-code'), null);
    console.log('✓ 1st request has decoy body, UUID header, and NO X-Audit-Code (Hard Mode cache miss)');

    // Second request in hard mode delivers DIRECT code header
    res = await fetch(`${baseUrl}/balance?acct=1001`, {
      headers: { 'Cookie': testSessionCookie }
    });
    data = await res.json();
    assert.strictEqual(res.headers.get('x-audit-code'), 'IVB-LEVEL3-3M9');
    console.log('✓ 2nd request delivers direct plaintext X-Audit-Code: IVB-LEVEL3-3M9 (No Base64)');

    // Test 6: Direct Code Submission & Solving All 3 Sectors
    console.log('\n--- Test 6: Direct Code Submission & Full Breach ---');
    const playerCookie = `ctf_token=validation-player-${Date.now()}`;

    // 6a: Decoy body code warning (Zero penalties)
    res = await fetch(`${baseUrl}/submit-code`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Cookie': playerCookie },
      body: JSON.stringify({ puzzleId: 3, code: 'FAKE-000-DECOY' })
    });
    data = await res.json();
    assert.strictEqual(data.trapTriggered, true);
    assert.strictEqual(data.lifeLost, false);
    console.log('✓ Submitting body decoy code warns without deducting lives (Zero penalties)');

    // 6b: Valid direct code submissions
    const p1Code = config.PUZZLES[1].code; // IVB-LEVEL1-7Q2
    res = await fetch(`${baseUrl}/submit-code`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Cookie': playerCookie },
      body: JSON.stringify({ puzzleId: 1, code: `  ${p1Code.toLowerCase()}  ` })
    });
    data = await res.json();
    assert.strictEqual(data.success, true);
    assert.ok(data.teachingPanel);
    console.log('✓ Puzzle 1 valid direct code succeeds (case-insensitive & trimmed)');

    const p2Code = config.PUZZLES[2].code; // IVB-LEVEL2-5K8
    res = await fetch(`${baseUrl}/submit-code`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Cookie': playerCookie },
      body: JSON.stringify({ puzzleId: 2, code: p2Code })
    });
    data = await res.json();
    assert.strictEqual(data.success, true);
    console.log('✓ Puzzle 2 valid direct code succeeds');

    const p3Code = config.PUZZLES[3].code; // IVB-LEVEL3-3M9
    res = await fetch(`${baseUrl}/submit-code`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Cookie': playerCookie },
      body: JSON.stringify({ puzzleId: 3, code: p3Code })
    });
    data = await res.json();
    assert.strictEqual(data.success, true);
    assert.strictEqual(data.state.isCompleted, true);
    assert.strictEqual(data.state.solvedCount, 3);
    console.log('✓ Puzzle 3 valid direct code succeeds -> All 3 solved -> Round complete!');

    console.log('\n🎉 ALL TESTS PASSED SUCCESSFULLY! 100% SPEC COMPLIANT.');
  } finally {
    await new Promise(resolve => server.close(resolve));
    console.log('✓ Test server closed cleanly.');
  }
}

runTests().catch(err => {
  console.error('\n❌ TEST FAILED:', err);
  process.exit(1);
});
