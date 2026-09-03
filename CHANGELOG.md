# Changelog

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
