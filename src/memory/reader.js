const os = require('node:os');
const fs = require('node:fs');
const cp = require('node:child_process');
const m = require('../metrics');
const p = require('./parse');

const PAGEFILE_QUERY = '(Get-CimInstance Win32_PageFileUsage | Measure-Object AllocatedBaseSize -Sum).Sum';
const PAGEFILE_RETRY_MS = 60000;

class MemoryReader {
  constructor(platform) {
    this.platform = platform || os.platform();
    this.pageFileBytes = null;
    this.pageFileAt = 0;
    this.macSwap = null;
    this.macBusy = false;
  }

  read(snap) {
    if (this.platform === 'linux') return this._linux();
    const ram = m.ramSnapshot();
    if (this.platform === 'win32') return { ram, swap: this._windowsSwap(snap) };
    if (this.platform === 'darwin') { this._queryMac(); return { ram, swap: this.macSwap }; }
    return { ram, swap: null };
  }

  _linux() {
    let info = null;
    try { info = p.parseMeminfo(fs.readFileSync('/proc/meminfo', 'utf8')); } catch (_) { }
    const ram = m.ramSnapshot(info ? info.availableBytes : undefined);
    if (!info || info.swapTotalBytes === null || info.swapFreeBytes === null) return { ram, swap: null };
    return { ram, swap: m.usage(info.swapTotalBytes - info.swapFreeBytes, info.swapTotalBytes) };
  }

  _windowsSwap(snap) {
    this._queryPageFile();
    const total = this.pageFileBytes;
    if (total === null) return null;
    if (total === 0) return m.usage(0, 0);
    const pct = snap && typeof snap.swap === 'number' ? snap.swap : null;
    return pct === null ? null : m.usage(total * pct / 100, total);
  }

  _queryPageFile() {
    const now = Date.now();
    if (this.pageFileBytes !== null || now - this.pageFileAt < PAGEFILE_RETRY_MS) return;
    this.pageFileAt = now;
    cp.execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', PAGEFILE_QUERY],
      { timeout: 15000, windowsHide: true },
      (err, stdout) => {
        if (err) return;
        const bytes = p.parsePageFileMb(stdout);
        this.pageFileBytes = bytes === null ? 0 : bytes;
      });
  }

  _queryMac() {
    if (this.macBusy) return;
    this.macBusy = true;
    cp.execFile('sysctl', ['-n', 'vm.swapusage'], { timeout: 3000 }, (err, stdout) => {
      this.macBusy = false;
      if (err) return;
      const s = p.parseSwapusage(stdout);
      if (s) this.macSwap = m.usage(s.usedBytes, s.totalBytes);
    });
  }

  resetPageFile() {
    this.pageFileBytes = null;
    this.pageFileAt = 0;
  }
}

module.exports = { MemoryReader, PAGEFILE_QUERY };
