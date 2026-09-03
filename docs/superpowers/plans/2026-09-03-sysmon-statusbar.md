# System Monitor Status Bar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Une extension VS Code qui affiche en continu dans la barre d'etat la charge CPU, la charge GPU et l'occupation memoire de la machine, sous forme de barres colorees et de valeurs chiffrees, du meme cote que l'utilisateur choisit.

**Architecture:** Extension JavaScript CommonJS sans dependance ni build. La logique de calcul et de formatage vit dans `metrics.js`, un module pur qui ne require jamais `vscode` et se teste avec le lanceur integre de Node. La sonde GPU vit dans `gpu.js`, qui pilote un unique process `typeperf` en flux continu et expose la derniere valeur lue. `extension.js` ne fait que creer les items de barre d'etat, appeler ces deux modules sur un intervalle et peindre.

**Tech Stack:** Node 24 (present sur le poste), API VS Code `^1.75.0`, `node:os` pour CPU et RAM, `typeperf` de Windows pour le GPU, `node:test` pour les tests, `vsce` pour le packaging.

**Spec:** `docs/superpowers/specs/2026-09-03-sysmon-statusbar.md`

## Global Constraints

Ces regles valent pour toutes les taches sans etre repetees.

- Repertoire du projet : `C:\Users\ipmss\sysmon-statusbar`. Le fichier `bar.woff` y est deja copie depuis `claude-ratelimit-statusbar`.

**Parite visuelle des barres, contrainte non negociable.** Les barres de cette
extension doivent etre indiscernables de celles de `claude-ratelimit-statusbar`
quand les deux s'affichent cote a cote dans la meme barre d'etat. Cela impose
cinq points, aucun n'est un detail de style :

1. `bar.woff` doit rester byte-identique au fichier source. Empreinte MD5 de
   reference : `257e385aeb010e1ca0ab5f4bf981a35a`. Ne jamais regenerer, ne
   jamais sous-ensembler, ne jamais convertir cette police.
2. Les glyphes sont `\\E000` pour plein et `\\E001` pour vide, exactement comme
   dans l'extension soeur. Seuls les noms d'icones different, `sysmon-bar-full`
   et `sysmon-bar-empty` au lieu de `cs-bar-full` et `cs-bar-empty`, pour eviter
   une collision entre deux extensions actives en meme temps.
3. L'algorithme de remplissage est repris tel quel, `Math.round(p / 100 * w)`.
   Un `floor` ou un `ceil` decalerait le seuil d'une cellule et les deux barres
   ne tomberaient plus au meme endroit pour un meme pourcentage.
4. La largeur par defaut est 8 cellules, la meme que `claudeRate.barWidth`.
5. La palette est celle listee ci-dessus, aux memes seuils 50, 75 et 90, et le
   gris de mise en veille est le meme `#8a8a8a`.

Verifier cette empreinte avant de commencer :

```bash
md5sum C:/Users/ipmss/sysmon-statusbar/bar.woff
```

Expected: `257e385aeb010e1ca0ab5f4bf981a35a`. Si elle differe, recopier depuis
`C:/Users/ipmss/claude-ratelimit-statusbar/bar.woff`.
- Aucune dependance npm, aucun `node_modules`, aucune etape de build ni de transpilation. Le code livre est celui qui s'execute.
- JavaScript CommonJS uniquement : `require`, `module.exports`. Pas d'ESM, pas de TypeScript.
- `metrics.js` ne doit jamais contenir `require('vscode')`. C'est ce qui le rend testable hors de VS Code.
- `engines.vscode` vaut exactement `^1.75.0`. `extensionKind` vaut `["ui"]`. `activationEvents` vaut `["onStartupFinished"]`.
- `publisher` vaut `letermeflorent`, `license` vaut `MIT`.
- Palette de couleurs, valeurs exactes : `#57c85a` sous 50, `#e5c452` a partir de 50, `#e59b45` a partir de 75, `#f14c4c` a partir de 90, `#8a8a8a` pour indisponible ou perime.
- Aucun emoji et aucun caractere accentue dans les chaines affichees dans la barre d'etat ni dans les `description` de `package.json`.
- Separateur decimal des valeurs affichees : le point. Deux decimales pour les GB, entier pour les pourcentages.
- Prefixe des reglages et des commandes : `sysmon`.
- Chaque commit se fait avec `git -C C:/Users/ipmss/sysmon-statusbar`. Aucun trailer de co-auteur, aucune mention d'un modele ou d'un assistant dans les messages de commit.

---

### Task 1: Squelette du repo et manifeste

Le but est d'obtenir une extension installable qui affiche trois groupes avec des valeurs figees. Rien n'est mesure encore, mais la forme visuelle finale est verrouillee et verifiable a l'oeil.

**Files:**
- Create: `C:\Users\ipmss\sysmon-statusbar\package.json`
- Create: `C:\Users\ipmss\sysmon-statusbar\extension.js`
- Create: `C:\Users\ipmss\sysmon-statusbar\.gitignore`
- Create: `C:\Users\ipmss\sysmon-statusbar\.vscodeignore`
- Create: `C:\Users\ipmss\sysmon-statusbar\LICENSE`
- Existant: `C:\Users\ipmss\sysmon-statusbar\bar.woff`

**Interfaces:**
- Consumes: rien.
- Produces: les identifiants d'icones `sysmon-bar-full` et `sysmon-bar-empty`, utilises par `metrics.js` en Task 2. Les cles de reglage `sysmon.refreshSeconds`, `sysmon.barWidth`, `sysmon.alignment`, `sysmon.gpuRestartSeconds`, `sysmon.showGpu`.

- [ ] **Step 1: Ecrire le manifeste**

Creer `package.json` avec exactement ce contenu.

```json
{
	"name": "sysmon-statusbar",
	"displayName": "System Monitor Status Bar",
	"description": "Status bar display of CPU load, GPU load and system memory usage, as coloured progress bars with live values.",
	"version": "0.1.0",
	"publisher": "letermeflorent",
	"license": "MIT",
	"icon": "icon.png",
	"keywords": [
		"cpu",
		"gpu",
		"memory",
		"monitor",
		"status bar"
	],
	"engines": {
		"vscode": "^1.75.0"
	},
	"categories": [
		"Other"
	],
	"activationEvents": [
		"onStartupFinished"
	],
	"main": "./extension.js",
	"extensionKind": [
		"ui"
	],
	"contributes": {
		"commands": [
			{
				"command": "sysmon.restartGpu",
				"title": "System Monitor: Relancer la sonde GPU"
			}
		],
		"icons": {
			"sysmon-bar-full": {
				"description": "Barre pleine",
				"default": {
					"fontPath": "./bar.woff",
					"fontCharacter": "\\E000"
				}
			},
			"sysmon-bar-empty": {
				"description": "Barre vide",
				"default": {
					"fontPath": "./bar.woff",
					"fontCharacter": "\\E001"
				}
			}
		},
		"configuration": {
			"title": "System Monitor",
			"properties": {
				"sysmon.refreshSeconds": {
					"type": "number",
					"default": 2,
					"description": "Intervalle de rafraichissement de l'affichage (secondes). Minimum 1, maximum 60."
				},
				"sysmon.barWidth": {
					"type": "number",
					"default": 8,
					"description": "Largeur de chaque barre (cellules). Minimum 4, maximum 20."
				},
				"sysmon.alignment": {
					"type": "string",
					"enum": [
						"left",
						"right"
					],
					"default": "right",
					"description": "Cote de la barre d'etat ou afficher les indicateurs."
				},
				"sysmon.showGpu": {
					"type": "boolean",
					"default": true,
					"description": "Afficher le groupe GPU. Desactiver arrete aussi la sonde typeperf."
				},
				"sysmon.gpuRestartSeconds": {
					"type": "number",
					"default": 300,
					"description": "Intervalle de recyclage de la sonde GPU (secondes). typeperf fige son jeu d'instances au demarrage, le recyclage permet de voir les nouveaux process."
				}
			}
		}
	}
}
```

