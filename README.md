# System Monitor Status Bar

[![Version](https://img.shields.io/visual-studio-marketplace/v/letermeflorent.sysmon-statusbar?label=marketplace)](https://marketplace.visualstudio.com/items?itemName=letermeflorent.sysmon-statusbar)
[![Installs](https://img.shields.io/visual-studio-marketplace/i/letermeflorent.sysmon-statusbar)](https://marketplace.visualstudio.com/items?itemName=letermeflorent.sysmon-statusbar)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

**Know what your machine is doing without leaving the editor.** CPU load, GPU load and system memory, as real coloured progress bars in the VS Code status bar, on whichever side you want them.

```
CPU ▓▓▓░░░░░ 34%   GPU ▓░░░░░░░ 12%   RAM ▓▓▓░░░░░ 12.35 / 31.74 GB
```

## What is measured

CPU is the average load across every logical core, computed by differencing the
system's cumulative counters between two refreshes.

GPU is 3D engine utilisation, read from the Windows `GPU Engine` performance
counter. Windows only. CPU and memory work everywhere.

RAM is system memory, the whole machine and not just VS Code.

## Why a streaming probe

The GPU reading comes from a single long-lived `typeperf` process rather than a
fresh query on every refresh. Measured on the reference machine:

| Approach | Resident memory | CPU burned | Latency per tick |
|---|---|---|---|
| `typeperf` streaming | 12.1 MB | 0.42 s over 6 s, startup included | none, pushed |
| PowerShell `Get-Counter` daemon | 76 to 91 MB | 2.05 s over 12 s | none, pushed |
| `Get-Counter` spawned per tick | none | ~2.8 s wall per tick | 2.8 s |

A monitor that costs more than what it measures is worse than no monitor. Hence
the first row.

`typeperf` freezes its counter instance set when it starts, so a program that
begins using the GPU afterwards would never show up. The probe is recycled every
five minutes to pick those up. The interval is configurable.

## Settings

`sysmon.alignment` puts the indicators on the left or the right of the status
bar. Takes effect immediately, no window reload.

`sysmon.refreshSeconds` sets the refresh interval, 2 by default, clamped between
1 and 60.

`sysmon.barWidth` sets the width of each bar in cells, 8 by default, clamped
between 4 and 20.

`sysmon.showGpu` hides the GPU group and stops the `typeperf` probe with it.

`sysmon.gpuRestartSeconds` sets the probe recycle interval, 300 by default,
minimum 60.

## Command

`System Monitor: Relancer la sonde GPU` restarts `typeperf` right away. Clicking
the GPU group does the same.

## Colours

Green below 50%, yellow from 50%, orange from 75%, red from 90%. Grey when a
reading is unavailable or older than thirty seconds. These are fixed hex values,
identical in light and dark themes, matching
[claude-ratelimit-statusbar](https://github.com/LetermeFlorent/claude-ratelimit-statusbar)
so both extensions read as one band.

## Development

No dependencies, no build step.

```bash
node --test
code --extensionDevelopmentPath=. --new-window
npx @vscode/vsce package
```
