# VTT Chapters Now Playing Demo

This repo is an Astro web app that demonstrates a podcast app style "Now Playing"
screen powered by local WebVTT chapter and metadata files.

Live demo:

https://nathangathright.github.io/vttchapters/

What it shows:

- A chapter timeline driven by `chapters.vtt`
- A now-playing card driven by `metadata.vtt`
- `toc: false` cues that stay active for app logic while remaining hidden from the visible table of contents
- Cross-browser fallback handling when text track cues are not exposed consistently