- [ ] **Step 2: Ecrire les fichiers d'exclusion et la licence**

`.gitignore` :

```
node_modules/
*.vsix
```

`.vscodeignore` :

```
.git/**
.gitignore
docs/**
test/**
*.vsix
```

`LICENSE` : copier tel quel depuis `C:\Users\ipmss\claude-ratelimit-statusbar\LICENSE`, puis remplacer l'annee par `2026` si elle differe. Verifier que le nom du titulaire est bien celui du fichier source, ne pas l'inventer.

```bash
cp C:/Users/ipmss/claude-ratelimit-statusbar/LICENSE C:/Users/ipmss/sysmon-statusbar/LICENSE
cat C:/Users/ipmss/sysmon-statusbar/LICENSE
```

- [ ] **Step 3: Ecrire l'extension avec des valeurs figees**

Creer `extension.js`. Les valeurs sont en dur, l'objectif est de voir la forme.

```js
const vscode = require('vscode');

const FULL = '$(sysmon-bar-full)';
const EMPTY = '$(sysmon-bar-empty)';

const it = {};

function bar(pct, w) {
  const p = Math.max(0, Math.min(100, Number(pct) || 0));
  const filled = Math.round(p / 100 * w);
  return FULL.repeat(filled) + EMPTY.repeat(w - filled);
}

function activate(context) {
  const mk = function (prio) {
    const s = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, prio);
    context.subscriptions.push(s);
    return s;
  };
  it.lc = mk(96); it.bc = mk(95); it.vc = mk(94);
  it.lg = mk(93); it.bg = mk(92); it.vg = mk(91);
  it.lr = mk(90); it.br = mk(89); it.vr = mk(88);

  it.lc.text = 'CPU'; it.bc.text = bar(34, 8); it.bc.color = '#57c85a'; it.vc.text = '34%';
  it.lg.text = 'GPU'; it.bg.text = bar(12, 8); it.bg.color = '#57c85a'; it.vg.text = '12%';
  it.lr.text = 'RAM'; it.br.text = bar(39, 8); it.br.color = '#57c85a'; it.vr.text = '12.35 / 31.74 GB';

  for (const k in it) it[k].show();
}

function deactivate() { }

module.exports = { activate, deactivate };
```

- [ ] **Step 4: Fournir l'icone**

`package.json` reference `icon.png`. Sans ce fichier, `vsce package` echoue. Copier l'icone de l'extension soeur comme provisoire, a remplacer plus tard.

```bash
cp C:/Users/ipmss/claude-ratelimit-statusbar/icon.png C:/Users/ipmss/sysmon-statusbar/icon.png
```

- [ ] **Step 5: Verifier que le manifeste est valide**

Run: `node -e "JSON.parse(require('fs').readFileSync('C:/Users/ipmss/sysmon-statusbar/package.json','utf8')); console.log('JSON OK')"`
Expected: `JSON OK`

Run: `node --check C:/Users/ipmss/sysmon-statusbar/extension.js`
Expected: aucune sortie, code de retour 0.

- [ ] **Step 6: Voir la barre en vrai**

Run: `code --extensionDevelopmentPath=C:\Users\ipmss\sysmon-statusbar --new-window`
Expected: une fenetre VS Code s'ouvre. En bas a droite, trois groupes lisibles : `CPU ▓▓▓░░░░░ 34%`, `GPU ▓░░░░░░░ 12%`, `RAM ▓▓▓░░░░░ 12.35 / 31.74 GB`, les barres en vert.

Si les barres apparaissent comme des carres vides ou des points d'interrogation, la police n'est pas chargee : verifier que `bar.woff` est bien a la racine et que les noms d'icones dans `package.json` correspondent exactement a ceux utilises dans `extension.js`.

- [ ] **Step 7: Controler la parite visuelle cote a cote**

C'est le controle qui valide la contrainte de parite des contraintes globales, et
c'est le bon moment : les valeurs sont encore figees, donc comparables a volonte.

La fenetre de developpement charge aussi les extensions deja installees, donc
`claude-ratelimit-statusbar` affiche ses propres barres dans la meme barre
d'etat, a droite. Les deux jeux de barres sont visibles simultanement.

Regarder les deux series de barres et verifier chacun de ces points :

- meme hauteur de glyphe, meme epaisseur de trait, meme dessin ;
- meme largeur de cellule, donc une barre de 8 cellules de chaque extension
  occupe exactement la meme largeur a l'ecran ;
- meme espacement entre les cellules d'une meme barre ;
- meme alignement vertical par rapport au texte voisin, aucune barre ne doit
  paraitre plus haute ou plus basse que l'autre.

Pour comparer un remplissage identique, mettre temporairement `claudeRate.barWidth`
a `8` s'il a ete change, puis comparer une barre de l'extension soeur affichant
un pourcentage proche de 34 % avec le `CPU 34%` fige de cette tache. Les deux
doivent montrer trois cellules pleines sur huit.

Si les glyphes different visuellement alors que le MD5 de `bar.woff` est bon, la
cause est ailleurs : verifier que `fontCharacter` vaut bien `\\E000` et `\\E001`
et non l'inverse, ce qui donnerait une barre en negatif.

Ne pas passer a la suite tant que ce controle n'est pas concluant. Toute la
suite du plan reutilise ces glyphes sans les rediscuter.

Fermer la fenetre de developpement avant de continuer.

- [ ] **Step 8: Initialiser le depot et committer**

```bash
git -C C:/Users/ipmss/sysmon-statusbar init
git -C C:/Users/ipmss/sysmon-statusbar add package.json extension.js .gitignore .vscodeignore LICENSE bar.woff icon.png docs
git -C C:/Users/ipmss/sysmon-statusbar commit -m "Squelette de l'extension, barre d'etat avec valeurs figees"
```

---

### Task 2: Module de mesure CPU et RAM, teste

Le calcul et le formatage sortent de `extension.js` pour devenir testables. Cette tache ne change rien a l'ecran, elle produit le module et sa couverture.

