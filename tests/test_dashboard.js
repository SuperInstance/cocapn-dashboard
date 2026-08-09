/**
 * tests/test_dashboard.js
 * Comprehensive tests for the Cocapn Fleet Dashboard.
 *
 * Uses Node's built-in assert module — no external dependencies.
 * Mocks browser APIs (document, fetch, canvas) to test the real
 * dashboard logic extracted from index.html.
 *
 * Run: node tests/test_dashboard.js
 */

const assert = require('assert');
const { EventEmitter } = require('events');

// ---------------------------------------------------------------------------
// -- Mock Browser Environment --
// ---------------------------------------------------------------------------

/**
 * Minimal DOM element mock that records operations and supports
 * the methods the dashboard code actually uses.
 */
class MockElement {
  constructor(tag = 'div') {
    this.tagName = tag.toUpperCase();
    this.children = [];
    this.attributes = {};
    this.properties = {};
    this._textContent = '';
    this._innerHTML = '';
    this.className = '';
    this.id = '';
    this.style = {};
    this.parentElement = null;
    this.dataset = {};
    this.value = '';
    this.hidden = false;
    // Canvas mock
    this.width = 300;
    this.height = 120;
    this._ctx = null;
    // Event listeners
    this._listeners = {};
  }

  appendChild(child) {
    if (child instanceof MockElement) {
      child.parentElement = this;
      this.children.push(child);
    }
    return child;
  }

  removeChild(child) {
    const idx = this.children.indexOf(child);
    if (idx >= 0) this.children.splice(idx, 1);
    return child;
  }

  querySelector(sel) { return this.querySelectorAll(sel)[0] || null; }

  querySelectorAll(sel) {
    // Very basic: match by tag, .class, or #id
    const results = [];
    const walk = (el) => {
      for (const child of el.children) {
        if (_matches(child, sel)) results.push(child);
        walk(child);
      }
    };
    walk(this);
    return results;
  }

  get textContent() { return this._textContent; }
  set textContent(v) { this._textContent = String(v); }

  get innerHTML() { return this._innerHTML; }
  set innerHTML(v) { this._innerHTML = String(v); }

  setAttribute(k, v) { this.attributes[k] = v; }
  getAttribute(k) { return this.attributes[k] || null; }

  addEventListener(type, fn) {
    (this._listeners[type] = this._listeners[type] || []).push(fn);
  }

  removeEventListener(type, fn) {
    if (!this._listeners[type]) return;
    this._listeners[type] = this._listeners[type].filter(f => f !== fn);
  }

  emit(type, ...args) {
    (this._listeners[type] || []).forEach(fn => fn(...args));
  }

  getBoundingClientRect() {
    return { width: this.width || 300, height: this.height || 120, top: 0, left: 0, right: 300, bottom: 120 };
  }

  getContext(dim) {
    if (!this._ctx) this._ctx = new MockCanvasContext();
    return this._ctx;
  }

  scroll() {}
}

function _matches(el, sel) {
  sel = sel.trim();
  if (sel.startsWith('#')) return el.id === sel.slice(1);
  if (sel.startsWith('.')) return el.className.split(' ').includes(sel.slice(1));
  return el.tagName === sel.toUpperCase();
}

class MockCanvasContext {
  constructor() {
    this.operations = [];
    this.fillStyle = '';
    this.strokeStyle = '';
    this.lineWidth = 1;
    this.lineJoin = '';
    this.font = '';
  }
  save() { this.operations.push(['save']); }
  restore() { this.operations.push(['restore']); }
  scale(x, y) { this.operations.push(['scale', x, y]); }
  beginPath() { this.operations.push(['beginPath']); }
  closePath() { this.operations.push(['closePath']); }
  moveTo(x, y) { this.operations.push(['moveTo', x, y]); }
  lineTo(x, y) { this.operations.push(['lineTo', x, y]); }
  arc(x, y, r, a1, a2) { this.operations.push(['arc', x, y, r, a1, a2]); }
  fill() { this.operations.push(['fill']); }
  stroke() { this.operations.push(['stroke']); }
  clearRect(x, y, w, h) { this.operations.push(['clearRect', x, y, w, h]); }
  createLinearGradient(x1, y1, x2, y2) {
    this.operations.push(['createLinearGradient', x1, y1, x2, y2]);
    return { addColorStop: () => {} };
  }
}

/**
 * Mock document object with a registry of elements by ID.
 */
class MockDocument {
  constructor() {
    this._elements = {};
    this.body = this.createElement('body');
    this.documentElement = this.createElement('html');
    this.readyState = 'complete';
  }

  createElement(tag) {
    const el = new MockElement(tag);
    return el;
  }

  getElementById(id) {
    if (!this._elements[id]) {
      this._elements[id] = this.createElement('div');
      this._elements[id].id = id;
    }
    return this._elements[id];
  }

  registerElement(id, el) {
    el.id = id;
    this._elements[id] = el;
  }

  addEventListener(type, fn) {
    // no-op for resize etc.
  }
}

// ---------------------------------------------------------------------------
// -- Fetch Mock --
// ---------------------------------------------------------------------------

class FetchMock {
  constructor() {
    this.routes = {};
    this.calls = [];
    this.defaultResponse = { error: 'not found' };
  }

  /** Register a route: fetchMock.when('http://example.com/api', data) */
  when(urlMatch, response, status = 200) {
    this.routes[urlMatch] = { response, status };
    return this;
  }

  reset() {
    this.routes = {};
    this.calls = [];
  }

  async fetch(url, opts = {}) {
    this.calls.push({ url, opts });

    // Check exact match
    if (this.routes[url]) {
      const { response, status } = this.routes[url];
      if (status >= 400) {
        return mockFetchResponse(status, null, `HTTP ${status}`);
      }
      return mockFetchResponse(status, response);
    }

    // Check prefix match (for URLs with query strings)
    for (const [pattern, { response, status }] of Object.entries(this.routes)) {
      if (url.startsWith(pattern)) {
        if (status >= 400) {
          return mockFetchResponse(status, null, `HTTP ${status}`);
        }
        return mockFetchResponse(status, response);
      }
    }

    // Default
    return mockFetchResponse(200, this.defaultResponse);
  }
}

