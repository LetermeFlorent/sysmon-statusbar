const COUNTERS = [
  '\\GPU Engine(*engtype_3D)\\Utilization Percentage',
  '\\Moteur GPU(*engtype_3D)\\Pourcentage d\'utilisation',
  '\\PhysicalDisk(*)\\% Disk Time',
  '\\Disque physique(*)\\Pourcentage du temps disque',
  '\\Paging File(_Total)\\% Usage',
  '\\Fichier d’échange(_Total)\\Pourcentage d’utilisation'
];

function counterInstance(name) {
  const m = /\(([^)]*)\)/.exec(String(name || ''));
  return m ? m[1] : null;
}

function gpuAdapter(name) {
  const m = /luid_(0x[0-9a-f]+_0x[0-9a-f]+)/i.exec(String(name || ''));
  return m ? m[1].toLowerCase() : null;
}

function columnKind(name) {
  const n = String(name || '');
  if (/GPU Engine|Moteur GPU/i.test(n)) return 'gpu';
  if (/Disk Time|temps disque|PhysicalDisk|Disque physique/i.test(n)) return 'disk';
  if (/Paging File|Fichier d/i.test(n)) return 'swap';
  return null;
}

function splitCsv(line) {
  const s = String(line || '').trim();
  if (!s || s[0] !== '"') return null;
  return s.replace(/^"/, '').replace(/"$/, '').split('","');
}

function parseHeader(line) {
  const cols = splitCsv(line);
  if (!cols || cols.length < 2 || cols[0].indexOf('PDH-CSV') < 0) return null;
  const names = cols.slice(1);
  const adapters = [];
  for (const name of names) {
    const a = columnKind(name) === 'gpu' ? gpuAdapter(name) : null;
    if (a && adapters.indexOf(a) < 0) adapters.push(a);
  }
  adapters.sort();
  return names.map((name) => {
    const kind = columnKind(name);
    if (!kind) return null;
    if (kind === 'disk') return { kind, instance: counterInstance(name) };
    if (kind === 'swap') return { kind, instance: null };
    const a = gpuAdapter(name);
    return { kind, instance: a ? String(adapters.indexOf(a)) : null };
  });
}

function parseValues(line, kinds) {
  if (!kinds) return null;
  const cols = splitCsv(line);
  if (!cols || cols.length < 2 || cols[0].indexOf('PDH-CSV') >= 0) return null;
  let gpu = null;
  let diskTotal = null;
  let swap = null;
  const disks = {};
  const gpus = {};
  let sawDisk = false;
  for (let i = 1; i < cols.length; i++) {
    const col = kinds[i - 1];
    if (!col) continue;
    const n = parseFloat(cols[i].replace(/"/g, '').trim().replace(',', '.'));
    if (!isFinite(n)) continue;
    const v = Math.max(0, Math.min(100, n));
    if (col.kind === 'gpu') {
      gpu = (gpu === null ? 0 : gpu) + v;
      if (col.instance !== null) gpus[col.instance] = Math.min(100, (gpus[col.instance] || 0) + v);
    } else if (col.kind === 'swap') {
      swap = v;
    } else if (col.kind === 'disk') {
      sawDisk = true;
      if (col.instance === '_Total') {
        diskTotal = v;
      } else if (col.instance) {
        disks[col.instance] = v;
      }
    }
  }
  if (gpu === null && !sawDisk && swap === null) return null;
  if (gpu !== null) gpu = Math.max(0, Math.min(100, gpu));
  return { gpu, gpus, disk: diskTotal, disks: sawDisk ? disks : null, swap };
}

module.exports = { COUNTERS, counterInstance, gpuAdapter, columnKind, parseHeader, parseValues };
