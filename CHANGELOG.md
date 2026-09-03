# Changelog

## 0.1.0

First release. Three indicators in the status bar: CPU load, GPU load and system
memory, with coloured bars and live values. Side of the bar is configurable,
left or right, applied without a window reload. GPU probe runs on a single
streaming `typeperf` process, recycled every five minutes.