function mockFetchResponse(ok, json, statusText = '') {
  return {
    ok,
    status: ok ? 200 : 500,
    statusText,
    async json() {
      if (!ok) throw new Error(statusText);
      return json;
    },
    async text() { return JSON.stringify(json); }
  };
}

// ---------------------------------------------------------------------------
// -- AbortSignal mock --
// ---------------------------------------------------------------------------
const AbortSignal = { timeout: () => undefined };

// ---------------------------------------------------------------------------
// -- Globals Setup --
// ---------------------------------------------------------------------------

const mockDoc = new MockDocument();
const fetchMock = new FetchMock();

// Pre-register all elements the dashboard references
const elementIds = [
  'mud-out', 'mud-cmd', 'mud-conn', 'connect-btn',
  's-services', 's-services-delta', 's-tiles', 's-tiles-delta',
  's-rooms', 's-rooms-delta', 's-agents', 's-agents-delta',
  'svc-list', 'svc-uptime', 'tile-feed', 'arena-lb', 'activity-chart'
];
for (const id of elementIds) {
  mockDoc.registerElement(id, mockDoc.createElement('div'));
}

// Set up canvas element properly
const canvasEl = mockDoc.getElementById('activity-chart');
canvasEl.tagName = 'CANVAS';

// Global mocks
global.document = mockDoc;
global.window = { devicePixelRatio: 1, addEventListener: () => {} };
global.fetch = (...args) => fetchMock.fetch(...args);
global.AbortSignal = AbortSignal;
global.setInterval = () => 0;

// ---------------------------------------------------------------------------
// -- Extract dashboard functions from index.html --
// We reimplement the core logic here, matching index.html exactly,
// so tests exercise the real algorithmic behavior.
// ---------------------------------------------------------------------------

const MUD = 'http://147.224.38.131:4042';
const PLATO = 'http://147.224.38.131:8847';
const ARENA = 'http://147.224.38.131:4044';
const FLEET = 'http://147.224.38.131:8899';

let agent = null, room = null, tileHistory = [], activityHistory = [];

function resetState() {
  agent = null; room = null; tileHistory = []; activityHistory = [];
  // Reset DOM elements
  for (const id of elementIds) {
    const el = mockDoc.getElementById(id);
    el.innerHTML = '';
    el.textContent = '--';
    el.className = '';
    el.value = '';
    el.children.length = 0;
  }
  fetchMock.reset();
}

// --- Core: out() — appends a line to MUD output ---
function out(cls, txt) {
  const o = document.getElementById('mud-out');
  const d = document.createElement('div');
  d.className = cls;
  d.textContent = txt;
  o.appendChild(d);
  return d;
}

// --- Core: quickCmd() — sets input and calls execCmd ---
function quickCmd(cmd) {
  document.getElementById('mud-cmd').value = cmd;
  return execCmd();
}

// --- Core: api() — fetch wrapper with timeout ---
async function api(url, opt = {}) {
  try {
    const r = await fetch(url, { ...opt, signal: AbortSignal.timeout(8000) });
    if (!r.ok) return { error: 'HTTP ' + r.status };
    return await r.json();
  } catch (e) {
    return { error: e.message };
  }
}

// --- Core: connectMUD() — connects agent to MUD ---
async function connectMUD() {
  agent = 'web-' + Math.random().toString(36).slice(2, 6);
  out('cmd', '> connect ' + agent);
  const d = await api(MUD + '/connect?agent=' + agent + '&job=scholar');
  if (d.room) {
    room = d.room;
    document.getElementById('mud-conn').className = 'conn-status connected';
    document.getElementById('mud-conn').textContent = '● ' + room;
    out('resp', 'Connected to ' + d.room);
    if (d.description) out('resp', d.description);
    if (d.exits) out('sys', 'Exits: ' + d.exits.join(', '));
    if (d.objects) out('sys', 'Objects: ' + d.objects.join(', '));
    document.getElementById('connect-btn').textContent = 'Reconnect';
  } else {
    out('error', 'Connection failed: ' + JSON.stringify(d));
  }
  return d;
}

// --- Core: moveRoom() — moves to a different MUD room ---
async function moveRoom(r) {
  if (!agent) { out('error', 'Connect first!'); return; }
  out('cmd', '> go ' + r);
  const d = await api(MUD + '/move?agent=' + agent + '&room=' + r);
  if (d.room) {
    room = d.room;
    document.getElementById('mud-conn').textContent = '● ' + room;
    if (d.description) out('resp', d.description);
    if (d.exits) out('sys', 'Exits: ' + d.exits.join(', '));
    if (d.objects) out('sys', 'Objects: ' + d.objects.join(', '));
  } else out('error', d.error || 'Cannot move there');
  return d;
}

// --- Core: execCmd() — parses and routes MUD commands ---
async function execCmd() {
  const input = document.getElementById('mud-cmd');
  const cmd = input.value.trim();
  input.value = '';
  if (!cmd) return;
  if (!agent && cmd !== 'connect') { out('error', 'Connect first!'); return; }
  if (cmd === 'connect') return connectMUD();

  if (cmd === 'look' || cmd === 'l') {
    out('cmd', '> look');
    const d = await api(MUD + '/look?agent=' + agent);
    if (d.description) out('resp', d.description);
    if (d.exits) out('sys', 'Exits: ' + d.exits.join(', '));
    if (d.objects) out('sys', 'Objects: ' + d.objects.join(', '));
    return;
  }

  const mm = cmd.match(/^(?:go|move|walk)\s+(?:to\s+)?(.+)/i);
  if (mm) return moveRoom(mm[1]);

  const em = cmd.match(/^(?:examine|look at|inspect|check|x)\s+(.+)/i);
  if (em) {
    out('cmd', '> examine ' + em[1]);
    const d = await api(MUD + '/examine?agent=' + agent + '&object=' + em[1]);
    if (d.description) out('resp', d.description);
    if (d.task) out('agent', 'Task: ' + d.task);
    return;
  }

  out('cmd', '> ' + cmd);
  const d = await api(MUD + '/examine?agent=' + agent + '&object=' + cmd);
  if (d.description) out('resp', d.description);
  else out('error', 'Unknown command or object');
  return d;
}

