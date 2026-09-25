const fs = require('node:fs');

const DISKSTATS_PATH = '/proc/diskstats';

function isWholeDisk(name) {
  return /^(sd[a-z]+|vd[a-z]+|xvd[a-z]+|nvme\d+n\d+|mmcblk\d+)$/.test(name);
}

function parseDiskStats(text) {
  const devices = {};
  for (const line of String(text || '').split('\n')) {
    const cols = line.trim().split(/\s+/);
    if (cols.length < 14) continue;
    const name = cols[2];
    if (!isWholeDisk(name)) continue;
    const ms = Number(cols[12]);
    if (isFinite(ms)) devices[name] = ms;
  }
  return devices;
}

function diskPercents(prev, prevTs, cur, curTs) {
  const dtWall = curTs - prevTs;
  if (dtWall <= 0) return {};
  const out = {};
  for (const name in cur) {
    if (!(name in prev)) continue;
    const dMs = cur[name] - prev[name];
    if (dMs < 0) continue;
    out[name] = Math.max(0, Math.min(100, dMs / dtWall * 100));
  }
  return out;
}

function diskPercent(prev, prevTs, cur, curTs) {
  const all = diskPercents(prev, prevTs, cur, curTs);
  let max = null;
  for (const name in all) {
    if (max === null || all[name] > max) max = all[name];
  }
  return max;
}

function readDiskStats() {
  return parseDiskStats(fs.readFileSync(DISKSTATS_PATH, 'utf8'));
}

module.exports = { DISKSTATS_PATH, isWholeDisk, parseDiskStats, diskPercents, diskPercent, readDiskStats };