**Files:**
- Create: `C:\Users\ipmss\sysmon-statusbar\metrics.js`
- Create: `C:\Users\ipmss\sysmon-statusbar\test\metrics.test.js`

**Interfaces:**
- Consumes: les constantes de couleur des contraintes globales.
- Produces: `cpuSample()`, `cpuPercent(prev, cur)`, `ramSnapshot()`, `formatGb(bytes)`, `formatRam(snap)`, `colorFor(pct)`, `bar(pct, width, fullGlyph, emptyGlyph)`, `clampInt(v, min, max)`. Task 3 et Task 5 consomment ces noms exacts.

- [ ] **Step 1: Ecrire les tests qui echouent**

Creer `test/metrics.test.js`.

```js
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

test('clampInt borne et arrondit', () => {
  assert.strictEqual(m.clampInt(7.6, 4, 20), 8);
  assert.strictEqual(m.clampInt(1, 4, 20), 4);
  assert.strictEqual(m.clampInt(99, 4, 20), 20);
  assert.strictEqual(m.clampInt('abc', 4, 20), 4);
});
```

- [ ] **Step 2: Lancer les tests pour verifier qu'ils echouent**

Run: `node --test C:/Users/ipmss/sysmon-statusbar/test/`
Expected: echec, `Cannot find module '../metrics'`.

- [ ] **Step 3: Ecrire le module**

Creer `metrics.js`.

```js
const os = require('node:os');

const GB = 1073741824;

function clampInt(v, min, max) {
  const n = Number(v);
  if (!isFinite(n)) return min;
  return Math.max(min, Math.min(max, Math.round(n)));
}

function cpuSample() {
  let idle = 0, total = 0;
  for (const c of os.cpus()) {
    for (const k in c.times) total += c.times[k];
    idle += c.times.idle;
  }
  return { idle, total };
}

function cpuPercent(prev, cur) {
  const dt = cur.total - prev.total;
  if (dt <= 0) return null;
  const di = cur.idle - prev.idle;
  return Math.max(0, Math.min(100, (1 - di / dt) * 100));
}

function ramSnapshot() {
  const totalBytes = os.totalmem();
  const usedBytes = totalBytes - os.freemem();
  return { usedBytes, totalBytes, pct: totalBytes > 0 ? usedBytes / totalBytes * 100 : 0 };
}

function formatGb(bytes) {
  return (Number(bytes) / GB).toFixed(2);
}

function formatRam(snap) {
  return formatGb(snap.usedBytes) + ' / ' + formatGb(snap.totalBytes) + ' GB';
}

function colorFor(pct) {
  const p = Number(pct) || 0;
  if (p >= 90) return '#f14c4c';
  if (p >= 75) return '#e59b45';
  if (p >= 50) return '#e5c452';
  return '#57c85a';
}

function bar(pct, width, fullGlyph, emptyGlyph) {
  const p = Math.max(0, Math.min(100, Number(pct) || 0));
  const filled = Math.round(p / 100 * width);
  return fullGlyph.repeat(filled) + emptyGlyph.repeat(width - filled);
}

module.exports = { clampInt, cpuSample, cpuPercent, ramSnapshot, formatGb, formatRam, colorFor, bar };
```

- [ ] **Step 4: Lancer les tests pour verifier qu'ils passent**

Run: `node --test C:/Users/ipmss/sysmon-statusbar/test/`
Expected: `pass 11`, `fail 0`.

Le test `formatRam` encode une hypothese sur l'arrondi : `13262143488 / 1073741824` vaut `12.3514...` donc `12.35`, et `34084860723 / 1073741824` vaut `31.7442...` donc `31.74`. Si le test echoue sur ces valeurs, c'est le formatage qui est faux, pas le test.

- [ ] **Step 5: Committer**

```bash
git -C C:/Users/ipmss/sysmon-statusbar add metrics.js test/metrics.test.js
git -C C:/Users/ipmss/sysmon-statusbar commit -m "Mesures CPU et RAM dans un module pur, avec tests node:test"
```

---

### Task 3: Cabler CPU et RAM sur l'ecran

Les valeurs figees disparaissent au profit des vraies mesures, sur un intervalle. Le GPU reste fige pour l'instant, il arrive en Task 4.

**Files:**
- Modify: `C:\Users\ipmss\sysmon-statusbar\extension.js` (reecriture complete du fichier)

**Interfaces:**
- Consumes: `metrics.cpuSample`, `metrics.cpuPercent`, `metrics.ramSnapshot`, `metrics.formatRam`, `metrics.colorFor`, `metrics.bar`, `metrics.clampInt` de Task 2.
- Produces: les fonctions internes `cfg()`, `seg(item, text, color)`, `drawGroup(lbl, barItem, valItem, label, pct, valueText, width, color)`, `render()`, `schedule()`. Task 5 et Task 6 les modifient.

- [ ] **Step 1: Reecrire l'extension**

Remplacer tout le contenu de `extension.js`.

```js
const vscode = require('vscode');
const m = require('./metrics');

const FULL = '$(sysmon-bar-full)';
const EMPTY = '$(sysmon-bar-empty)';
const GRAY = '#8a8a8a';

const it = {};
let timer = null;
let prevCpu = null;

function cfg() { return vscode.workspace.getConfiguration('sysmon'); }

function seg(item, text, color) {
  if (!text) { item.hide(); return; }
  item.text = text;
  item.color = color;
  item.show();
}

function drawGroup(lbl, barItem, valItem, label, pct, valueText, width, color) {
  seg(lbl, label, undefined);
  seg(barItem, m.bar(pct, width, FULL, EMPTY), color);
  seg(valItem, valueText, undefined);
}

function render() {
  const w = m.clampInt(cfg().get('barWidth'), 4, 20);

  const cur = m.cpuSample();
  const cpuPct = prevCpu ? m.cpuPercent(prevCpu, cur) : null;
  prevCpu = cur;
  const cpuText = cpuPct === null ? '--' : Math.round(cpuPct) + '%';
  drawGroup(it.lc, it.bc, it.vc, 'CPU', cpuPct, cpuText, w,
    cpuPct === null ? GRAY : m.colorFor(cpuPct));

  drawGroup(it.lg, it.bg, it.vg, 'GPU', 12, '12%', w, m.colorFor(12));

  const ram = m.ramSnapshot();
  drawGroup(it.lr, it.br, it.vr, 'RAM', ram.pct, m.formatRam(ram), w, m.colorFor(ram.pct));
}

function schedule() {
  const s = m.clampInt(cfg().get('refreshSeconds'), 1, 60);
  clearInterval(timer);
  timer = setInterval(render, s * 1000);
}

function activate(context) {
  const mk = function (prio) {
    const s = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, prio);
    context.subscriptions.push(s);
    return s;
  };
  it.lc = mk(96); it.bc = mk(95); it.vc = mk(94);
  it.lg = mk(93); it.bg = mk(92); it.vg = mk(91);
  it.lr = mk(90); it.br = mk(89); it.vr = mk(88);

  context.subscriptions.push(vscode.workspace.onDidChangeConfiguration(function (e) {
    if (e.affectsConfiguration('sysmon')) { schedule(); render(); }
  }));
  context.subscriptions.push({ dispose: function () { clearInterval(timer); } });

  render();
  schedule();
}

function deactivate() { clearInterval(timer); }

module.exports = { activate, deactivate };
```

