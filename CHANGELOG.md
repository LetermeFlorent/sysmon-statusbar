# Changelog

## 0.1.0

First release. Four indicators in the status bar: CPU load, GPU load, disk
activity and system memory, with coloured bars and live values. Side of the bar
is configurable, left or right, applied without a window reload. GPU and disk
share a single streaming `typeperf` process, recycled every five minutes, with
counter names resolved per locale.