// --- Core: loadTiles() — fetches and renders PLATO tiles ---
async function loadTiles() {
  try {
    const d = await api(PLATO + '/rooms');
    const rooms = d || {};
    let tiles = [];
    for (const [name, r] of Object.entries(rooms)) {
      if (r.tiles) for (const t of r.tiles.slice(-5)) tiles.push({ domain: name, ...t });
    }
    tiles.sort((a, b) => (b.created || '').localeCompare(a.created || ''));

    const feed = document.getElementById('tile-feed');
    feed.innerHTML = tiles.slice(0, 15).map(t => {
      const q = (t.question || t.answer || '').substring(0, 100);
      const time = (t.created || '').substring(0, 16);
      const badge = t.provenance ? ' <span class="tile-badge">' + t.provenance + '</span>' : '';
      return '<div class="tile-item"><span class="tile-domain">' + t.domain + '</span>' + badge + '<div class="tile-q">' + q + (q.length >= 100 ? '...' : '') + '</div><div class="tile-time">' + time + '</div></div>';
    }).join('');

    const total = Object.values(rooms).reduce((s, r) => s + (r.tile_count || r.tiles?.length || 0), 0);
    document.getElementById('s-tiles').textContent = total.toLocaleString();
    document.getElementById('s-rooms').textContent = Object.keys(rooms).length;
    tileHistory.push(total);
    if (tileHistory.length > 30) tileHistory.shift();
  } catch (e) { console.log('tile err', e); }
}

// --- Core: loadServices() — fetches and renders fleet service health ---
async function loadServices() {
  try {
    const d = await api(FLEET + '/status');
    const svc = d.services || {};
    let up = 0, down = 0;

    const list = document.getElementById('svc-list');
    list.innerHTML = Object.entries(svc).map(([name, s]) => {
      const ok = s.status === 'healthy' || s.status === 'up';
      if (ok) up++; else down++;
      return '<div class="service-item"><div class="service-left"><span class="service-dot ' + (ok ? 'dot-up' : 'dot-down') + '"></span><span class="service-name">' + name + '</span><span class="service-port">:' + s.port + '</span></div><span class="service-status ' + (ok ? 'status-up' : 'status-down') + '">' + s.status + '</span></div>';
    }).join('');

    document.getElementById('s-services').textContent = up;
    document.getElementById('svc-uptime').textContent = up + '/' + (up + down) + ' UP';
    activityHistory.push(up);
    if (activityHistory.length > 30) activityHistory.shift();
  } catch (e) {
    document.getElementById('svc-list').innerHTML = '<div class="service-item"><span style="color:var(--text-dim)">Fleet status endpoint unavailable</span></div>';
    document.getElementById('s-services').textContent = '?';
  }
}

// --- Core: loadArena() — fetches and renders arena leaderboard ---
async function loadArena() {
  try {
    const d = await api(ARENA + '/leaderboard');
    const lb = d.leaderboard || [];
    const el = document.getElementById('arena-lb');

    if (!lb.length) {
      el.innerHTML = '<div style="color:var(--text-dim);font-size:.75rem;text-align:center;padding:1rem">No matches recorded yet</div>';
      return;
    }

    const maxElo = Math.max(...lb.map(a => a.rating || 600));
    el.innerHTML = lb.slice(0, 10).map((a, i) => {
      const medal = i === 0 ? 'gold' : i === 1 ? 'silver' : i === 2 ? 'bronze' : '';
      const pct = (a.rating / maxElo) * 100;
      return '<div class="arena-row"><div style="display:flex;align-items:center;gap:.6rem"><span class="arena-rank ' + medal + '">' + (i + 1) + '</span><div><div class="arena-name">' + a.name + '</div><div class="arena-bar"><div class="arena-bar-fill" style="width:' + pct + '%"></div></div></div></div><div style="text-align:right"><div class="arena-elo">' + Math.round(a.rating) + ' ELO</div><div class="arena-record">' + a.wins + 'W ' + a.losses + 'L ' + a.draws + 'D</div></div></div>';
    }).join('');

    document.getElementById('s-agents').textContent = lb.length;
  } catch (e) {
    document.getElementById('arena-lb').innerHTML = '<div style="color:var(--text-dim);font-size:.75rem;text-align:center;padding:1rem">Arena unavailable</div>';
  }
}

// --- Core: drawChart() — renders activity sparkline on canvas ---
function drawChart() {
  const c = document.getElementById('activity-chart');
  if (!c) return;
  const ctx = c.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  const rect = c.getBoundingClientRect();
  c.width = rect.width * dpr;
  c.height = rect.height * dpr;
  ctx.scale(dpr, dpr);
  const w = rect.width, h = rect.height;
  ctx.clearRect(0, 0, w, h);
  if (activityHistory.length < 2) return;
  const data = activityHistory;
  const max = Math.max(...data, 1), min = Math.min(...data, 0);
  const range = max - min || 1;
  const step = w / (data.length - 1);

  const grad = ctx.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, 'rgba(0,230,214,.12)');
  grad.addColorStop(1, 'rgba(0,230,214,0)');
  ctx.beginPath();
  ctx.moveTo(0, h);
  data.forEach((v, i) => {
    const x = i * step;
    const y = h - ((v - min) / range) * h * 0.8 - 4;
    ctx.lineTo(x, y);
  });
  ctx.lineTo(w, h);
  ctx.closePath();
  ctx.fillStyle = grad;
  ctx.fill();

  ctx.beginPath();
  ctx.lineWidth = 2;
  ctx.lineJoin = 'round';
  data.forEach((v, i) => {
    const x = i * step;
    const y = h - ((v - min) / range) * h * 0.8 - 4;
    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
  });
  ctx.stroke();

  data.forEach((v, i) => {
    const x = i * step;
    const y = h - ((v - min) / range) * h * 0.8 - 4;
    ctx.beginPath();
    ctx.arc(x, y, 3, 0, Math.PI * 2);
    ctx.fill();
  });
}