- [ ] **Step 2: Verifier la syntaxe**

Run: `node --check C:/Users/ipmss/sysmon-statusbar/extension.js`
Expected: aucune sortie, code de retour 0.

- [ ] **Step 3: Verifier la mesure hors de VS Code**

`metrics.js` est pur, donc la boucle de mesure se verifie sans lancer l'editeur. Ce petit banc confirme que le CPU bouge quand on le charge.

Run:

```bash
node -e "
const m = require('C:/Users/ipmss/sysmon-statusbar/metrics.js');
let prev = m.cpuSample();
setTimeout(() => {
  const p = m.cpuPercent(prev, m.cpuSample());
  const r = m.ramSnapshot();
  console.log('CPU au repos', p.toFixed(1) + '%');
  console.log('RAM', m.formatRam(r), '(' + r.pct.toFixed(1) + '%)');
  prev = m.cpuSample();
  const end = Date.now() + 1000;
  while (Date.now() < end) { Math.sqrt(Math.random()); }
  console.log('CPU sous charge', m.cpuPercent(prev, m.cpuSample()).toFixed(1) + '%');
}, 1000);
"
```

Expected: trois lignes. La RAM doit correspondre a ce que montre le gestionnaire des taches, a 1 GB pres. Le CPU sous charge doit etre nettement superieur au CPU au repos. Sur une machine a N coeurs, une boucle mono-thread monte d'environ `100/N` points, donc l'ecart peut rester modeste ; ce qui compte est qu'il soit visible.

- [ ] **Step 4: Voir en vrai**

Run: `code --extensionDevelopmentPath=C:\Users\ipmss\sysmon-statusbar --new-window`
Expected: le groupe CPU affiche `--` au premier tic puis un pourcentage qui varie toutes les deux secondes. Le groupe RAM affiche la memoire reelle en GB. Le groupe GPU affiche toujours `12%`, c'est attendu a ce stade.

Fermer la fenetre.

- [ ] **Step 5: Committer**

```bash
git -C C:/Users/ipmss/sysmon-statusbar add extension.js
git -C C:/Users/ipmss/sysmon-statusbar commit -m "Affichage des mesures CPU et RAM reelles"
```

---

### Task 4: Sonde GPU sur typeperf, avec parsing teste

Le module GPU est autonome : il lance `typeperf`, lit son flux CSV, et garde en memoire le dernier pourcentage avec son horodatage. Le parsing est separe du process pour etre testable sans lancer quoi que ce soit.

**Files:**
- Create: `C:\Users\ipmss\sysmon-statusbar\gpu.js`
- Create: `C:\Users\ipmss\sysmon-statusbar\test\gpu.test.js`

**Interfaces:**
- Consumes: rien de `metrics.js`.
- Produces: `parseCsvLine(line)` qui rend un nombre ou `null`, et la classe `GpuProbe` avec `start()`, `stop()`, `restart()`, `snapshot()`. `snapshot()` rend `{ pct, ts, state }` ou `state` vaut `'ok'`, `'starting'`, `'missing'` ou `'error'`. Task 5 consomme ces noms exacts.

- [ ] **Step 1: Ecrire les tests de parsing qui echouent**

Creer `test/gpu.test.js`.

```js
const test = require('node:test');
const assert = require('node:assert');
const g = require('../gpu');

test('parseCsvLine ignore la ligne d en-tete', () => {
  const header = '"(PDH-CSV 4.0)","\\\\HOST\\GPU Engine(pid_1_engtype_3D)\\Utilization Percentage"';
  assert.strictEqual(g.parseCsvLine(header), null);
});

test('parseCsvLine ignore une ligne vide ou du bruit', () => {
  assert.strictEqual(g.parseCsvLine(''), null);
  assert.strictEqual(g.parseCsvLine('   '), null);
  assert.strictEqual(g.parseCsvLine('Fin de la collecte'), null);
});

test('parseCsvLine somme les colonnes de valeurs', () => {
  const line = '"09/03/2026 10:00:00.000","1.500000","2.250000","0.000000"';
  assert.strictEqual(g.parseCsvLine(line), 3.75);
});

test('parseCsvLine accepte la virgule decimale des locales FR', () => {
  const line = '"09/03/2026 10:00:00.000","1,500000","2,250000"';
  assert.strictEqual(g.parseCsvLine(line), 3.75);
});

test('parseCsvLine plafonne a cent', () => {
  const line = '"09/03/2026 10:00:00.000","80.0","50.0"';
  assert.strictEqual(g.parseCsvLine(line), 100);
});

test('parseCsvLine traite les colonnes non numeriques comme zero', () => {
  const line = '"09/03/2026 10:00:00.000"," ","5.0"';
  assert.strictEqual(g.parseCsvLine(line), 5);
});

test('parseCsvLine rend null si la ligne n a que l horodatage', () => {
  assert.strictEqual(g.parseCsvLine('"09/03/2026 10:00:00.000"'), null);
});

test('une sonde jamais demarree est en etat starting', () => {
  const p = new g.GpuProbe();
  const s = p.snapshot();
  assert.strictEqual(s.state, 'starting');
  assert.strictEqual(s.pct, null);
});

test('la sonde retient la derniere valeur poussee', () => {
  const p = new g.GpuProbe();
  p._ingest('"09/03/2026 10:00:00.000","4.0","2.0"');
  const s = p.snapshot();
  assert.strictEqual(s.state, 'ok');
  assert.strictEqual(s.pct, 6);
  assert.ok(Date.now() - s.ts < 1000);
});

test('la sonde ne retient pas les lignes non parsables', () => {
  const p = new g.GpuProbe();
  p._ingest('"09/03/2026 10:00:00.000","4.0"');
  p._ingest('Fin de la collecte');
  assert.strictEqual(p.snapshot().pct, 4);
});
```

- [ ] **Step 2: Lancer les tests pour verifier qu'ils echouent**

Run: `node --test C:/Users/ipmss/sysmon-statusbar/test/`
Expected: les tests de `metrics` passent, ceux de `gpu` echouent avec `Cannot find module '../gpu'`.

- [ ] **Step 3: Ecrire le module GPU**

Creer `gpu.js`.

