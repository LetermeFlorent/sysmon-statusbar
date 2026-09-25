const m = require('./metrics');

const LABELS = { cpu: 'CPU', gpu: 'GPU', disk: 'DISK', ram: 'RAM', swap: 'SWAP' };

function shortDiskName(name) {
  const mm = /^\d+\s+(.+)$/.exec(String(name || ''));
  return mm ? mm[1] : String(name || '');
}

function diskKey(name) { return 'disk:' + name; }

function isDiskKey(key) { return key.indexOf('disk:') === 0; }

function diskOf(key) { return key.slice(5); }

function subOf(key) { return key.slice(key.indexOf(':') + 1); }

function kindOf(key) { return key.split(':')[0]; }

function gpuLabel(id) { return /^\d+$/.test(id) ? 'GPU' + id : id; }

function labelFor(key) {
  if (isDiskKey(key)) return shortDiskName(diskOf(key));
  if (key.indexOf('cpu:') === 0) return 'C' + subOf(key);
  if (key.indexOf('gpu:') === 0) return gpuLabel(subOf(key));
  return LABELS[key];
}

function byNumber(a, b) {
  const na = Number(a.replace(/\D+/g, '')), nb = Number(b.replace(/\D+/g, ''));
  return na - nb || (a < b ? -1 : a > b ? 1 : 0);
}

function knownGpus(snap) {
  return snap && snap.gpus ? Object.keys(snap.gpus).sort(byNumber) : [];
}

function knownCores() {
  return m.cpuCoreSamples().map(function (_, i) { return String(i); });
}

function knownDisks(snap) {
  return snap && snap.disks ? Object.keys(snap.disks).sort() : [];
}

function deviceKeys(kind, chosen, ids) {
  if (!chosen.length || !ids.length) return [kind];
  const keys = [];
  if (chosen.indexOf('all') >= 0) keys.push(kind);
  for (const id of ids) if (chosen.indexOf(id) >= 0) keys.push(kind + ':' + id);
  return keys.length ? keys : [kind];
}

function visibleDisks(conf, snap) {
  const all = knownDisks(snap);
  if (!conf.diskDevices.length) return all;
  return all.filter(function (n) { return conf.diskDevices.indexOf(n) >= 0; });
}

function groupKeys(conf, snap) {
  const keys = [];
  if (conf.show.cpu) keys.push.apply(keys, deviceKeys('cpu', conf.cpuDevices || [], knownCores()));
  if (conf.show.gpu) keys.push.apply(keys, deviceKeys('gpu', conf.gpuDevices || [], knownGpus(snap)));
  if (conf.show.disk) {
    if (!knownDisks(snap).length) keys.push('disk');
    else for (const n of visibleDisks(conf, snap)) keys.push(diskKey(n));
  }
  if (conf.show.ram) keys.push('ram');
  if (conf.show.swap) keys.push('swap');
  return keys;
}

module.exports = {
  shortDiskName, diskKey, isDiskKey, diskOf, subOf, kindOf, gpuLabel, labelFor,
  knownGpus, knownCores, knownDisks, deviceKeys, visibleDisks, groupKeys
};
