const os = require('node:os');
const fs = require('node:fs');
const path = require('node:path');

const SHARE_FILE = path.join(os.tmpdir(), 'sysmon-probe-share.json');
const LEASE_MS = 8000;
const OWNER_ID = String(process.pid) + '-' + Math.random().toString(36).slice(2, 8);

const lease = { held: false };

function readShare() {
  try { return JSON.parse(fs.readFileSync(SHARE_FILE, 'utf8')); } catch (_) { return null; }
}

function writeShare(o) {
  const tmp = SHARE_FILE + '.' + process.pid + '.tmp';
  try {
    fs.writeFileSync(tmp, JSON.stringify(o));
    fs.renameSync(tmp, SHARE_FILE);
  } catch (_) {
    try { fs.unlinkSync(tmp); } catch (_) { }
  }
}

function claimLease(now) {
  const s = readShare();
  return !s || !s.owner || !s.lease || s.lease < now || s.owner === OWNER_ID;
}

function publishShare(snap, now) {
  writeShare({
    owner: OWNER_ID,
    lease: now + LEASE_MS,
    ts: snap.ts,
    state: snap.state,
    gpu: snap.gpu,
    gpus: snap.gpus || {},
    disk: snap.disk,
    disks: snap.disks || {},
    swap: typeof snap.swap === 'number' ? snap.swap : null
  });
}

function sharedSnapshot() {
  const s = readShare();
  if (!s || !s.ts) return null;
  return {
    gpu: s.gpu, gpus: s.gpus || {}, disk: s.disk, disks: s.disks || {},
    swap: typeof s.swap === 'number' ? s.swap : null, ts: s.ts, state: s.state || 'ok'
  };
}

function releaseShare() {
  if (!lease.held) return;
  const s = readShare();
  if (s && s.owner === OWNER_ID) writeShare(Object.assign({}, s, { owner: null, lease: 0 }));
  lease.held = false;
}

function takeoverShare(now) {
  const s = readShare();
  writeShare(Object.assign({}, s || {}, { owner: OWNER_ID, lease: now + LEASE_MS }));
  lease.held = true;
}

module.exports = {
  SHARE_FILE, OWNER_ID, lease,
  claimLease, publishShare, sharedSnapshot, releaseShare, takeoverShare
};