```js
const cp = require('node:child_process');

const COUNTER = '\\GPU Engine(*engtype_3D)\\Utilization Percentage';

function parseCsvLine(line) {
  const s = String(line || '').trim();
  if (!s || s[0] !== '"') return null;
  if (s.indexOf('PDH-CSV') >= 0) return null;
  const cols = s.split('","');
  if (cols.length < 2) return null;
  let sum = 0;
  for (let i = 1; i < cols.length; i++) {
    const raw = cols[i].replace(/"/g, '').trim().replace(',', '.');
    const n = parseFloat(raw);
    if (isFinite(n)) sum += n;
  }
  return Math.max(0, Math.min(100, sum));
}

class GpuProbe {
  constructor(intervalSeconds) {
    this.interval = Math.max(1, Number(intervalSeconds) || 2);
    this.proc = null;
    this.buf = '';
    this.pct = null;
    this.ts = 0;
    this.state = 'starting';
  }

  _ingest(line) {
    const v = parseCsvLine(line);
    if (v === null) return;
    this.pct = v;
    this.ts = Date.now();
    this.state = 'ok';
  }

  start() {
    if (this.proc) return;
    this.state = 'starting';
    let p;
    try {
      p = cp.spawn('typeperf', [COUNTER, '-si', String(this.interval)], {
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe']
      });
    } catch (_) {
      this.state = 'missing';
      return;
    }
    this.proc = p;
    p.on('error', () => { this.state = 'missing'; this.proc = null; });
    p.on('exit', () => { if (this.proc === p) { this.proc = null; if (this.state !== 'missing') this.state = 'error'; } });
    p.stdout.setEncoding('utf8');
    p.stdout.on('data', (chunk) => {
      this.buf += chunk;
      const lines = this.buf.split(/\r?\n/);
      this.buf = lines.pop();
      for (const l of lines) this._ingest(l);
    });
    p.stderr.resume();
  }

  stop() {
    const p = this.proc;
    this.proc = null;
    this.buf = '';
    if (p) { try { p.kill(); } catch (_) { } }
  }

  restart() {
    this.stop();
    this.start();
  }

  snapshot() {
    return { pct: this.pct, ts: this.ts, state: this.state };
  }
}

module.exports = { parseCsvLine, GpuProbe, COUNTER };
```

- [ ] **Step 4: Lancer les tests pour verifier qu'ils passent**

Run: `node --test C:/Users/ipmss/sysmon-statusbar/test/`
Expected: `pass 21`, `fail 0`.

- [ ] **Step 5: Verifier le format reel de typeperf sur ce poste**

Le test accepte le point et la virgule decimale, mais il faut savoir lequel sort reellement, et confirmer que le flux pousse bien des lignes.

Run:

```bash
node -e "
const g = require('C:/Users/ipmss/sysmon-statusbar/gpu.js');
const p = new g.GpuProbe(2);
p.start();
let n = 0;
const iv = setInterval(() => {
  const s = p.snapshot();
  console.log('tic', ++n, JSON.stringify(s));
  if (n >= 5) { clearInterval(iv); p.stop(); process.exit(0); }
}, 2000);
"
```

Expected: cinq lignes. Les deux premieres peuvent afficher `state: 'starting'` avec `pct: null`, `typeperf` met environ deux secondes a produire son premier echantillon. Les suivantes doivent afficher `state: 'ok'` avec un `pct` numerique entre 0 et 100.

Si `pct` reste `null` sur les cinq tics alors que `state` passe a `ok`, le parsing est faux : capturer la sortie brute avec `typeperf "\GPU Engine(*engtype_3D)\Utilization Percentage" -si 2 -sc 2` et comparer au format attendu par `parseCsvLine`.

- [ ] **Step 6: Verifier qu'aucun typeperf ne survit**

Run: `powershell -NoProfile -C "Get-Process typeperf -EA SilentlyContinue | Select-Object Id,StartTime"`
Expected: aucune sortie. Si un process subsiste, `stop()` ne tue pas correctement et il faut corriger avant de continuer.

- [ ] **Step 7: Committer**

```bash
git -C C:/Users/ipmss/sysmon-statusbar add gpu.js test/gpu.test.js
git -C C:/Users/ipmss/sysmon-statusbar commit -m "Sonde GPU sur typeperf en flux continu"
```

---

### Task 5: Cabler le GPU et ses etats degrades

Le groupe GPU cesse d'etre fige. La sonde est demarree a l'activation, recyclee periodiquement, arretee proprement a la desactivation. Les cas ou la mesure manque sont traites explicitement.

**Files:**
- Modify: `C:\Users\ipmss\sysmon-statusbar\extension.js`

**Interfaces:**
- Consumes: `GpuProbe` et son `snapshot()` de Task 4, les reglages `sysmon.showGpu` et `sysmon.gpuRestartSeconds` de Task 1.
- Produces: la constante `GPU_STALE_MS`, la variable de module `probe`, la fonction `gpuText(snap)`. Task 7 lit `probe` pour le tooltip et la commande.

- [ ] **Step 1: Ajouter les require et l'etat de module**

Dans `extension.js`, apres `const m = require('./metrics');`, ajouter :

```js
const { GpuProbe } = require('./gpu');
```

Apres `let prevCpu = null;`, ajouter :

```js
const GPU_STALE_MS = 30000;
let probe = null;
let gpuRestartTimer = null;
```

- [ ] **Step 2: Ajouter le formatage du texte GPU**

Inserer cette fonction juste avant `render()`.

```js
function gpuText(snap) {
  if (!snap || snap.state === 'missing' || snap.state === 'error') return 'n/a';
  if (snap.pct === null) return '--';
  return Math.round(snap.pct) + '%';
}
```

- [ ] **Step 3: Remplacer la ligne GPU figee**

Dans `render()`, supprimer cette ligne :

```js
  drawGroup(it.lg, it.bg, it.vg, 'GPU', 12, '12%', w, m.colorFor(12));
```

La remplacer par :

```js
  if (cfg().get('showGpu') === false) {
    it.lg.hide(); it.bg.hide(); it.vg.hide();
  } else {
    const gs = probe ? probe.snapshot() : null;
    const degraded = !gs || gs.pct === null || gs.state !== 'ok' ||
      (Date.now() - gs.ts > GPU_STALE_MS);
    drawGroup(it.lg, it.bg, it.vg, 'GPU',
      gs && gs.pct !== null ? gs.pct : 0,
      gpuText(gs), w,
      degraded ? GRAY : m.colorFor(gs.pct));
  }
```

- [ ] **Step 4: Piloter la sonde dans le cycle de vie**

Ajouter cette fonction juste avant `activate()`.

```js
function syncProbe() {
  const wanted = cfg().get('showGpu') !== false;
  clearInterval(gpuRestartTimer);
  if (!wanted) {
    if (probe) { probe.stop(); probe = null; }
    return;
  }
  const interval = m.clampInt(cfg().get('refreshSeconds'), 1, 60);
  if (!probe) probe = new GpuProbe(interval);
  probe.restart();
  const every = Math.max(60, Number(cfg().get('gpuRestartSeconds')) || 300) * 1000;
  gpuRestartTimer = setInterval(function () { if (probe) probe.restart(); }, every);
}
```

Dans `activate()`, remplacer le bloc de fin :