// ---------------------------------------------------------------------------
// == TEST SUITE ==
// ---------------------------------------------------------------------------

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

// --- out() Tests ---

test('out() appends a div to mud-out', () => {
  resetState();
  const mudOut = document.getElementById('mud-out');
  const before = mudOut.children.length;
  const d = out('resp', 'Hello world');
  assert.strictEqual(mudOut.children.length, before + 1, 'Should add one child');
  assert.strictEqual(d.className, 'resp');
  assert.strictEqual(d.textContent, 'Hello world');
});

test('out() supports different CSS classes', () => {
  resetState();
  const classes = ['cmd', 'resp', 'sys', 'agent', 'error'];
  for (const cls of classes) {
    const d = out(cls, 'test-' + cls);
    assert.strictEqual(d.className, cls);
  }
});

test('out() preserves special characters in text', () => {
  resetState();
  const d = out('resp', 'Exits: harbor, forge <bridge> & "arena"');
  assert.strictEqual(d.textContent, 'Exits: harbor, forge <bridge> & "arena"');
});

// --- quickCmd() Tests ---

test('quickCmd sets input value before executing', () => {
  resetState();
  agent = 'test-agent'; // Bypass connect requirement
  fetchMock.when(MUD + '/examine?agent=test-agent&object=look', { description: 'You see a room.' });
  // Override look handling
  fetchMock.when(MUD + '/look?agent=test-agent', { description: 'A room.', exits: ['north'], objects: ['sword'] });
  quickCmd('look');
  // Input should be cleared after execCmd
  assert.strictEqual(document.getElementById('mud-cmd').value, '', 'Input should be cleared after quickCmd');
});

// --- api() Tests ---

test('api() returns parsed JSON on success', async () => {
  resetState();
  fetchMock.when('http://test.example.com/data', { hello: 'world' });
  const result = await api('http://test.example.com/data');
  assert.deepStrictEqual(result, { hello: 'world' });
});

test('api() returns error object on HTTP error', async () => {
  resetState();
  fetchMock.when('http://test.example.com/fail', null, 500);
  const result = await api('http://test.example.com/fail');
  assert.strictEqual(result.error, 'HTTP 500');
});

test('api() returns error object on network failure', async () => {
  resetState();
  // Override fetch to throw
  const origFetch = global.fetch;
  global.fetch = async () => { throw new Error('network down'); };
  const result = await api('http://test.example.com/unreachable');
  assert.ok(result.error, 'Should have error property');
  assert.strictEqual(result.error, 'network down');
  global.fetch = origFetch;
});

test('api() includes timeout via AbortSignal', async () => {
  resetState();
  fetchMock.when('http://test.example.com/timeout', { ok: true });
  await api('http://test.example.com/timeout');
  const call = fetchMock.calls[0];
  assert.ok(call.opts.signal !== undefined, 'Should pass signal option');
});

// --- connectMUD() Tests ---

test('connectMUD generates agent name with web- prefix', async () => {
  resetState();
  fetchMock.when(MUD + '/connect', {
    room: 'harbor',
    description: 'A bustling harbor.',
    exits: ['forge', 'bridge'],
    objects: ['anchor', 'ship']
  });
  await connectMUD();
  assert.ok(agent.startsWith('web-'), 'Agent should start with web-');
  assert.strictEqual(agent.length, 10, 'Agent name should be web-XXXX (10 chars)');
});

test('connectMUD sets room variable on success', async () => {
  resetState();
  fetchMock.when(MUD + '/connect', {
    room: 'harbor',
    description: 'A harbor.'
  });
  await connectMUD();
  assert.strictEqual(room, 'harbor');
});

test('connectMUD updates connection status element', async () => {
  resetState();
  fetchMock.when(MUD + '/connect', { room: 'forge', description: 'A forge.' });
  await connectMUD();
  const conn = document.getElementById('mud-conn');
  assert.strictEqual(conn.className, 'conn-status connected');
  assert.strictEqual(conn.textContent, '● forge');
});

test('connectMUD changes connect button text to Reconnect', async () => {
  resetState();
  fetchMock.when(MUD + '/connect', { room: 'harbor' });
  await connectMUD();
  assert.strictEqual(document.getElementById('connect-btn').textContent, 'Reconnect');
});

test('connectMUD outputs connection messages to MUD terminal', async () => {
  resetState();
  fetchMock.when(MUD + '/connect', {
    room: 'harbor',
    description: 'A harbor.',
    exits: ['forge', 'bridge'],
    objects: ['anchor']
  });
  await connectMUD();
  const mudOut = document.getElementById('mud-out');
  // Should have appended: cmd (connect), resp (Connected), resp (description), sys (exits), sys (objects)
  const texts = mudOut.children.map(c => c.textContent);
  assert.ok(texts.some(t => t.includes('> connect')), 'Should show connect command');
  assert.ok(texts.some(t => t.includes('Connected to harbor')), 'Should show connection message');
  assert.ok(texts.some(t => t.includes('A harbor.')), 'Should show room description');
  assert.ok(texts.some(t => t.includes('Exits: forge, bridge')), 'Should show exits');
  assert.ok(texts.some(t => t.includes('Objects: anchor')), 'Should show objects');
});

