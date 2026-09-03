# System Monitor Status Bar

[![Version](https://img.shields.io/visual-studio-marketplace/v/letermeflorent.sysmon-statusbar?label=marketplace)](https://marketplace.visualstudio.com/items?itemName=letermeflorent.sysmon-statusbar)
[![Installs](https://img.shields.io/visual-studio-marketplace/i/letermeflorent.sysmon-statusbar)](https://marketplace.visualstudio.com/items?itemName=letermeflorent.sysmon-statusbar)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

**Is it your build, or is it your machine?** CPU, GPU and system memory as real coloured progress bars in the VS Code status bar, on whichever side you want them.

## The problem

Something is slow, and you have no idea which resource ran out. Alt-tabbing to Task Manager tells you — three seconds later, about a moment that has already passed, in a window that now has focus and is itself skewing the reading. Meanwhile the monitors that do live in the editor tend to cost more than what they measure: one of them shells out to PowerShell on every refresh and burns nearly three seconds of wall time per tick to tell you your CPU is busy.

## What you get

Three groups, always visible, updating on their own:

```
CPU ▓▓▓░░░░░ 34%   GPU ▓░░░░░░░ 12%   RAM ▓▓▓░░░░░ 12.35 / 31.74 GB
```

- **Real progress bars**, drawn with an embedded icon font, sharing the exact glyphs and fill algorithm of [Claude Rate Limit Status Bar](https://github.com/LetermeFlorent/claude-ratelimit-statusbar) so both extensions read as one band
- **Colour-coded per group**: green below 50 %, yellow below 75 %, orange below 90 %, red at 90 % and above
- **Either side of the bar.** One setting moves all three groups from right to left and back, with no window reload
- **Memory in GB to two decimals**, used against total, because "78 %" does not tell you whether the 4 GB you are about to allocate will fit
- **Hover** for the processor model, core count, exact free memory and the age of the last GPU sample

## Where the numbers come from

CPU and memory come from Node's own `os` module, so no process is spawned and the cost is not measurable. CPU is the average across every logical core, computed by differencing cumulative counters between two refreshes — the first tick shows `--` because a rate needs two samples.

GPU is 3D engine utilisation, read from the Windows `GPU Engine` performance counter through a single long-lived `typeperf` process. Windows only; CPU and memory work everywhere.

**Why streaming and not a query per tick.** Three approaches were measured on the reference machine, an AMD Radeon integrated GPU with no `nvidia-smi`:

| Approach | Resident memory | CPU burned | Latency per tick |
| --- | --- | --- | --- |
| `typeperf` streaming | 12.1 MB | 0.42 s over 6 s, startup included | none, pushed |
| PowerShell `Get-Counter` daemon | 76 to 91 MB | 2.05 s over 12 s | none, pushed |
| `Get-Counter` spawned per tick | none | ~2.8 s wall per tick | 2.8 s |

A monitor that costs more than what it measures is worse than no monitor, which rules out the third row, and the second one wants 90 MB to report on your memory.

**The catch.** `typeperf` freezes its counter instance set at startup, so a program that starts using the GPU afterwards would never appear. The probe is recycled every five minutes to pick those up, and `sysmon.gpuRestartSeconds` tunes that.

## Privacy

No telemetry, no analytics, no network access of any kind. The extension reads two Node built-ins and one Windows performance counter, all locally. Nothing leaves the machine.

## Settings

| Setting | Default | Description |
| --- | --- | --- |
| `sysmon.alignment` | `"right"` | Which side of the status bar to use, `left` or `right`. Applied without a reload |
| `sysmon.refreshSeconds` | `2` | Display refresh interval, in seconds (clamped to 1–60) |
| `sysmon.barWidth` | `8` | Bar width, in cells (clamped to 4–20) |
| `sysmon.showGpu` | `true` | Show the GPU group. `false` also stops the `typeperf` probe |
| `sysmon.gpuRestartSeconds` | `300` | Probe recycle interval, in seconds (minimum 60) |

## Commands

| Command | What it does |
| --- | --- |
| `System Monitor: Relancer la sonde GPU` | Restarts `typeperf` immediately. Clicking the GPU group does the same |

## Troubleshooting

**The bars render as empty boxes.** Restart VS Code — the icon font is loaded at startup, and a freshly installed extension does not get it until then.

**GPU shows `n/a`.** `typeperf` could not start, or the `GPU Engine` counter is unavailable. Check it by hand with `typeperf "\GPU Engine(*engtype_3D)\Utilization Percentage" -si 2 -sc 2`. On Windows builds where the performance counters have been disabled or corrupted, `lodctr /R` rebuilds them.

**GPU is greyed out with a stale number.** No sample has arrived for thirty seconds. Click the group to restart the probe.

**CPU sits at `--`.** Only expected on the very first tick. If it persists, the refresh timer is not firing — check that `sysmon.refreshSeconds` is a number and not a string.

**One `typeperf` process per open window.** Expected: each VS Code window runs its own extension host, so each has its own probe. Set `sysmon.showGpu` to `false` in the windows where you do not need it.

## License

MIT