```js
  render();
  schedule();
```

par :

```js
  syncProbe();
  render();
  schedule();
```

Dans le gestionnaire `onDidChangeConfiguration`, remplacer le corps :

```js
    if (e.affectsConfiguration('sysmon')) { schedule(); render(); }
```

par :

```js
    if (!e.affectsConfiguration('sysmon')) return;
    if (e.affectsConfiguration('sysmon.showGpu') ||
        e.affectsConfiguration('sysmon.refreshSeconds') ||
        e.affectsConfiguration('sysmon.gpuRestartSeconds')) syncProbe();
    schedule();
    render();
```

Ajouter dans `activate()`, avant `syncProbe()`, une souscription qui garantit l'arret de la sonde meme si `deactivate` n'est pas appele :

```js
  context.subscriptions.push({ dispose: function () { if (probe) probe.stop(); clearInterval(gpuRestartTimer); } });
```

Remplacer `deactivate` :

```js
function deactivate() {
  clearInterval(timer);
  clearInterval(gpuRestartTimer);
  if (probe) { probe.stop(); probe = null; }
}
```

- [ ] **Step 5: Verifier la syntaxe et les tests**

Run: `node --check C:/Users/ipmss/sysmon-statusbar/extension.js`
Expected: aucune sortie.

Run: `node --test C:/Users/ipmss/sysmon-statusbar/test/`
Expected: `pass 21`, `fail 0`.

- [ ] **Step 6: Voir en vrai et verifier la proprete**

Run: `code --extensionDevelopmentPath=C:\Users\ipmss\sysmon-statusbar --new-window`
Expected: apres environ quatre secondes, le groupe GPU affiche un pourcentage reel qui varie. Ouvrir une page lourde ou faire defiler rapidement un gros fichier doit le faire monter.

Pendant que la fenetre est ouverte :

Run: `powershell -NoProfile -C "Get-Process typeperf -EA SilentlyContinue | Measure-Object | Select -Expand Count"`
Expected: `1`. Un seul process, jamais plus. Si le compte grimpe, `syncProbe` est appele en boucle ou `restart` n'arrete pas l'ancien.

Fermer la fenetre, puis :

Run: `powershell -NoProfile -C "Get-Process typeperf -EA SilentlyContinue | Measure-Object | Select -Expand Count"`
Expected: `0`.

- [ ] **Step 7: Verifier l'etat degrade**

Dans la fenetre de developpement, ouvrir les reglages et mettre `sysmon.showGpu` a `false`.
Expected: le groupe GPU disparait entierement, CPU et RAM restent. `Get-Process typeperf` rend `0`.

Remettre a `true`.
Expected: le groupe revient et retrouve une valeur en quelques secondes.

- [ ] **Step 8: Committer**

```bash
git -C C:/Users/ipmss/sysmon-statusbar add extension.js
git -C C:/Users/ipmss/sysmon-statusbar commit -m "Affichage GPU reel, recyclage de la sonde et etats degrades"
```

---

### Task 6: Choix du cote de la barre d'etat

Le reglage `sysmon.alignment` existe deja dans le manifeste mais n'est pas lu. Comme l'alignement d'un `StatusBarItem` se fixe a la creation, changer de cote impose de detruire et recreer les neuf items.

**Files:**
- Modify: `C:\Users\ipmss\sysmon-statusbar\extension.js`

**Interfaces:**
- Consumes: le reglage `sysmon.alignment` de Task 1.
- Produces: `buildItems(context)` et la variable de module `currentAlignment`. Task 7 attache les tooltips apres chaque appel a `buildItems`.

- [ ] **Step 1: Extraire la creation des items**

Dans `extension.js`, ajouter apres `let gpuRestartTimer = null;` :

```js
let currentAlignment = null;
```

Ajouter cette fonction juste avant `activate()`.

```js
function buildItems(context) {
  const want = cfg().get('alignment') === 'left' ? 'left' : 'right';
  if (currentAlignment === want) return;
  currentAlignment = want;

  for (const k in it) { if (it[k]) it[k].dispose(); delete it[k]; }

  const align = want === 'left'
    ? vscode.StatusBarAlignment.Left
    : vscode.StatusBarAlignment.Right;

  const mk = function (prio) {
    const s = vscode.window.createStatusBarItem(align, prio);
    context.subscriptions.push(s);
    return s;
  };
  it.lc = mk(96); it.bc = mk(95); it.vc = mk(94);
  it.lg = mk(93); it.bg = mk(92); it.vg = mk(91);
  it.lr = mk(90); it.br = mk(89); it.vr = mk(88);
}
```

Les priorites restent decroissantes des deux cotes : dans la barre d'etat de VS Code, une priorite plus elevee place l'item plus a gauche, a gauche comme a droite. L'ordre CPU, GPU, RAM est donc preserve.

- [ ] **Step 2: Remplacer la creation en dur dans activate**

Dans `activate()`, supprimer le bloc :

```js
  const mk = function (prio) {
    const s = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, prio);
    context.subscriptions.push(s);
    return s;
  };
  it.lc = mk(96); it.bc = mk(95); it.vc = mk(94);
  it.lg = mk(93); it.bg = mk(92); it.vg = mk(91);
  it.lr = mk(90); it.br = mk(89); it.vr = mk(88);
```

Le remplacer par :

```js
  buildItems(context);
```

- [ ] **Step 3: Reagir au changement de reglage**

Dans le gestionnaire `onDidChangeConfiguration`, ajouter juste apres le garde `if (!e.affectsConfiguration('sysmon')) return;` :

```js
    if (e.affectsConfiguration('sysmon.alignment')) buildItems(context);
```

Le `context` est bien dans la portee, la souscription est enregistree depuis `activate`.

- [ ] **Step 4: Nettoyer les items a la desactivation**

Dans `deactivate()`, ajouter avant la fin :

```js
  for (const k in it) { if (it[k]) it[k].dispose(); delete it[k]; }
  currentAlignment = null;
```

- [ ] **Step 5: Verifier la syntaxe et les tests**

Run: `node --check C:/Users/ipmss/sysmon-statusbar/extension.js`
Expected: aucune sortie.

Run: `node --test C:/Users/ipmss/sysmon-statusbar/test/`
Expected: `pass 21`, `fail 0`.

- [ ] **Step 6: Verifier les deux cotes en vrai**

Run: `code --extensionDevelopmentPath=C:\Users\ipmss\sysmon-statusbar --new-window`
Expected: les trois groupes sont a droite, ordre CPU puis GPU puis RAM.

Dans les reglages, passer `sysmon.alignment` a `left`.
Expected: les trois groupes basculent a gauche sans rechargement de la fenetre, dans le meme ordre CPU, GPU, RAM. Aucun item fantome ne reste a droite.

Repasser a `right`, puis refaire l'aller-retour trois fois de suite.
Expected: toujours exactement neuf items visibles, jamais de doublon. Un doublon signifie que `dispose()` n'est pas appele sur les anciens items.

Fermer la fenetre.

