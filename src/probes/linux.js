const disk = require('./linux-disk');
const gpu = require('./linux-gpu');

class LinuxProbe {
  constructor(intervalSeconds) {
    this.interval = Math.max(1, Number(intervalSeconds) || 2);
    this.timer = null;
    this.gpu = null;
    this.gpus = {};
    this.disk = null;
    this.disks = {};
    this.ts = 0;
    this.state = 'starting';
    this.gpuMethod = null;
    this.gpuPaths = [];
    this.prevDisk = null;
    this.prevDiskTs = 0;
    this.querying = false;
    this.missing = false;
  }

  _detect() {
    this.gpuPaths = gpu.findGpuSysfsPaths();
    let diskAvailable = true;
    try { disk.readDiskStats(); } catch (_) { diskAvailable = false; }
    if (this.gpuPaths.length) {
      this.gpuMethod = 'sysfs';
      this.missing = false;
      return;
    }
    this.gpuMethod = null;
    this.missing = !diskAvailable;
    gpu.detectNvidiaSmi((ok) => {
      if (this.gpuPaths.length) return;
      this.gpuMethod = ok ? 'nvidia' : null;
      this.missing = !diskAvailable && this.gpuMethod === null;
    });
  }

  _tick() {
    let diskOk = false;
    try {
      const cur = disk.readDiskStats();
      const curTs = Date.now();
      if (this.prevDisk) {
        const all = disk.diskPercents(this.prevDisk, this.prevDiskTs, cur, curTs);
        let max = null;
        for (const name in all) { if (max === null || all[name] > max) max = all[name]; }
        if (max !== null) {
          this.disks = all;
          this.disk = max;
          diskOk = true;
        }
      }
      this.prevDisk = cur;
      this.prevDiskTs = curTs;
    } catch (_) { }

    let gpuOk = false;
    if (this.gpuMethod === 'sysfs') {
      const v = gpu.readGpuSysfs(this.gpuPaths);
      if (v !== null) { this.gpu = v; this.gpus = gpu.readGpuSysfsEach(this.gpuPaths); gpuOk = true; }
    } else if (this.gpuMethod === 'nvidia' && !this.querying) {
      this.querying = true;
      gpu.queryNvidiaSmi((v, each) => {
        this.querying = false;
        if (v !== null) { this.gpu = v; this.gpus = each; this.ts = Date.now(); if (!this.missing) this.state = 'ok'; }
      });
    }

    this.ts = Date.now();
    if (this.missing) { this.state = 'missing'; return; }
    if (diskOk || gpuOk) this.state = 'ok';
  }

  start() {
    if (this.timer) return;
    this.state = 'starting';
    this._detect();
    this._tick();
    this.timer = setInterval(() => this._tick(), this.interval * 1000);
  }

  stop() {
    clearInterval(this.timer);
    this.timer = null;
    this.prevDisk = null;
  }

  restart() { this.stop(); this.start(); }

  snapshot() { return { gpu: this.gpu, gpus: this.gpus, disk: this.disk, disks: this.disks, ts: this.ts, state: this.state }; }
}

module.exports = Object.assign({ LinuxProbe }, disk, gpu);