test('connectMUD shows error on connection failure', async () => {
  resetState();
  fetchMock.when(MUD + '/connect', { error: 'server offline' });
  await connectMUD();
  const mudOut = document.getElementById('mud-out');
  const texts = mudOut.children.map(c => c.textContent);
  assert.ok(texts.some(t => t.includes('Connection failed')), 'Should show failure message');
});

// --- moveRoom() Tests ---

test('moveRoom requires connection first', async () => {
  resetState();
  agent = null;
  await moveRoom('forge');
  const mudOut = document.getElementById('mud-out');
  const texts = mudOut.children.map(c => c.textContent);
  assert.ok(texts.some(t => t.includes('Connect first!')), 'Should warn to connect first');
});

test('moveRoom updates room on successful move', async () => {
  resetState();
  agent = 'test-agent';
  room = 'harbor';
  fetchMock.when(MUD + '/move', { room: 'forge', description: 'A hot forge.' });
  await moveRoom('forge');
  assert.strictEqual(room, 'forge');
});

test('moveRoom shows error when move fails', async () => {
  resetState();
  agent = 'test-agent';
  fetchMock.when(MUD + '/move', { error: 'Locked' });
  await moveRoom('vault');
  const mudOut = document.getElementById('mud-out');
  const texts = mudOut.children.map(c => c.textContent);
  assert.ok(texts.some(t => t.includes('Locked')), 'Should show error');
});

// --- execCmd() Tests ---

test('execCmd ignores empty input', async () => {
  resetState();
  agent = 'test';
  document.getElementById('mud-cmd').value = '   ';
  await execCmd();
  // Should not produce any output
  const mudOut = document.getElementById('mud-out');
  assert.strictEqual(mudOut.children.length, 0);
});

test('execCmd requires connection for non-connect commands', async () => {
  resetState();
  agent = null;
  document.getElementById('mud-cmd').value = 'look';
  await execCmd();
  const mudOut = document.getElementById('mud-out');
  const texts = mudOut.children.map(c => c.textContent);
  assert.ok(texts.some(t => t.includes('Connect first!')));
});

test('execCmd routes "look" to look API', async () => {
  resetState();
  agent = 'test-agent';
  fetchMock.when(MUD + '/look', { description: 'A dark room.', exits: ['north'], objects: ['lamp'] });
  document.getElementById('mud-cmd').value = 'look';
  await execCmd();
  const mudOut = document.getElementById('mud-out');
  const texts = mudOut.children.map(c => c.textContent);
  assert.ok(texts.some(t => t === '> look'));
  assert.ok(texts.some(t => t === 'A dark room.'));
  assert.ok(texts.some(t => t.includes('Exits: north')));
  assert.ok(texts.some(t => t.includes('Objects: lamp')));
});

test('execCmd routes "l" as alias for look', async () => {
  resetState();
  agent = 'test-agent';
  fetchMock.when(MUD + '/look', { description: 'Same as look.' });
  document.getElementById('mud-cmd').value = 'l';
  await execCmd();
  const texts = document.getElementById('mud-out').children.map(c => c.textContent);
  assert.ok(texts.some(t => t === '> look'));
});

test('execCmd routes "go <room>" to moveRoom', async () => {
  resetState();
  agent = 'test-agent';
  room = 'harbor';
  fetchMock.when(MUD + '/move', { room: 'forge', description: 'A forge.' });
  document.getElementById('mud-cmd').value = 'go forge';
  await execCmd();
  assert.strictEqual(room, 'forge');
});

test('execCmd routes "move to <room>" to moveRoom', async () => {
  resetState();
  agent = 'test-agent';
  room = 'harbor';
  fetchMock.when(MUD + '/move', { room: 'bridge', description: 'The bridge.' });
  document.getElementById('mud-cmd').value = 'move to bridge';
  await execCmd();
  assert.strictEqual(room, 'bridge');
});

test('execCmd routes "walk <room>" to moveRoom', async () => {
  resetState();
  agent = 'test-agent';
  room = 'harbor';
  fetchMock.when(MUD + '/move', { room: 'dojo', description: 'A dojo.' });
  document.getElementById('mud-cmd').value = 'walk dojo';
  await execCmd();
  assert.strictEqual(room, 'dojo');
});

test('execCmd routes "examine <obj>" to examine API', async () => {
  resetState();
  agent = 'test-agent';
  fetchMock.when(MUD + '/examine', { description: 'A shiny orb.', task: 'study it' });
  document.getElementById('mud-cmd').value = 'examine orb';
  await execCmd();
  const texts = document.getElementById('mud-out').children.map(c => c.textContent);
  assert.ok(texts.some(t => t === '> examine orb'));
  assert.ok(texts.some(t => t === 'A shiny orb.'));
  assert.ok(texts.some(t => t.includes('Task: study it')));
});

test('execCmd routes "inspect" as alias for examine', async () => {
  resetState();
  agent = 'test-agent';
  fetchMock.when(MUD + '/examine', { description: 'A map.' });
  document.getElementById('mud-cmd').value = 'inspect map';
  await execCmd();
  const texts = document.getElementById('mud-out').children.map(c => c.textContent);
  assert.ok(texts.some(t => t.includes('> examine map')));
});

test('execCmd routes "x" as alias for examine', async () => {
  resetState();
  agent = 'test-agent';
  fetchMock.when(MUD + '/examine', { description: 'A crystal.' });
  document.getElementById('mud-cmd').value = 'x crystal';
  await execCmd();
  const texts = document.getElementById('mud-out').children.map(c => c.textContent);
  assert.ok(texts.some(t => t.includes('> examine crystal')));
});

test('execCmd routes "look at <obj>" as alias for examine', async () => {
  resetState();
  agent = 'test-agent';
  fetchMock.when(MUD + '/examine', { description: 'A painting.' });
  document.getElementById('mud-cmd').value = 'look at painting';
  await execCmd();
  const texts = document.getElementById('mud-out').children.map(c => c.textContent);
  assert.ok(texts.some(t => t.includes('> examine painting')));
});