- [ ] **Step 7: Committer**

```bash
git -C C:/Users/ipmss/sysmon-statusbar add extension.js
git -C C:/Users/ipmss/sysmon-statusbar commit -m "Choix gauche ou droite du cote d'affichage, sans rechargement"
```

---

### Task 7: Tooltips detailles et commande de relance

Les chiffres de la barre sont volontairement courts. Le detail va dans le tooltip : modele du processeur, nombre de coeurs, octets exacts de memoire, etat de la sonde GPU et age du dernier echantillon.

**Files:**
- Modify: `C:\Users\ipmss\sysmon-statusbar\extension.js`
- Modify: `C:\Users\ipmss\sysmon-statusbar\metrics.js`
- Modify: `C:\Users\ipmss\sysmon-statusbar\test\metrics.test.js`

**Interfaces:**
- Consumes: `probe` de Task 5, `buildItems` de Task 6, la commande `sysmon.restartGpu` declaree dans le manifeste de Task 1.
- Produces: `metrics.cpuInfo()` et `metrics.formatAge(ms)`.

- [ ] **Step 1: Ecrire les tests qui echouent**

Ajouter a la fin de `test/metrics.test.js` :

```js
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
```

- [ ] **Step 2: Lancer les tests pour verifier qu'ils echouent**

Run: `node --test C:/Users/ipmss/sysmon-statusbar/test/`
Expected: `fail 2`, avec `m.cpuInfo is not a function` et `m.formatAge is not a function`.

- [ ] **Step 3: Ajouter les deux fonctions**

Dans `metrics.js`, ajouter avant `module.exports` :

```js
function cpuInfo() {
  const c = os.cpus();
  return { model: (c[0] && c[0].model || 'inconnu').trim(), cores: c.length };
}

function formatAge(ms) {
  const s = Math.max(0, Math.floor(Number(ms) / 1000));
  if (s < 60) return s + ' s';
  return Math.floor(s / 60) + ' min';
}
```

Remplacer la ligne `module.exports` par :

```js
module.exports = { clampInt, cpuSample, cpuPercent, ramSnapshot, formatGb, formatRam, colorFor, bar, cpuInfo, formatAge };
```

- [ ] **Step 4: Lancer les tests pour verifier qu'ils passent**

Run: `node --test C:/Users/ipmss/sysmon-statusbar/test/`
Expected: `pass 23`, `fail 0`.

- [ ] **Step 5: Poser les tooltips**

Dans `extension.js`, ajouter cette fonction juste avant `render()` :

```js
function setTips(cpuPct, gs, ram) {
  const ci = m.cpuInfo();
  const cpuMd = new vscode.MarkdownString(undefined, true);
  cpuMd.appendMarkdown('**Processeur**\n\n');
  cpuMd.appendMarkdown(ci.model + '\n\n');
  cpuMd.appendMarkdown(ci.cores + ' coeurs logiques\n\n');
  cpuMd.appendMarkdown('Charge moyenne sur tous les coeurs : ' +
    (cpuPct === null ? 'mesure en cours' : cpuPct.toFixed(1) + ' %'));

  const ramMd = new vscode.MarkdownString(undefined, true);
  ramMd.appendMarkdown('**Memoire systeme**\n\n');
  ramMd.appendMarkdown('Utilisee : ' + m.formatGb(ram.usedBytes) + ' GB\n\n');
  ramMd.appendMarkdown('Totale : ' + m.formatGb(ram.totalBytes) + ' GB\n\n');
  ramMd.appendMarkdown('Libre : ' + m.formatGb(ram.totalBytes - ram.usedBytes) + ' GB\n\n');
  ramMd.appendMarkdown('Occupation : ' + ram.pct.toFixed(1) + ' %');

  const gpuMd = new vscode.MarkdownString(undefined, true);
  gpuMd.isTrusted = true;
  gpuMd.appendMarkdown('**GPU**\n\n');
  if (!gs || gs.state === 'missing') {
    gpuMd.appendMarkdown('typeperf introuvable ou refuse par le systeme.\n\n');
  } else if (gs.state === 'error') {
    gpuMd.appendMarkdown('La sonde typeperf s\'est arretee.\n\n');
  } else if (gs.pct === null) {
    gpuMd.appendMarkdown('Premier echantillon en attente.\n\n');
  } else {
    gpuMd.appendMarkdown('Moteurs 3D : ' + gs.pct.toFixed(1) + ' %\n\n');
    gpuMd.appendMarkdown('Dernier echantillon il y a ' + m.formatAge(Date.now() - gs.ts) + '\n\n');
  }
  gpuMd.appendMarkdown('Source : compteur Windows GPU Engine, moteurs de type 3D\n\n');
  gpuMd.appendMarkdown('[$(sync) Relancer la sonde](command:sysmon.restartGpu)');

  for (const k of ['lc', 'bc', 'vc']) it[k].tooltip = cpuMd;
  for (const k of ['lg', 'bg', 'vg']) { it[k].tooltip = gpuMd; it[k].command = 'sysmon.restartGpu'; }
  for (const k of ['lr', 'br', 'vr']) it[k].tooltip = ramMd;
}
```

- [ ] **Step 6: Appeler setTips depuis render**

Dans `render()`, le snapshot GPU est actuellement declare dans le `else` du bloc `showGpu`. Le remonter pour qu'il soit visible par `setTips`. Remplacer le bloc GPU entier par :

```js
  const gs = probe ? probe.snapshot() : null;
  if (cfg().get('showGpu') === false) {
    it.lg.hide(); it.bg.hide(); it.vg.hide();
  } else {
    const degraded = !gs || gs.pct === null || gs.state !== 'ok' ||
      (Date.now() - gs.ts > GPU_STALE_MS);
    drawGroup(it.lg, it.bg, it.vg, 'GPU',
      gs && gs.pct !== null ? gs.pct : 0,
      gpuText(gs), w,
      degraded ? GRAY : m.colorFor(gs.pct));
  }
```

Puis, tout a la fin de `render()`, apres la ligne qui dessine la RAM, ajouter :

```js
  setTips(cpuPct, gs, ram);
```

Verifier que la variable `ram` est bien declaree avant cet appel. Si le bloc RAM utilise `const ram = m.ramSnapshot();`, l'appel doit venir apres.

- [ ] **Step 7: Enregistrer la commande**

Dans `activate()`, avant `syncProbe();`, ajouter :

```js
  context.subscriptions.push(vscode.commands.registerCommand('sysmon.restartGpu', function () {
    if (probe) probe.restart(); else syncProbe();
    render();
  }));
```

- [ ] **Step 8: Verifier**

Run: `node --check C:/Users/ipmss/sysmon-statusbar/extension.js`
Expected: aucune sortie.

Run: `node --test C:/Users/ipmss/sysmon-statusbar/test/`
Expected: `pass 23`, `fail 0`.

