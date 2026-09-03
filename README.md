# System Monitor Status Bar

[![Version](https://img.shields.io/visual-studio-marketplace/v/letermeflorent.sysmon-statusbar?label=marketplace)](https://marketplace.visualstudio.com/items?itemName=letermeflorent.sysmon-statusbar)
[![Installs](https://img.shields.io/visual-studio-marketplace/i/letermeflorent.sysmon-statusbar)](https://marketplace.visualstudio.com/items?itemName=letermeflorent.sysmon-statusbar)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

**Is it your build, or is it your machine?** CPU, GPU, disk and system memory as real coloured progress bars in the VS Code status bar, on whichever side you want them.

![CPU, GPU, disk and memory in the VS Code status bar](https://raw.githubusercontent.com/LetermeFlorent/sysmon-statusbar/master/media/statusbar.png)

## The problem

Something is slow, and you have no idea which resource ran out. Alt-tabbing to Task Manager tells you — three seconds later, about a moment that has already passed, in a window that now has focus and is itself skewing the reading. Meanwhile the monitors that do live in the editor tend to cost more than what they measure: one of them shells out to PowerShell on every refresh and burns nearly three seconds of wall time per tick to tell you your CPU is busy.

## What you get

Four groups, always visible, updating on their own:

```
CPU ▓▓░░░ 34%   GPU ░░░░░ 12%   DISK ▓░░░░ 11%   RAM ▓▓░░░ 12.35 / 31.74 GB
```

- **Real progress bars**, drawn with an embedded icon font, sharing the exact glyphs and fill algorithm of [Claude Rate Limit Status Bar](https://github.com/LetermeFlorent/claude-ratelimit-statusbar) so both extensions read as one band
- **Colour-coded per group**: green below 50 %, yellow below 75 %, orange below 90 %, red at 90 % and above
- **Either side of the bar.** One setting moves all three groups from left to right and back, with no window reload
- **Memory in GB to two decimals**, used against total, because "78 %" does not tell you whether the 4 GB you are about to allocate will fit
- **Nothing shifts.** Values are padded to a fixed width with figure spaces, trailing so each reading sits the same distance from its bar, and going from 9% to 100% does not slide every group along the bar
- **Hover** for the processor model, core count, exact free memory and the age of the last GPU sample

## Where the numbers come from

CPU and memory come from Node's own `os` module, so no process is spawned and the cost is not measurable. CPU is the average across every logical core, computed by differencing cumulative counters between two refreshes — the first tick shows `--` because a rate needs two samples.

GPU and disk both come from Windows performance counters, read through a single long-lived `typeperf` process. GPU is 3D engine utilisation; disk is busy time across every volume, the same figure Task Manager shows. Windows only; CPU and memory work everywhere.

`typeperf` only accepts localised counter names, so `\PhysicalDisk(_Total)\% Disk Time` is rejected outright on a French Windows. It does however accept a list in which only some counters resolve, as long as one of them does. Every known spelling is passed at once and the columns are resolved from the CSV header it returns, which keeps it to one process and one code path across locales.

**Why streaming and not a query per tick.** Three approaches were measured on the reference machine, an AMD Radeon integrated GPU with no `nvidia-smi`:

| Approach | Resident memory | CPU burned | Latency per tick |
| --- | --- | --- | --- |
| `typeperf` streaming | 12.1 MB | 0.42 s over 6 s, startup included | none, pushed |
| PowerShell `Get-Counter` daemon | 76 to 91 MB | 2.05 s over 12 s | none, pushed |
| `Get-Counter` spawned per tick | none | ~2.8 s wall per tick | 2.8 s |

A monitor that costs more than what it measures is worse than no monitor, which rules out the third row, and the second one wants 90 MB to report on your memory.

**The catch.** `typeperf` freezes its counter instance set at startup, so a program that starts using the GPU afterwards would never appear. The probe is recycled every five minutes to pick those up, and `sysmon.probeRestartSeconds` tunes that.

## Privacy

No telemetry, no analytics, no network access of any kind. The extension reads two Node built-ins and one Windows performance counter, all locally. Nothing leaves the machine.

## Settings

| Setting | Default | Description |
| --- | --- | --- |
| `sysmon.alignment` | `"left"` | Which side of the status bar to use, `left` or `right`. Applied without a reload |
| `sysmon.refreshSeconds` | `2` | Display refresh interval, in seconds (clamped to 1–60) |
| `sysmon.barWidth` | `5` | Bar width, in cells (clamped to 4–20) |
| `sysmon.showGpu` | `true` | Show the GPU group |
| `sysmon.showDisk` | `true` | Show the DISK group. With `showGpu`, turning both off stops the `typeperf` probe |
| `sysmon.probeRestartSeconds` | `300` | Probe recycle interval, in seconds (minimum 60) |

## Commands

| Command | What it does |
| --- | --- |
| `System Monitor: Relancer la sonde typeperf` | Restarts the probe immediately, from the command palette |

## Troubleshooting

**The bars render as empty boxes.** Restart VS Code — the icon font is loaded at startup, and a freshly installed extension does not get it until then.

**GPU or DISK shows `n/a`.** `typeperf` could not start, or neither spelling of the counter resolved. Check it by hand with `typeperf "\GPU Engine(*engtype_3D)\Utilization Percentage" -si 2 -sc 2`. On Windows builds where the performance counters have been disabled or corrupted, `lodctr /R` rebuilds them.

**A group is greyed out with a stale number.** No sample has arrived for thirty seconds. Run `System Monitor: Relancer la sonde typeperf` from the command palette.

**CPU sits at `--`.** Only expected on the very first tick. If it persists, the refresh timer is not firing — check that `sysmon.refreshSeconds` is a number and not a string.

**One `typeperf` process per open window.** Expected: each VS Code window runs its own extension host, so each has its own probe. Turn off both `sysmon.showGpu` and `sysmon.showDisk` in the windows where you do not need them and no process is spawned at all.

## License

MIT