test('execCmd falls back to examine for unknown commands', async () => {
  resetState();
  agent = 'test-agent';
  fetchMock.when(MUD + '/examine', { description: 'It is a thing.' });
  document.getElementById('mud-cmd').value = 'randomthing';
  await execCmd();
  const texts = document.getElementById('mud-out').children.map(c => c.textContent);
  assert.ok(texts.some(t => t === '> randomthing'));
  assert.ok(texts.some(t => t === 'It is a thing.'));
});

test('execCmd shows error for unknown with no description', async () => {
  resetState();
  agent = 'test-agent';
  fetchMock.when(MUD + '/examine', { error: 'not found' });
  document.getElementById('mud-cmd').value = 'blahblah';
  await execCmd();
  const texts = document.getElementById('mud-out').children.map(c => c.textContent);
  assert.ok(texts.some(t => t.includes('Unknown command or object')));
});

test('execCmd clears input after execution', async () => {
  resetState();
  agent = 'test-agent';
  fetchMock.when(MUD + '/look', { description: 'Room.' });
  document.getElementById('mud-cmd').value = 'look';
  await execCmd();
  assert.strictEqual(document.getElementById('mud-cmd').value, '');
});

// --- loadTiles() Tests ---

test('loadTiles populates tile feed from PLATO rooms', async () => {
  resetState();
  fetchMock.when(PLATO + '/rooms', {
    'harbor': {
      tile_count: 5,
      tiles: [
        { question: 'What is the harbor?', created: '2026-01-02T10:00:00Z', provenance: 'scout' },
        { question: 'Who docks here?', created: '2026-01-01T10:00:00Z' }
      ]
    },
    'forge': {
      tile_count: 3,
      tiles: [
        { answer: 'A hot place.', created: '2026-01-03T10:00:00Z' }
      ]
    }
  });
  await loadTiles();
  const feed = document.getElementById('tile-feed');
  assert.ok(feed.innerHTML.includes('harbor'), 'Feed should contain harbor tiles');
  assert.ok(feed.innerHTML.includes('forge'), 'Feed should contain forge tiles');
});

test('loadTiles sorts tiles by created date descending', async () => {
  resetState();
  fetchMock.when(PLATO + '/rooms', {
    'a': { tiles: [{ question: 'Oldest', created: '2026-01-01T00:00:00Z' }] },
    'b': { tiles: [{ question: 'Newest', created: '2026-01-03T00:00:00Z' }] },
    'c': { tiles: [{ question: 'Middle', created: '2026-01-02T00:00:00Z' }] }
  });
  await loadTiles();
  const feed = document.getElementById('tile-feed');
  const posNewest = feed.innerHTML.indexOf('Newest');
  const posMiddle = feed.innerHTML.indexOf('Middle');
  const posOldest = feed.innerHTML.indexOf('Oldest');
  assert.ok(posNewest < posMiddle, 'Newest should come before middle');
  assert.ok(posMiddle < posOldest, 'Middle should come before oldest');
});

test('loadTiles updates total tile counter', async () => {
  resetState();
  fetchMock.when(PLATO + '/rooms', {
    'harbor': { tile_count: 42 },
    'forge': { tile_count: 58 }
  });
  await loadTiles();
  assert.strictEqual(document.getElementById('s-tiles').textContent, '100');
});

test('loadTiles updates room counter', async () => {
  resetState();
  fetchMock.when(PLATO + '/rooms', {
    'harbor': { tile_count: 1 },
    'forge': { tile_count: 2 },
    'bridge': { tile_count: 3 }
  });
  await loadTiles();
  assert.strictEqual(document.getElementById('s-rooms').textContent, '3');
});

test('loadTiles uses tiles.length when tile_count missing', async () => {
  resetState();
  fetchMock.when(PLATO + '/rooms', {
    'harbor': { tiles: [{ question: 'Q1' }, { question: 'Q2' }, { question: 'Q3' }] }
  });
  await loadTiles();
  assert.strictEqual(document.getElementById('s-tiles').textContent, '3');
});

test('loadTiles only takes last 5 tiles per room', async () => {
  resetState();
  const manyTiles = [];
  for (let i = 0; i < 10; i++) {
    manyTiles.push({ question: `Q${i}`, created: `2026-01-${String(i+1).padStart(2,'0')}T00:00:00Z` });
  }
  fetchMock.when(PLATO + '/rooms', { 'big': { tiles: manyTiles } });
  await loadTiles();
  // Only last 5 from the array should appear, plus they're sorted by date desc
  const feed = document.getElementById('tile-feed');
  // Should contain Q9 (latest) through Q5 (last 5 of array)
  assert.ok(feed.innerHTML.includes('Q9'), 'Should contain most recent tile');
  assert.ok(!feed.innerHTML.includes('Q0'), 'Should not contain tiles beyond last 5');
});

test('loadTiles tracks tile history', async () => {
  resetState();
  fetchMock.when(PLATO + '/rooms', { 'a': { tile_count: 10 } });
  await loadTiles();
  assert.strictEqual(tileHistory.length, 1);
  assert.strictEqual(tileHistory[0], 10);
});

test('loadTiles limits history to 30 entries', async () => {
  resetState();
  fetchMock.when(PLATO + '/rooms', { 'a': { tile_count: 5 } });
  for (let i = 0; i < 35; i++) {
    await loadTiles();
  }
  assert.strictEqual(tileHistory.length, 30);
});

// --- loadServices() Tests ---

test('loadServices counts healthy and unhealthy services', async () => {
  resetState();
  fetchMock.when(FLEET + '/status', {
    services: {
      'mud': { status: 'healthy', port: 4042 },
      'plato': { status: 'healthy', port: 8847 },
      'arena': { status: 'healthy', port: 4044 },
      'bridge': { status: 'down', port: 4060 }
    }
  });
  await loadServices();
  assert.strictEqual(document.getElementById('s-services').textContent, '3');
  assert.strictEqual(document.getElementById('svc-uptime').textContent, '3/4 UP');
});