Run: `code --extensionDevelopmentPath=C:\Users\ipmss\sysmon-statusbar --new-window`
Expected: survoler le groupe CPU affiche le modele du processeur et le nombre de coeurs. Survoler la RAM affiche utilisee, totale, libre et le pourcentage. Survoler le GPU affiche le pourcentage a une decimale, l'age de l'echantillon et un lien cliquable qui relance la sonde. Cliquer sur le lien ne doit pas faire apparaitre un second `typeperf` : verifier avec `Get-Process typeperf` que le compte reste a `1`.

Fermer la fenetre.

- [ ] **Step 9: Committer**

```bash
git -C C:/Users/ipmss/sysmon-statusbar add extension.js metrics.js test/metrics.test.js
git -C C:/Users/ipmss/sysmon-statusbar commit -m "Tooltips detailles et commande de relance de la sonde GPU"
```

---

### Task 8: Documentation, packaging et installation

Le code est complet. Il reste a le documenter, a le packager en vsix et a l'installer dans le VS Code de tous les jours.

**Files:**
- Create: `C:\Users\ipmss\sysmon-statusbar\README.md`
- Create: `C:\Users\ipmss\sysmon-statusbar\CHANGELOG.md`

**Interfaces:**
- Consumes: tous les reglages et commandes definis en Task 1, 5, 6 et 7.
- Produces: `sysmon-statusbar-0.1.0.vsix`.

- [ ] **Step 1: Ecrire le README**

Creer `README.md`.

```markdown
# System Monitor Status Bar

Affiche la charge CPU, la charge GPU et l'occupation memoire de la machine dans
la barre d'etat de VS Code, sous forme de barres colorees et de valeurs vivantes.

```
CPU ▓▓▓░░░░░ 34%   GPU ▓░░░░░░░ 12%   RAM ▓▓▓░░░░░ 12.35 / 31.74 GB
```

## Ce qui est mesure

Le CPU est la charge moyenne de tous les coeurs logiques, calculee par
difference des compteurs cumules du systeme entre deux rafraichissements.

Le GPU est l'utilisation des moteurs 3D, lue sur le compteur de performance
Windows `GPU Engine`. Windows uniquement.

La RAM est la memoire systeme, machine entiere et non pas seulement VS Code.

## Sonde GPU

L'extension lance un unique process `typeperf` en flux continu plutot que
d'interroger le systeme a chaque rafraichissement. Sur la machine de reference,
cette approche coute 12 MB de memoire residente, contre 76 a 91 MB pour un
daemon PowerShell equivalent, et evite les 2,8 secondes d'attente qu'imposerait
un appel a `Get-Counter` a chaque tic.

`typeperf` fige le jeu d'instances du compteur a son demarrage. La sonde est
donc recyclee toutes les cinq minutes pour prendre en compte les programmes
lances entre-temps. L'intervalle est reglable.

## Reglages

`sysmon.alignment` place les indicateurs a gauche ou a droite de la barre
d'etat. Le changement s'applique immediatement, sans rechargement.

`sysmon.refreshSeconds` regle l'intervalle de rafraichissement, deux secondes
par defaut, borne entre 1 et 60.

`sysmon.barWidth` regle la largeur de chaque barre en cellules, huit par defaut,
borne entre 4 et 20.

`sysmon.showGpu` masque le groupe GPU et arrete la sonde `typeperf`.

`sysmon.gpuRestartSeconds` regle le recyclage de la sonde, 300 secondes par
defaut, minimum 60.

## Commande

`System Monitor: Relancer la sonde GPU` redemarre `typeperf` immediatement. Elle
est aussi accessible en cliquant sur le groupe GPU.

## Couleurs

Vert sous 50 %, jaune a partir de 50 %, orange a partir de 75 %, rouge a partir
de 90 %. Gris quand la mesure est indisponible ou datee de plus de trente
secondes. Ces couleurs sont fixes et identiques en theme clair et sombre, pour
rester coherentes avec `claude-ratelimit-statusbar`.

## Developpement

Aucune dependance, aucune etape de build.

```bash
node --test test/
code --extensionDevelopmentPath=. --new-window
npx @vscode/vsce package
```
```

- [ ] **Step 2: Ecrire le journal des versions**

Creer `CHANGELOG.md`.

```markdown
# Changelog

## 0.1.0

Premiere version. Trois indicateurs dans la barre d'etat : charge CPU, charge
GPU et memoire systeme, avec barres colorees et valeurs vivantes. Cote
d'affichage au choix, gauche ou droite. Sonde GPU sur `typeperf` en flux
continu, recyclee periodiquement.
```

- [ ] **Step 3: Verifier la RAM disponible avant de packager**

`vsce` telecharge des paquets et compresse, ce qui demande de la memoire.

Run: `powershell -NoProfile -C "[math]::Round((Get-Counter '\Memory\Available MBytes').CounterSamples[0].CookedValue)"`
Expected: un nombre superieur a 2000. En dessous, fermer des fenetres ou des process avant de continuer.

- [ ] **Step 4: Packager**

Run: `cd C:/Users/ipmss/sysmon-statusbar && npx --yes @vscode/vsce package`
Expected: `Packaged: C:\Users\ipmss\sysmon-statusbar\sysmon-statusbar-0.1.0.vsix`.

`vsce` avertit qu'il n'y a pas de depot declare dans `package.json`. C'est attendu tant que le depot distant n'existe pas, l'avertissement ne bloque pas.

- [ ] **Step 5: Verifier le contenu du paquet**

Run: `cd C:/Users/ipmss/sysmon-statusbar && npx --yes @vscode/vsce ls`
Expected: la liste doit contenir `extension.js`, `metrics.js`, `gpu.js`, `package.json`, `bar.woff`, `icon.png`, `README.md`, `CHANGELOG.md`, `LICENSE`. Elle ne doit contenir ni `test/`, ni `docs/`, ni `.vsix`. Si `test/` ou `docs/` apparaissent, `.vscodeignore` est mal ecrit.

- [ ] **Step 6: Installer et verifier dans le VS Code de tous les jours**

Run: `code --install-extension C:/Users/ipmss/sysmon-statusbar/sysmon-statusbar-0.1.0.vsix`
Expected: `Extension 'sysmon-statusbar-0.1.0.vsix' was successfully installed.`

Redemarrer VS Code, puis verifier que les trois groupes apparaissent a cote de ceux de `claude-ratelimit-statusbar` et que les barres des deux extensions ont exactement la meme apparence.

Run: `powershell -NoProfile -C "Get-Process typeperf -EA SilentlyContinue | Measure-Object | Select -Expand Count"`
Expected: `1` par fenetre VS Code ouverte. Chaque fenetre active sa propre instance de l'extension, donc sa propre sonde. Si ce comportement gene, c'est une evolution a decider apres coup, pas un defaut de cette version.

- [ ] **Step 7: Committer**

```bash
git -C C:/Users/ipmss/sysmon-statusbar add README.md CHANGELOG.md
git -C C:/Users/ipmss/sysmon-statusbar commit -m "README, changelog et premiere version packagee"
```
