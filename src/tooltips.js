const vscode = require('vscode');
const m = require('./metrics');
const g = require('./groups');
const { t } = require('./i18n');
const { IS_WINDOWS, IS_MAC } = require('./probe-host');

function sources() {
  return {
    gpu: IS_WINDOWS ? t('Windows GPU Engine counter, 3D engines')
      : IS_MAC ? t('ioreg, graphics accelerator statistics')
        : t('sysfs gpu_busy_percent, or nvidia-smi when available'),
    disk: IS_WINDOWS ? t('Windows PhysicalDisk counter, one per disk')
      : IS_MAC ? t('unavailable on macOS without privileges: no busy percentage is exposed')
        : t('/proc/diskstats, one disk per device'),
    swap: IS_WINDOWS ? t('Windows Paging File counter and Win32_PageFileUsage')
      : IS_MAC ? t('sysctl vm.swapusage') : t('/proc/meminfo')
  };
}

function md(title) {
  const d = new vscode.MarkdownString(undefined, true);
  d.appendMarkdown('**' + title + '**\n\n');
  return d;
}

function link(d, command, text) {
  d.isTrusted = true;
  d.appendMarkdown('\n\n[$(list-selection) ' + text + '](command:' + command + ')');
  return d;
}

function percent(v) { return t('{0} %', v.toFixed(1)); }

function probed(title, value, snap, source, macDisk) {
  const d = md(title);
  if (!snap || snap.state === 'missing') {
    d.appendMarkdown((IS_WINDOWS ? t('typeperf is missing or was refused by the system.') : t('No source available on this machine.')) + '\n\n');
  } else if (snap.state === 'error') {
    d.appendMarkdown((IS_WINDOWS ? t('The typeperf probe stopped.') : t('The probe stopped.')) + '\n\n');
  } else if (value === null) {
    d.appendMarkdown((macDisk ? t('Not measured on macOS.') : t('Waiting for the first sample.')) + '\n\n');
  } else {
    d.appendMarkdown(percent(value) + '\n\n');
    d.appendMarkdown(t('Last sample {0} ago', m.formatAge(Date.now() - snap.ts)) + '\n\n');
  }
  d.appendMarkdown(t('Source: {0}', source) + '\n\n');
  d.appendMarkdown(t('Restart: command palette, System Monitor'));
  return d;
}

function memory(title, u, source) {
  const d = md(title);
  if (!u) return d.appendMarkdown(t('Waiting for the first sample.') + '\n\n' + t('Source: {0}', source));
  if (!u.totalBytes) return d.appendMarkdown(t('No swap configured on this machine.') + '\n\n' + t('Source: {0}', source));
  d.appendMarkdown(t('Used: {0} GB', m.formatGb(u.usedBytes)) + '\n\n');
  d.appendMarkdown(t('Free: {0} GB', m.formatGb(u.freeBytes)) + '\n\n');
  d.appendMarkdown(t('Total: {0} GB', m.formatGb(u.totalBytes)) + '\n\n');
  d.appendMarkdown(t('In use: {0}', percent(u.pct)));
  if (source) d.appendMarkdown('\n\n' + t('Source: {0}', source));
  return d;
}

function tipsFor(keys, data) {
  const { cpuPct, cores, snap, mem } = data;
  const src = sources();
  const ci = m.cpuInfo();
  const pickCpu = t('Choose the CPU cores shown');
  const pickGpu = t('Choose the GPUs shown');
  const names = g.knownDisks(snap);
  const tips = {};
  for (const key of keys) {
    const kind = g.kindOf(key);
    const sub = key.indexOf(':') > 0 ? g.subOf(key) : null;
    if (key === 'cpu') {
      const d = md(t('Processor'));
      d.appendMarkdown(ci.model + '\n\n' + t('{0} logical cores', ci.cores) + '\n\n');
      d.appendMarkdown(t('Average load across all cores: {0}', cpuPct === null ? t('measuring') : percent(cpuPct)));
      tips[key] = link(d, 'sysmon.pickCpus', pickCpu);
    } else if (kind === 'cpu') {
      const d = md(t('Logical core {0}', sub));
      const v = cores[sub];
      d.appendMarkdown(ci.model + '\n\n' + t('Load: {0}', typeof v === 'number' ? percent(v) : t('measuring')));
      tips[key] = link(d, 'sysmon.pickCpus', pickCpu);
    } else if (kind === 'gpu') {
      const raw = !snap ? null : sub === null ? snap.gpu : snap.gpus && snap.gpus[sub];
      const title = sub === null ? t('GPU, all adapters') : t('GPU {0}', sub);
      tips[key] = link(probed(title, typeof raw === 'number' ? raw : null, snap, src.gpu), 'sysmon.pickGpus', pickGpu);
    } else if (kind === 'disk') {
      const raw = sub === null || !snap || !snap.disks ? null : snap.disks[g.diskOf(key)];
      const d = probed(sub === null ? t('Disk') : t('Disk {0}', g.diskOf(key)),
        typeof raw === 'number' ? raw : null, snap, src.disk, IS_MAC);
      if (names.length) {
        d.appendMarkdown('\n\n' + t('Disks seen: {0}', names.map(g.shortDiskName).join(', ')));
        link(d, 'sysmon.pickDisks', t('Choose the disks shown'));
      }
      tips[key] = d;
    } else if (key === 'ram') {
      tips[key] = memory(t('System memory'), mem.ram, null);
    } else if (key === 'swap') {
      tips[key] = memory(t('Swap'), mem.swap, src.swap);
    }
  }
  return tips;
}

module.exports = { tipsFor };