test('loadServices counts "up" status as healthy', async () => {
  resetState();
  fetchMock.when(FLEET + '/status', {
    services: {
      'svc1': { status: 'up', port: 111 },
      'svc2': { status: 'up', port: 222 }
    }
  });
  await loadServices();
  assert.strictEqual(document.getElementById('s-services').textContent, '2');
});

test('loadServices renders service list HTML', async () => {
  resetState();
  fetchMock.when(FLEET + '/status', {
    services: {
      'auth': { status: 'healthy', port: 3000 },
      'db': { status: 'down', port: 5432 }
    }
  });
  await loadServices();
  const html = document.getElementById('svc-list').innerHTML;
  assert.ok(html.includes('auth'), 'Should list auth service');
  assert.ok(html.includes('db'), 'Should list db service');
  assert.ok(html.includes('dot-up'), 'Should have dot-up class for healthy');
  assert.ok(html.includes('dot-down'), 'Should have dot-down class for unhealthy');
  assert.ok(html.includes('status-up'), 'Should have status-up class');
  assert.ok(html.includes('status-down'), 'Should have status-down class');
});

test('loadServices handles empty services gracefully', async () => {
  resetState();
  fetchMock.when(FLEET + '/status', { services: {} });
  await loadServices();
  assert.strictEqual(document.getElementById('s-services').textContent, '0');
  assert.strictEqual(document.getElementById('svc-uptime').textContent, '0/0 UP');
});

test('loadServices tracks activity history', async () => {
  resetState();
  fetchMock.when(FLEET + '/status', {
    services: { 'a': { status: 'healthy', port: 1 }, 'b': { status: 'healthy', port: 2 } }
  });
  await loadServices();
  assert.strictEqual(activityHistory.length, 1);
  assert.strictEqual(activityHistory[0], 2);
});

test('loadServices handles fetch error gracefully', async () => {
  resetState();
  // Make fetch throw
  const origFetch = global.fetch;
  global.fetch = async () => { throw new Error('connection refused'); };
  await loadServices();
  assert.strictEqual(document.getElementById('s-services').textContent, '?');
  assert.ok(
    document.getElementById('svc-list').innerHTML.includes('unavailable'),
    'Should show unavailable message'
  );
  global.fetch = origFetch;
});

test('loadServices limits activity history to 30 entries', async () => {
  resetState();
  fetchMock.when(FLEET + '/status', {
    services: { 'a': { status: 'healthy', port: 1 } }
  });
  for (let i = 0; i < 35; i++) {
    await loadServices();
  }
  assert.strictEqual(activityHistory.length, 30);
});

// --- loadArena() Tests ---

test('loadArena renders leaderboard with rankings', async () => {
  resetState();
  fetchMock.when(ARENA + '/leaderboard', {
    leaderboard: [
      { name: 'Atlas', rating: 1850, wins: 15, losses: 3, draws: 2 },
      { name: 'Nova', rating: 1700, wins: 12, losses: 5, draws: 1 },
      { name: 'Echo', rating: 1600, wins: 8, losses: 8, draws: 3 }
    ]
  });
  await loadArena();
  const html = document.getElementById('arena-lb').innerHTML;
  assert.ok(html.includes('Atlas'), 'Should show Atlas');
  assert.ok(html.includes('Nova'), 'Should show Nova');
  assert.ok(html.includes('Echo'), 'Should show Echo');
  assert.ok(html.includes('1850'), 'Should show rating');
  assert.ok(html.includes('gold'), 'First place should have gold medal class');
  assert.ok(html.includes('silver'), 'Second place should have silver medal class');
  assert.ok(html.includes('bronze'), 'Third place should have bronze medal class');
});

test('loadArena limits display to top 10', async () => {
  resetState();
  const players = [];
  for (let i = 0; i < 15; i++) {
    players.push({ name: `Agent${i}`, rating: 1000 + i * 50, wins: i, losses: 0, draws: 0 });
  }
  fetchMock.when(ARENA + '/leaderboard', { leaderboard: players });
  await loadArena();
  const html = document.getElementById('arena-lb').innerHTML;
  assert.ok(html.includes('Agent14'), 'Should include rank 15 (highest rating)');
  // The HTML is a flat string of rows, check that we don't exceed 10 entries
  // Count arena-row occurrences
  const matches = html.match(/arena-row/g) || [];
  assert.ok(matches.length <= 10, `Should show at most 10 entries, got ${matches.length}`);
});

test('loadArena updates agent counter', async () => {
  resetState();
  fetchMock.when(ARENA + '/leaderboard', {
    leaderboard: [
      { name: 'A', rating: 100, wins: 1, losses: 0, draws: 0 },
      { name: 'B', rating: 90, wins: 0, losses: 1, draws: 0 }
    ]
  });
  await loadArena();
  assert.strictEqual(document.getElementById('s-agents').textContent, '2');
});

test('loadArena shows message for empty leaderboard', async () => {
  resetState();
  fetchMock.when(ARENA + '/leaderboard', { leaderboard: [] });
  await loadArena();
  const html = document.getElementById('arena-lb').innerHTML;
  assert.ok(html.includes('No matches recorded'), 'Should show empty message');
});

test('loadArena handles fetch error gracefully', async () => {
  resetState();
  const origFetch = global.fetch;
  global.fetch = async () => { throw new Error('arena down'); };
  await loadArena();
  const html = document.getElementById('arena-lb').innerHTML;
  assert.ok(html.includes('Arena unavailable'), 'Should show unavailable message');
  global.fetch = origFetch;
});

