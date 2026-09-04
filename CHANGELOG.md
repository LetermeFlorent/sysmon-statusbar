# Changelog

## 0.6.0

Disks get one group each, labelled with their own name rather than a single
`DISK` reading. Windows shows the volume letters (`C:`, `D: E:`), Linux the
device (`sda`, `nvme0n1`). The `DISK` label only remains while the probe has
not reported anything yet.

`diskDevices` changes meaning accordingly: it now lists the disks to display,
not the ones to fold into one aggregate figure. An empty list still means every
disk, so one plugged in later shows up on its own, and `System Monitor:
Choisir les disques affiches` ticks them off one by one. Unticking all of them
leaves no disk group at all, which is a decision rather than an oversight.

Status bar items are rebuilt only when the list of groups actually changes, so
a disk appearing or a box being unticked costs one rebuild, not one per tick.

## 0.5.1

Readings no longer change width, so nothing slides along the status bar when a
value crosses a step. The padding that existed for exactly that reason was
being stripped right before display, which let a reading swing between two and
four cells on its way from `9%` to `100%`. Percentages are now padded to the
width of `100%`, and memory to the width its own total will always occupy,
which keeps a 128 GB machine as steady as a 16 GB one.

This reverses the 0.2.1 trade-off knowingly: a reading like `2%` now carries
two trailing figure spaces. A little air before the next group costs less than
a band that shifts every few seconds.

## 0.5.0

Nothing is written to the status bar unless it actually changed. Labels never
change and a bar only moves when it crosses a fill step, yet every item was
being pushed twice a second for an identical result; each write crosses the
bridge to the UI process.

Tooltips are rebuilt on their own schedule, five seconds by default through the
new `tooltipSeconds` setting, instead of once per tick. VS Code does not
refresh a tooltip while it is on screen, so four `MarkdownString` per tick were
built for nobody. Tooltips of hidden groups are no longer built at all, the
processor model is read once instead of on every tick, and the whole
configuration is read once per render rather than a couple of dozen times
through nested calls.

macOS is a supported platform rather than a Linux probe that silently fails on
missing `/proc`. GPU comes from `ioreg`, trying `AGXAccelerator` then
`IOAccelerator` so Apple Silicon and Intel are both covered. Disk stays
unmeasured and displays `n/a`: macOS exposes no occupancy percentage without
privileges, and deriving a fake one from throughput would be worse than
admitting it. This probe has not been validated on real hardware.

New `pauseWhenUnfocused` setting, on by default, stops the GPU and disk probe
while the window sits in the background. Three open windows used to mean three
processes measuring the same machine. `unfocusedMultiplier` slows the refresh
down in the same situation.

A probe restart no longer flashes the bars grey. Going through the `starting`
state does not invalidate a sample that is under thirty seconds old.

## 0.4.0

DISK now reports one number per physical device on hover, not just the
aggregate shown in the status bar: Windows queries every `PhysicalDisk`
instance instead of only `_Total`, Linux reads every whole device from
`/proc/diskstats` instead of keeping only the busiest one. A new command,
`System Monitor: Choisir les disques affiches`, checklists the disks seen so
far and lets you narrow the DISK value to a subset, and leaving everything
checked keeps the previous behaviour.

## 0.3.0

GPU and disk now work on Linux, not just Windows. Disk reads `/proc/diskstats`
directly, no process needed. GPU auto-detects at startup: `gpu_busy_percent`
under `/sys/class/drm` if the kernel exposes it (AMD, some newer Intel setups),
otherwise `nvidia-smi` invoked once per refresh rather than streamed, since its
own startup cost is negligible compared to what streaming was built to avoid on
Windows. CPU and memory were already cross-platform. Windows behaviour is
unchanged, still on `typeperf`.

## 0.2.2

Values follow the theme instead of the load colour. A status bar item carries a
single colour, so the reading now lives in its own item with no explicit colour,
which makes VS Code apply `statusBar.foreground` to it: dark on a light theme,
light on a dark one. Only the bar stays tinted by load. The trade-off is the
margin VS Code inserts between items, which no extension can shrink.

## 0.2.1

Percentages pad to three characters instead of four. Aligning on `100%` put two
figure spaces after a reading like `2%`, which stacked on top of the margin VS
Code already inserts between items and left a visible hole before the next
group. Only single-digit readings are padded now, and `100%` overflows by one
cell for as long as it lasts.

## 0.2.0

Every part of the display can now be turned off. `showCpu` and `showRam` join
the existing `showGpu` and `showDisk`, and `showLabels`, `showBars` and
`showValues` control the three pieces each group is made of. Turning off both
GPU and disk still stops the `typeperf` process; turning off both bars and
values hides the groups entirely rather than leaving bare labels behind.

## 0.1.2

Padding moved to the end of each value. With it at the front, a short reading
like `4%` sat further from its bar than `100%` did from its own; now every value
starts at the same distance from its bar and the alignment happens on the right.

## 0.1.1

Own icon, no longer borrowed from the sibling extension. Bar and value now share
a single status bar item so nothing sits in the gap VS Code inserts between
items.

## 0.1.0

First release. Four indicators in the status bar: CPU load, GPU load, disk
activity and system memory, with coloured bars and live values. Side of the bar
is configurable, left or right, applied without a window reload. GPU and disk
share a single streaming `typeperf` process, recycled every five minutes, with
counter names resolved per locale.
