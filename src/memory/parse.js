const MB = 1048576;

const UNITS = { K: 1024, M: MB, G: 1073741824, T: 1099511627776 };

function parseMeminfo(text) {
  const kb = {};
  for (const line of String(text || '').split('\n')) {
    const m = /^(\w+):\s+(\d+)\s*kB/.exec(line.trim());
    if (m) kb[m[1]] = Number(m[2]) * 1024;
  }
  const pick = (k) => (typeof kb[k] === 'number' ? kb[k] : null);
  return {
    availableBytes: pick('MemAvailable'),
    swapTotalBytes: pick('SwapTotal'),
    swapFreeBytes: pick('SwapFree')
  };
}

function parseSwapusage(text) {
  const s = String(text || '');
  const read = (key) => {
    const m = new RegExp(key + '\\s*=\\s*([\\d.,]+)\\s*([KMGT])', 'i').exec(s);
    return m ? Number(m[1].replace(',', '.')) * UNITS[m[2].toUpperCase()] : null;
  };
  const total = read('total');
  const used = read('used');
  if (total === null || used === null) return null;
  return { totalBytes: total, usedBytes: used };
}

function parsePageFileMb(text) {
  const n = Number(String(text || '').trim().replace(',', '.'));
  return isFinite(n) && n >= 0 && String(text || '').trim() !== '' ? n * MB : null;
}

module.exports = { parseMeminfo, parseSwapusage, parsePageFileMb };
