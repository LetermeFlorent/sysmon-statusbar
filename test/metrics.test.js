const test = require('node:test');
const assert = require('node:assert');
const m = require('../metrics');

test('cpuPercent rend null au premier echantillon', () => {
  const s = { idle: 100, total: 1000 };
  assert.strictEqual(m.cpuPercent(s, s), null);
});

test('cpuPercent calcule le complement du temps idle', () => {
  const prev = { idle: 1000, total: 2000 };
  const cur = { idle: 1400, total: 3000 };
  assert.strictEqual(m.cpuPercent(prev, cur), 60);
});

test('cpuPercent borne a zero et cent', () => {
  assert.strictEqual(m.cpuPercent({ idle: 0, total: 0 }, { idle: 500, total: 100 }), 0);
  assert.strictEqual(m.cpuPercent({ idle: 0, total: 0 }, { idle: -500, total: 100 }), 100);
});

test('cpuSample rend des compteurs cumules positifs', () => {
  const s = m.cpuSample();
  assert.ok(s.total > 0);
  assert.ok(s.idle >= 0);
  assert.ok(s.idle <= s.total);
});

test('formatGb rend deux decimales avec un point', () => {
  assert.strictEqual(m.formatGb(1073741824), '1.00');
  assert.strictEqual(m.formatGb(13262143488), '12.35');
  assert.strictEqual(m.formatGb(0), '0.00');
});

test('formatRam assemble utilise, total et unite', () => {
  assert.strictEqual(
    m.formatRam({ usedBytes: 13262143488, totalBytes: 34084860723 }),
    '12.35 / 31.74 GB'
  );
});

test('formatRam garde une largeur constante sous les 10 GB', () => {
  const petit = m.formatRam({ usedBytes: 9663676416, totalBytes: 34084860723 });
  const grand = m.formatRam({ usedBytes: 13262143488, totalBytes: 34084860723 });
  assert.strictEqual(petit.length, grand.length);
  assert.ok(petit.startsWith('9.00 / 31.74 GB'), 'la valeur doit commencer le texte');
  assert.strictEqual(petit.slice(-1), ' ');
});

test('formatPercent cale sur trois caracteres, sans tronquer 100%', () => {
  for (const v of [null, 0, 5, 34, 99]) {
    assert.strictEqual(m.formatPercent(v).length, 3, 'largeur cassee pour ' + v);
  }
  assert.strictEqual(m.formatPercent(100), '100%');
  assert.ok(m.formatPercent(null).startsWith('--'));
  assert.ok(m.formatPercent(5).startsWith('5%'));
});

test('formatPercent ne pade pas une valeur a deux chiffres', () => {
  for (const v of [10, 45, 99]) {
    assert.strictEqual(m.formatPercent(v).indexOf(' '), -1,
      'espace de trop apres ' + v + '%');
  }
  assert.strictEqual(m.formatPercent(45), '45%');
});

test('formatPercent colle la valeur au debut, remplissage en queue', () => {
  assert.strictEqual(m.formatPercent(4)[0], '4', 'un chiffre doit ouvrir le texte');
  assert.strictEqual(m.formatPercent(4).slice(-1), ' ');
  assert.strictEqual(m.formatPercent(29).slice(0, 3), '29%');
});

test('formatPercent ne met jamais plus d une chasse de remplissage', () => {
  for (const v of [null, 0, 5, 34, 99, 100]) {
    const n = (m.formatPercent(v).match(/ /g) || []).length;
    assert.ok(n <= 1, v + '% suivi de ' + n + ' chasses');
  }
});

test('formatPercent pade avec une chasse de chiffre, pas un espace ordinaire', () => {
  assert.ok(m.formatPercent(5).indexOf(' ') < 0, 'espace ordinaire trouve');
  assert.strictEqual(m.formatPercent(5).slice(-1), ' ');
});

test('padNum ne tronque jamais une valeur trop longue', () => {
  assert.strictEqual(m.padNum('123456', 4), '123456');
});

test('padNum pade en queue et non en tete', () => {
  assert.strictEqual(m.padNum('ab', 4), 'ab  ');
});

test('ramSnapshot rend un pourcentage coherent avec les octets', () => {
  const r = m.ramSnapshot();
  assert.ok(r.totalBytes > 0);
  assert.ok(r.usedBytes > 0 && r.usedBytes <= r.totalBytes);
  const expected = r.usedBytes / r.totalBytes * 100;
  assert.ok(Math.abs(r.pct - expected) < 0.001);
});

test('colorFor suit les quatre paliers', () => {
  assert.strictEqual(m.colorFor(0), '#57c85a');
  assert.strictEqual(m.colorFor(49.9), '#57c85a');
  assert.strictEqual(m.colorFor(50), '#e5c452');
  assert.strictEqual(m.colorFor(74.9), '#e5c452');
  assert.strictEqual(m.colorFor(75), '#e59b45');
  assert.strictEqual(m.colorFor(89.9), '#e59b45');
  assert.strictEqual(m.colorFor(90), '#f14c4c');
  assert.strictEqual(m.colorFor(100), '#f14c4c');
});

test('bar remplit proportionnellement et garde la largeur', () => {
  assert.strictEqual(m.bar(0, 8, 'F', 'E'), 'EEEEEEEE');
  assert.strictEqual(m.bar(100, 8, 'F', 'E'), 'FFFFFFFF');
  assert.strictEqual(m.bar(50, 8, 'F', 'E'), 'FFFFEEEE');
  assert.strictEqual(m.bar(34, 8, 'F', 'E'), 'FFFEEEEE');
});

test('bar traite une valeur absente comme zero', () => {
  assert.strictEqual(m.bar(null, 4, 'F', 'E'), 'EEEE');
  assert.strictEqual(m.bar(undefined, 4, 'F', 'E'), 'EEEE');
});

test('bar utilise le meme arrondi que claude-ratelimit-statusbar', () => {
  for (let pct = 0; pct <= 100; pct++) {
    const mine = m.bar(pct, 8, 'F', 'E');
    const filled = Math.round(pct / 100 * 8);
    assert.strictEqual(mine, 'F'.repeat(filled) + 'E'.repeat(8 - filled),
      'divergence a ' + pct + '%');
  }
});

test('clampInt borne et arrondit', () => {
  assert.strictEqual(m.clampInt(7.6, 4, 20), 8);
  assert.strictEqual(m.clampInt(1, 4, 20), 4);
  assert.strictEqual(m.clampInt(99, 4, 20), 20);
  assert.strictEqual(m.clampInt('abc', 4, 20), 4);
});

test('cpuInfo rend un modele et un nombre de coeurs', () => {
  const i = m.cpuInfo();
  assert.ok(typeof i.model === 'string' && i.model.length > 0);
  assert.ok(Number.isInteger(i.cores) && i.cores > 0);
});

test('formatAge rend des secondes puis des minutes', () => {
  assert.strictEqual(m.formatAge(0), '0 s');
  assert.strictEqual(m.formatAge(4200), '4 s');
  assert.strictEqual(m.formatAge(59000), '59 s');
  assert.strictEqual(m.formatAge(60000), '1 min');
  assert.strictEqual(m.formatAge(185000), '3 min');
});
