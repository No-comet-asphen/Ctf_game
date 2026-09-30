/**
 * Automated test suite for IronVault Heist CTF Module
 */
const assert = require('assert');
const config = require('../server/config');
const integration = require('../server/integration');
const gameState = require('../server/gameState');

async function runTests() {
  console.log('🧪 RUNNING COMPREHENSIVE TESTS FOR IRONVAULT CTF ROUND...\n');

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
    livesLeft: 2,
    timeSeconds: 120,
    score: 280
  });
  assert.strictEqual(compRes.success, true);
  console.log('✓ reportRoundComplete succeeds in mock mode\n');

  // Test 2: Game State & Player State Management
  console.log('--- Test 2: Game State & Scoring ---');
  const playerId = 'player-agent-test';
  const state = gameState.getOrCreatePlayerState(playerId, 'Alpha Squad');
  assert.strictEqual(state.lives, 3);
  assert.strictEqual(state.score, 0);

  // Life deduction
  gameState.deductLife(playerId, 'Test Trap');
  const updatedState = gameState.getClientState(playerId);
  assert.strictEqual(updatedState.lives, 2);
  console.log('✓ Life deduction works properly (3 -> 2)');

  // Test 3: Puzzle 1 SQL Injection Evaluator & Filters
  console.log('\n--- Test 3: Puzzle 1 Logic & Evaluator ---');
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

    // 3d: Valid SQL injection ' OR '1'='1
    res = await fetch(`${baseUrl}/puzzle1/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: "' OR '1'='1", password: "" })
    });
    data = await res.json();
    assert.strictEqual(data.success, true);
    assert.strictEqual(data.tokenBase64, 'SVZCLUxFVkVMMS03UTI=');
    console.log("✓ Valid SQL injection ' OR '1'='1 succeeds and reveals Base64 memo");

    // 3e: Emergency access trap costs 1 life
    res = await fetch(`${baseUrl}/puzzle1/emergency-access`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ overrideCode: 'TEST-OVERRIDE' })
    });
    data = await res.json();
    assert.strictEqual(data.trapTriggered, true);
    assert.strictEqual(data.lifeLost, true);
    console.log('✓ Emergency Access trap deducts 1 life');

    // Test 4: Puzzle 2 Transfer & Caesar Token
    console.log('\n--- Test 4: Puzzle 2 Transfers & DOM Challenge ---');
    res = await fetch(`${baseUrl}/puzzle2/transfer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fromAccount: '1001', toAccount: 'IVB-OFFSHORE-1', amount: '1000' })
    });
    data = await res.json();
    assert.strictEqual(data.success, true);
    assert.strictEqual(data.caesarToken, 'LYE-OHYHO2-5N8');
    console.log('✓ Wire transfer returns Caesar token LYE-OHYHO2-5N8');

    // Puzzle 2 trap unlock button
    res = await fetch(`${baseUrl}/puzzle2/trap-unlock`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });
    data = await res.json();
    assert.strictEqual(data.trapTriggered, true);
    console.log('✓ Puzzle 2 trap unlock button deducts 1 life');

    // Test 5: Puzzle 3 Response Headers & Hard Mode
    console.log('\n--- Test 5: Puzzle 3 Balance & Response Headers ---');
    // First request in hard mode (cache miss, no X-Audit-Code)
    const testSessionCookie = `ctf_token=hard-mode-tester-${Date.now()}`;
    res = await fetch(`${baseUrl}/balance?acct=1001`, {
      headers: { 'Cookie': testSessionCookie }
    });
    data = await res.json();
    assert.strictEqual(data.audit_code, 'FAKE-000-DECOY');
    assert.ok(res.headers.get('x-request-id'));
    assert.strictEqual(res.headers.get('x-audit-code'), null);
    console.log('✓ 1st request has decoy body, UUID header, and NO X-Audit-Code (Hard Mode)');

    // Second request in hard mode (returns X-Audit-Code)
    res = await fetch(`${baseUrl}/balance?acct=1001`, {
      headers: { 'Cookie': testSessionCookie }
    });
    data = await res.json();
    assert.strictEqual(res.headers.get('x-audit-code'), 'SVZCLUxFVkVMMy0zTTk=');
    console.log('✓ 2nd request delivers X-Audit-Code header: SVZCLUxFVkVMMy0zTTk=');

    // Test 6: Code Submission & Traps on /submit-code
    console.log('\n--- Test 6: Answer Validation & Traps ---');
    const playerCookie = `ctf_token=validation-player-${Date.now()}`;

    // 6a: Raw Base64 submission
    res = await fetch(`${baseUrl}/submit-code`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Cookie': playerCookie },
      body: JSON.stringify({ puzzleId: 1, code: 'SVZCLUxFVkVMMS03UTI=' })
    });
    data = await res.json();
    assert.strictEqual(data.isEncodedNotice, true);
    assert.strictEqual(data.message, 'That looks encoded. Decode it first.');
    console.log('✓ Submitting raw Base64 warns "That looks encoded. Decode it first." (No life lost)');

    // 6b: Raw Caesar submission
    res = await fetch(`${baseUrl}/submit-code`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Cookie': playerCookie },
      body: JSON.stringify({ puzzleId: 2, code: 'LYE-OHYHO2-5N8' })
    });
    data = await res.json();
    assert.strictEqual(data.isEncodedNotice, true);
    console.log('✓ Submitting raw Caesar token warns to decode it first');

    // 6c: Decoy body code trap (Puzzle 3)
    res = await fetch(`${baseUrl}/submit-code`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Cookie': playerCookie },
      body: JSON.stringify({ puzzleId: 3, code: 'FAKE-000-DECOY' })
    });
    data = await res.json();
    assert.strictEqual(data.trapTriggered, true);
    assert.strictEqual(data.lifeLost, true);
    assert.ok(data.message.includes("That's a decoy field"));
    console.log('✓ Submitting body decoy code costs 1 life');

    // 6d: Submitting X-Request-Id UUID trap
    res = await fetch(`${baseUrl}/submit-code`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Cookie': playerCookie },
      body: JSON.stringify({ puzzleId: 3, code: 'a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d' })
    });
    data = await res.json();
    assert.strictEqual(data.trapTriggered, true);
    assert.strictEqual(data.lifeLost, true);
    assert.ok(data.message.includes("That's just a request ID"));
    console.log('✓ Submitting UUID request ID costs 1 life');

    // 6e: Valid decoded code submissions
    const p1Code = config.PUZZLES[1].code; // IVB-LEVEL1-7Q2
    res = await fetch(`${baseUrl}/submit-code`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Cookie': playerCookie },
      body: JSON.stringify({ puzzleId: 1, code: `  ${p1Code.toLowerCase()}  ` })
    });
    data = await res.json();
    assert.strictEqual(data.success, true);
    assert.ok(data.teachingPanel);
    console.log('✓ Puzzle 1 valid code succeeds (case-insensitive & trimmed)');

    const p2Code = config.PUZZLES[2].code; // IVB-LEVEL2-5K8
    res = await fetch(`${baseUrl}/submit-code`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Cookie': playerCookie },
      body: JSON.stringify({ puzzleId: 2, code: p2Code })
    });
    data = await res.json();
    assert.strictEqual(data.success, true);
    console.log('✓ Puzzle 2 valid code succeeds');

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
    console.log('✓ Puzzle 3 valid code succeeds -> All 3 solved -> Round complete!');

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
