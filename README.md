# System Monitor Status Bar

Is it your build, or is it your machine? CPU, GPU, disk and system memory as real coloured progress bars in the VS Code status bar, on whichever side you want them.

![CPU, GPU, disk and memory in the VS Code status bar](https://raw.githubusercontent.com/LetermeFlorent/sysmon-statusbar/master/media/statusbar.png)

## The problem

Something is slow, and you have no idea which resource ran out. Alt-tabbing to Task Manager tells you three seconds later, about a moment that has already passed, in a window that now has focus and is itself skewing the reading. Meanwhile the monitors that do live in the editor tend to cost more than what they measure: one of them shells out to PowerShell on every refresh and burns nearly three seconds of wall time per tick to tell you your CPU is busy.

## What you get

Four groups, always visible, updating on their own:

```
CPU ▓▓░░░ 34%   GPU ░░░░░ 12%   DISK ▓░░░░ 11%   RAM ▓▓░░░ 12.35 / 31.74 GB
```

Bars are drawn with an embedded icon font, sharing the exact glyphs and fill algorithm of [Claude Rate Limit Status Bar](https://github.com/LetermeFlorent/claude-ratelimit-statusbar) so both extensions read as one band. Colour lives on the bar alone: green below 50 %, yellow below 75 %, orange below 90 %, red at 90 % and above. Labels and readings follow `statusBar.foreground`, which keeps them legible on light and dark themes alike.

One setting moves every group from left to right and back, with no window reload. Memory is shown in GB to two decimals, used against total, because "78 %" does not tell you whether the 4 GB you are about to allocate will fit. Values are padded to a fixed width with figure spaces, trailing, so each reading sits the same distance from its bar and going from 9 % to 100 % does not slide the whole band along.

Hovering gives the processor model, core count, exact free memory and the age of the last GPU sample. On DISK, you get the per-device breakdown and a link to choose which ones count.

## Where the numbers come from

CPU and memory come from Node's own `os` module, so no process is spawned and the cost is not measurable. This part is identical on Windows, Linux and macOS. CPU is the average across every logical core, computed by differencing cumulative counters between two refreshes, which is why the first tick shows `--`: a rate needs two samples.

GPU and disk are platform-specific, each with its own source.

On Windows, both come from performance counters read through a single long-lived `typeperf` process. GPU is 3D engine utilisation; disk is queried per physical device (`0 C:`, `1 D:`, and so on) plus the `_Total` instance Windows already aggregates.

`typeperf` only accepts localised counter names, so `\PhysicalDisk(_Total)\% Disk Time` is rejected outright on a French Windows. It does however accept a list in which only some counters resolve, as long as one of them does. Every known spelling is passed at once and the columns are resolved from the CSV header it returns, which keeps it to one process and one code path across locales.

On Linux, disk comes from `/proc/diskstats`: field 13 is the milliseconds spent doing I/O on that device, the same counter `iostat` derives `%util` from. Reading it needs no process at all, just a file read, cheaper than the Windows path. Every whole disk is read individually, partitions and virtual devices such as `loop0` or `dm-0` excluded.

GPU on Linux is auto-detected once at startup, in this order: `/sys/class/drm/card*/device/gpu_busy_percent` if the kernel exposes it, which covers AMD's `amdgpu` driver and some newer Intel setups, otherwise `nvidia-smi` if it resolves on `PATH`. Unlike the Windows probe, `nvidia-smi` is invoked once per refresh rather than streamed, because its own startup cost is a few tens of milliseconds, negligible next to the nearly three seconds a spawned PowerShell process costs, which is exactly what streaming was built to avoid on Windows. If neither source is available, the group greys out with `--`, the same degraded state as a missing `typeperf`.

On macOS, GPU comes from `ioreg`, reading the `PerformanceStatistics` dictionary of the graphics accelerator. Both `AGXAccelerator` (Apple Silicon) and `IOAccelerator` (Intel and AMD) are tried, and the first one that answers is kept. Disk is deliberately left unmeasured and shows `n/a`: macOS exposes no occupancy percentage without privileges, since `iostat` reports throughput rather than busy time and `fs_usage` needs root. Turning a throughput into a percentage would produce a number that looks right and means nothing.

### Why the Windows GPU probe streams instead of querying per tick

Three approaches were measured on the reference machine, an AMD Radeon integrated GPU with no `nvidia-smi`:

| Approach | Resident memory | CPU burned | Latency per tick |
| --- | --- | --- | --- |
| `typeperf` streaming | 12.1 MB | 0.42 s over 6 s, startup included | none, pushed |
| PowerShell `Get-Counter` daemon | 76 to 91 MB | 2.05 s over 12 s | none, pushed |
| `Get-Counter` spawned per tick | none | ~2.8 s wall per tick | 2.8 s |

A monitor that costs more than what it measures is worse than no monitor, which rules out the third row, and the second one wants 90 MB to report on your memory.

The catch: `typeperf` freezes its counter instance set at startup, so a program that starts using the GPU afterwards would never appear. The probe is recycled every five minutes to pick those up, and `sysmon.probeRestartSeconds` tunes that.

## What it costs to run

The display only writes to the status bar when something actually changed. Labels never change and a bar only moves when it crosses a fill step, so most ticks push nothing at all across the bridge to the UI process.

Tooltips are rebuilt on their own schedule, five seconds by default, rather than once per tick. VS Code does not refresh a tooltip while it is being hovered, so rebuilding four of them every two seconds served nobody.

While a window sits in the background its probe is stopped and its refresh slowed down. Without that, three open windows meant three processes measuring the same machine. Set `pauseWhenUnfocused` to `false` if you keep an eye on the bar in a window that does not have focus.

## Privacy

No telemetry, no analytics, no network access of any kind. The extension reads two Node built-ins and, depending on platform, a Windows performance counter, a Linux sysfs or proc file, or the macOS registry through `ioreg`, all locally. Nothing leaves the machine.

## Settings

| Setting | Default | Description |
| --- | --- | --- |
| `sysmon.alignment` | `"left"` | Which side of the status bar to use, `left` or `right`. Applied without a reload |
| `sysmon.refreshSeconds` | `2` | Display refresh interval, in seconds (clamped to 1-60) |
| `sysmon.barWidth` | `5` | Bar width, in cells (clamped to 4-20) |
| `sysmon.showCpu` | `true` | Show the CPU group |
| `sysmon.showGpu` | `true` | Show the GPU group |
| `sysmon.showDisk` | `true` | Show the DISK group |
| `sysmon.showRam` | `true` | Show the RAM group |
| `sysmon.diskDevices` | `[]` | Disks to count in the DISK value, by name (`"0 C:"` on Windows, `"sda"` on Linux). Empty means every disk, the default. Easiest to set through the `System Monitor: Choisir les disques affiches` command rather than typed by hand |
| `sysmon.showLabels` | `true` | Show the `CPU` / `GPU` / `DISK` / `RAM` label of each group |
| `sysmon.showBars` | `true` | Show the progress bar of each group |
| `sysmon.showValues` | `true` | Show the numeric value of each group |
| `sysmon.probeRestartSeconds` | `300` | Probe recycle interval, in seconds (minimum 60) |
| `sysmon.tooltipSeconds` | `5` | How often tooltips are rebuilt, in seconds |
| `sysmon.pauseWhenUnfocused` | `true` | Stop the GPU and disk probe while the window has no focus |
| `sysmon.unfocusedMultiplier` | `4` | Refresh interval multiplier while the window has no focus |

Turning off both `showGpu` and `showDisk` stops the probe entirely, so on Windows no `typeperf` process is spawned, and on Linux with an NVIDIA card no `nvidia-smi` invocation happens. Turning off both `showBars` and `showValues` hides every group, label included, since a lone label says nothing.

Some combinations worth knowing:

```
everything on              CPU ▓▓░░░ 34%   GPU ░░░░░ 12%   RAM ▓▓░░░ 12.35 / 31.74 GB
showLabels false           ▓▓░░░ 34%   ░░░░░ 12%   ▓▓░░░ 12.35 / 31.74 GB
showBars false             CPU 34%   GPU 12%   RAM 12.35 / 31.74 GB
showValues false           CPU ▓▓░░░   GPU ░░░░░   RAM ▓▓░░░
showCpu/showGpu false      DISK ▓░░░░ 11%   RAM ▓▓░░░ 12.35 / 31.74 GB
```

## Commands

| Command | What it does |
| --- | --- |
| `System Monitor: Relancer la sonde GPU/disque` | Restarts the probe immediately, from the command palette |
| `System Monitor: Choisir les disques affiches` | Checklist of every disk seen so far. Leave everything checked for the default, where every disk counts, or uncheck some to only count the ones left. Also reachable from the DISK hover |

## Troubleshooting

If the bars render as empty boxes, restart VS Code. The icon font is loaded at startup, and a freshly installed extension does not get it until then.

If GPU or DISK shows `--` in grey and stays there: on Windows, `typeperf` could not start or neither spelling of the counter resolved. Check it by hand with `typeperf "\GPU Engine(*engtype_3D)\Utilization Percentage" -si 2 -sc 2`, and on builds where the performance counters have been disabled or corrupted, `lodctr /R` rebuilds them. On Linux, GPU stays `--` when neither `gpu_busy_percent` nor `nvidia-smi` was found at startup; run `System Monitor: Relancer la sonde GPU/disque` after installing drivers to re-detect without restarting the window. `/proc/diskstats` is present on every real Linux kernel, so DISK staying `--` there points at something else, most likely a container or an unusually locked-down `/proc`.

On macOS, DISK showing `n/a` is expected and permanent, since the platform exposes no occupancy percentage without privileges. GPU showing `n/a` means neither accelerator class answered; `ioreg -r -d 1 -w 0 -c AGXAccelerator | grep Utilization` tells you whether the counter exists on your hardware.

A group greyed out with a stale number means no sample has arrived for thirty seconds. Run `System Monitor: Relancer la sonde GPU/disque` from the command palette.

CPU sitting at `--` is only expected on the very first tick. If it persists, the refresh timer is not firing: check that `sysmon.refreshSeconds` is a number and not a string.

Each VS Code window runs its own extension host, so each has its own probe. Since 0.5.0 the probe stops while a window is in the background, which in practice leaves one active probe at a time. Turning off both `sysmon.showGpu` and `sysmon.showDisk` in the windows where you do not need them spawns no process at all.

## License

MIT