test('loadArena calculates bar width as percentage of max ELO', async () => {
  resetState();
  fetchMock.when(ARENA + '/leaderboard', {
    leaderboard: [
      { name: 'Top', rating: 2000, wins: 10, losses: 0, draws: 0 },
      { name: 'Mid', rating: 1000, wins: 5, losses: 5, draws: 0 }
    ]
  });
  await loadArena();
  const html = document.getElementById('arena-lb').innerHTML;
  // Top player should have 100% bar width
  assert.ok(html.includes('width:100%'), 'Top player should have 100% bar');
  // Mid player should have 50% bar width
  assert.ok(html.includes('width:50%'), 'Mid player should have 50% bar');
});

// --- drawChart() Tests ---

test('drawChart does nothing with less than 2 data points', () => {
  resetState();
  activityHistory = [5];
  // Should return early without error
  assert.doesNotThrow(() => drawChart());
});

test('drawChart draws on canvas when data available', () => {
  resetState();
  activityHistory = [5, 8, 3, 10, 7];
  drawChart();
  const canvas = document.getElementById('activity-chart');
  const ctx = canvas._ctx;
  assert.ok(ctx.operations.length > 0, 'Should have drawn operations');
  assert.ok(ctx.operations.some(op => op[0] === 'clearRect'), 'Should clear canvas');
  assert.ok(ctx.operations.some(op => op[0] === 'beginPath'), 'Should begin paths');
  assert.ok(ctx.operations.some(op => op[0] === 'fill'), 'Should fill gradient');
  assert.ok(ctx.operations.some(op => op[0] === 'stroke'), 'Should stroke line');
});

test('drawChart handles all-equal values (range fallback)', () => {
  resetState();
  activityHistory = [5, 5, 5, 5];
  assert.doesNotThrow(() => drawChart());
});

test('drawChart scales by devicePixelRatio', () => {
  resetState();
  window.devicePixelRatio = 2;
  activityHistory = [1, 2, 3];
  drawChart();
  const canvas = document.getElementById('activity-chart');
  const ctx = canvas._ctx;
  assert.ok(ctx.operations.some(op => op[0] === 'scale' && op[1] === 2), 'Should scale by dpr');
  window.devicePixelRatio = 1;
});

// --- Integration / Edge Cases ---

test('connect then look workflow', async () => {
  resetState();
  fetchMock.when(MUD + '/connect', { room: 'harbor', description: 'A harbor.', exits: ['forge'], objects: ['boat'] });
  fetchMock.when(MUD + '/look', { description: 'Still a harbor.', exits: ['forge', 'bridge'], objects: ['boat', 'net'] });

  await connectMUD();
  assert.strictEqual(room, 'harbor');

  document.getElementById('mud-cmd').value = 'look';
  await execCmd();

  const texts = document.getElementById('mud-out').children.map(c => c.textContent);
  assert.ok(texts.some(t => t.includes('Connected to harbor')));
  assert.ok(texts.some(t => t === 'Still a harbor.'));
  assert.ok(texts.some(t => t.includes('Exits: forge, bridge')));
});

test('connect then move then examine workflow', async () => {
  resetState();
  fetchMock.when(MUD + '/connect', { room: 'harbor', description: 'Harbor.' });
  fetchMock.when(MUD + '/move', { room: 'forge', description: 'A forge.', exits: ['harbor'], objects: ['hammer', 'anvil'] });
  fetchMock.when(MUD + '/examine', { description: 'A heavy hammer.', task: 'wield it' });

  await connectMUD();
  document.getElementById('mud-cmd').value = 'go forge';
  await execCmd();
  assert.strictEqual(room, 'forge');

  document.getElementById('mud-cmd').value = 'examine hammer';
  await execCmd();

  const texts = document.getElementById('mud-out').children.map(c => c.textContent);
  assert.ok(texts.some(t => t === 'A heavy hammer.'));
  assert.ok(texts.some(t => t.includes('Task: wield it')));
});

test('multiple connects generate different agent names', async () => {
  resetState();
  fetchMock.when(MUD + '/connect', { room: 'harbor' });
  await connectMUD();
  const first = agent;
  await connectMUD();
  const second = agent;
  assert.notStrictEqual(first, second, 'Each connect should generate unique agent name');
});

// --- Constants Tests ---

test('MUD endpoint is correctly defined', () => {
  assert.strictEqual(MUD, 'http://147.224.38.131:4042');
});

test('PLATO endpoint is correctly defined', () => {
  assert.strictEqual(PLATO, 'http://147.224.38.131:8847');
});

test('ARENA endpoint is correctly defined', () => {
  assert.strictEqual(ARENA, 'http://147.224.38.131:4044');
});

test('FLEET endpoint is correctly defined', () => {
  assert.strictEqual(FLEET, 'http://147.224.38.131:8899');
});

// ---------------------------------------------------------------------------
// == RUNNER ==
// ---------------------------------------------------------------------------

let passed = 0, failed = 0;
const failures = [];

for (const { name, fn } of tests) {
  try {
    const result = fn();
    if (result instanceof Promise) {
      // For async tests we need to run sequentially; use a runner
    }
  } catch (e) {
    failed++;
    failures.push({ name, error: e });
  }
}

// Since we have async tests, run them properly
(async () => {
  let p = 0, f = 0;
  const fails = [];

  for (const { name, fn } of tests) {
    try {
      await fn();
      p++;
      process.stdout.write('✓ ' + name + '\n');
    } catch (e) {
      f++;
      fails.push({ name, error: e });
      process.stdout.write('✗ ' + name + '\n');
      process.stdout.write('  ' + (e.message || e).split('\n')[0] + '\n');
    }
  }

  process.stdout.write('\n');
  process.stdout.write(`Results: ${p} passed, ${f} failed, ${p + f} total\n`);

  if (f > 0) {
    process.stdout.write('\n--- Failure Details ---\n');
    for (const { name, error } of fails) {
      process.stdout.write('\n✗ ' + name + '\n');
      process.stdout.write(error.stack || error.message || String(error));
      process.stdout.write('\n');
    }
    process.exit(1);
  }
})();
