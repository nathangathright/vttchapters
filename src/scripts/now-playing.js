const BASE_URL = (import.meta.env.BASE_URL || "/").replace(/\/?$/, "/");

const DEMO_PATHS = {
  audio: `${BASE_URL}demo/episode.wav`,
  chapters: `${BASE_URL}demo/chapters.vtt`,
  metadata: `${BASE_URL}demo/metadata.vtt`,
};

function parseTimestamp(value) {
  const [hours, minutes, seconds] = value.split(":");
  return (
    Number(hours) * 3600 +
    Number(minutes) * 60 +
    Number(seconds.replace(",", "."))
  );
}

function formatTime(value) {
  const totalSeconds = Math.max(0, Math.floor(value));
  const minutes = String(Math.floor(totalSeconds / 60)).padStart(2, "0");
  const seconds = String(totalSeconds % 60).padStart(2, "0");
  return `${minutes}:${seconds}`;
}

function parseVtt(text) {
  const cues = [];
  const lines = text.replace(/\r/g, "").split("\n");
  let index = 0;

  while (index < lines.length) {
    const line = lines[index].trim();

    if (!line || line === "WEBVTT" || line.startsWith("NOTE")) {
      index += 1;
      continue;
    }

    let cueId = null;
    let timingLine = line;

    if (!line.includes("-->")) {
      cueId = line;
      index += 1;
      timingLine = (lines[index] || "").trim();
    }

    if (!timingLine.includes("-->")) {
      index += 1;
      continue;
    }

    const [startValue, endChunk] = timingLine.split("-->");
    const endValue = endChunk.trim().split(/\s+/)[0];
    index += 1;

    const textLines = [];
    while (index < lines.length && lines[index].trim() !== "") {
      textLines.push(lines[index]);
      index += 1;
    }

    cues.push({
      id: cueId,
      start: parseTimestamp(startValue.trim()),
      end: parseTimestamp(endValue.trim()),
      text: textLines.join("\n").trim(),
    });

    index += 1;
  }

  return cues;
}

function cueKey(cue) {
  return `${cue.start}-${cue.end}`;
}

function findCueAtTime(cues, time) {
  return cues.find((cue) => time >= cue.start && time < cue.end) || null;
}

function resolveCueAtTime(cues, time) {
  const activeCue = findCueAtTime(cues, time);

  if (activeCue) {
    return activeCue;
  }

  if (!cues.length) {
    return null;
  }

  if (time >= cues[cues.length - 1].end) {
    return cues[cues.length - 1];
  }

  return cues[0];
}

function parseMetadataPayload(cue) {
  try {
    const payload = JSON.parse(cue.text);
    const metadataBaseUrl = new URL(
      DEMO_PATHS.metadata,
      window.location.origin
    ).toString();

    if (payload.img) {
      payload.img = new URL(payload.img, metadataBaseUrl).toString();
    }
    if (payload.url && !payload.url.startsWith("http")) {
      payload.url = new URL(payload.url, metadataBaseUrl).toString();
    }
    return payload;
  } catch (error) {
    return {
      title: "Invalid metadata payload",
      toc: true,
      url: null,
    };
  }
}

function waitForNativeCues(track, trackElement, timeoutMs = 1500) {
  return new Promise((resolve) => {
    if (!track) {
      resolve(false);
      return;
    }

    track.mode = "hidden";

    if (track.cues && track.cues.length > 0) {
      resolve(true);
      return;
    }

    let finished = false;

    const complete = (result) => {
      if (finished) return;
      finished = true;
      clearInterval(intervalId);
      clearTimeout(timeoutId);
      if (trackElement) {
        trackElement.removeEventListener("load", handleLoad);
        trackElement.removeEventListener("error", handleError);
      }
      resolve(result);
    };

    const handleLoad = () => {
      if (track.cues && track.cues.length > 0) {
        complete(true);
      }
    };

    const handleError = () => complete(false);

    if (trackElement) {
      trackElement.addEventListener("load", handleLoad);
      trackElement.addEventListener("error", handleError);
    }

    const intervalId = setInterval(() => {
      if (track.cues && track.cues.length > 0) {
        complete(true);
      }
    }, 100);

    const timeoutId = setTimeout(() => complete(false), timeoutMs);
  });
}

function createFallbackTrack(player, kind, label, cues) {
  const CueConstructor =
    window.VTTCue || window.WebKitVTTCue || window.TextTrackCue;

  if (!CueConstructor) {
    return null;
  }

  const track = player.addTextTrack(kind, label, "en");
  track.mode = "hidden";

  cues.forEach((cue) => {
    track.addCue(new CueConstructor(cue.start, cue.end, cue.text));
  });

  return track;
}

function findVisibleNavigation(activeChapter, visibleChapters, time) {
  const activeIndex = visibleChapters.findIndex(
    (chapter) => cueKey(chapter) === cueKey(activeChapter)
  );

  if (activeIndex >= 0) {
    return {
      previous: visibleChapters[activeIndex - 1] || null,
      next: visibleChapters[activeIndex + 1] || null,
    };
  }

  let previous = null;
  let next = null;

  for (const chapter of visibleChapters) {
    if (chapter.start < time) {
      previous = chapter;
      continue;
    }

    if (chapter.start > time) {
      next = chapter;
      break;
    }
  }

  return { previous, next };
}

function updatePlayButton(player, button) {
  const isPaused = player.paused;
  button.setAttribute("aria-label", isPaused ? "Play" : "Pause");
  document.getElementById("play-icon")?.classList.toggle("is-hidden", !isPaused);
  document.getElementById("pause-icon")?.classList.toggle("is-hidden", isPaused);
}

function createExternalLinkIcon() {
  return `
    <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M15 3h6v6" />
      <path d="M10 14 21 3" />
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
    </svg>
  `;
}

function buildTocList(listElement, chapters, onSelect) {
  listElement.innerHTML = "";

  chapters.forEach((chapter) => {
    const item = document.createElement("li");
    const row = document.createElement("div");
    row.className = "toc-item-row";
    const button = document.createElement("button");
    button.type = "button";
    button.className = "toc-item-button";
    button.dataset.key = cueKey(chapter);
    button.innerHTML = `
      <span class="toc-item-title">${chapter.title}</span>
      <span class="toc-item-time">${formatTime(chapter.start)}</span>
    `;
    button.addEventListener("click", () => onSelect(chapter.start));
    row.appendChild(button);

    if (chapter.metadata?.url) {
      const link = document.createElement("a");
      link.className = "toc-item-link";
      link.href = chapter.metadata.url;
      link.target = "_blank";
      link.rel = "noreferrer";
      link.ariaLabel = `Open link for ${chapter.title}`;
      link.innerHTML = createExternalLinkIcon();
      row.appendChild(link);
    }

    item.appendChild(row);
    listElement.appendChild(item);
  });
}

export default async function initNowPlaying() {
  const player = document.getElementById("player");
  const episodeArt = document.getElementById("episode-art");
  const activeLink = document.getElementById("active-link");
  const activeTitle = document.getElementById("active-title");
  const chapterPosition = document.getElementById("chapter-position");
  const tocTrigger = document.getElementById("toc-trigger");
  const tocDialog = document.getElementById("toc-dialog");
  const closeTocButton = document.getElementById("close-toc");
  const tocList = document.getElementById("toc-list");
  const previousChapterButton = document.getElementById("prev-chapter");
  const nextChapterButton = document.getElementById("next-chapter");
  const skipBackwardButton = document.getElementById("skip-backward");
  const skipForwardButton = document.getElementById("skip-forward");
  const togglePlayButton = document.getElementById("toggle-play");

  player.src = DEMO_PATHS.audio;

  const [chapterText, metadataText] = await Promise.all([
    fetch(DEMO_PATHS.chapters).then((response) => response.text()),
    fetch(DEMO_PATHS.metadata).then((response) => response.text()),
  ]);

  const chapterCues = parseVtt(chapterText);
  const metadataCues = parseVtt(metadataText).map((cue) => ({
    ...cue,
    metadata: parseMetadataPayload(cue),
  }));

  const metadataByKey = new Map(
    metadataCues.map((cue) => [cueKey(cue), cue.metadata])
  );

  const allChapters = chapterCues.map((cue) => {
    const metadata = metadataByKey.get(cueKey(cue));
    return {
      ...cue,
      title: cue.text,
      metadata,
    };
  });

  const visibleChapters = allChapters.filter(
    (chapter) => chapter.metadata?.toc !== false
  );

  const nativeChapterTrackElement = document.createElement("track");
  nativeChapterTrackElement.kind = "chapters";
  nativeChapterTrackElement.label = "Chapter labels";
  nativeChapterTrackElement.srclang = "en";
  nativeChapterTrackElement.src = DEMO_PATHS.chapters;
  player.appendChild(nativeChapterTrackElement);

  const nativeMetadataTrackElement = document.createElement("track");
  nativeMetadataTrackElement.kind = "metadata";
  nativeMetadataTrackElement.label = "Chapter metadata";
  nativeMetadataTrackElement.srclang = "en";
  nativeMetadataTrackElement.src = DEMO_PATHS.metadata;
  player.appendChild(nativeMetadataTrackElement);

  nativeChapterTrackElement.track.mode = "hidden";
  nativeMetadataTrackElement.track.mode = "hidden";

  const [hasNativeChapterCues, hasNativeMetadataCues] = await Promise.all([
    waitForNativeCues(nativeChapterTrackElement.track, nativeChapterTrackElement),
    waitForNativeCues(nativeMetadataTrackElement.track, nativeMetadataTrackElement),
  ]);

  if (!hasNativeChapterCues) {
    createFallbackTrack(player, "chapters", "Chapter labels (fallback)", chapterCues);
  }

  if (!hasNativeMetadataCues) {
    createFallbackTrack(
      player,
      "metadata",
      "Chapter metadata (fallback)",
      metadataCues
    );
  }

  function seekTo(time) {
    player.currentTime = Math.max(0, Math.min(time, player.duration || time));
  }

  buildTocList(tocList, visibleChapters, (time) => {
    seekTo(time);
    tocDialog.close();
    player.play().catch(() => {});
  });

  tocTrigger.addEventListener("click", () => {
    if (typeof tocDialog.showModal === "function") {
      tocDialog.showModal();
    } else {
      tocDialog.setAttribute("open", "true");
    }
  });

  closeTocButton.addEventListener("click", () => {
    tocDialog.close();
  });

  tocDialog.addEventListener("click", (event) => {
    const rect = tocDialog.getBoundingClientRect();
    const isBackdropClick =
      event.clientX < rect.left ||
      event.clientX > rect.right ||
      event.clientY < rect.top ||
      event.clientY > rect.bottom;

    if (isBackdropClick) {
      tocDialog.close();
    }
  });

  previousChapterButton.addEventListener("click", () => {
    const activeChapter = findCueAtTime(allChapters, player.currentTime) || allChapters[0];
    const navigation = findVisibleNavigation(
      activeChapter,
      visibleChapters,
      player.currentTime
    );

    if (navigation.previous) {
      seekTo(navigation.previous.start);
      player.play().catch(() => {});
    }
  });

  nextChapterButton.addEventListener("click", () => {
    const activeChapter = findCueAtTime(allChapters, player.currentTime) || allChapters[0];
    const navigation = findVisibleNavigation(
      activeChapter,
      visibleChapters,
      player.currentTime
    );

    if (navigation.next) {
      seekTo(navigation.next.start);
      player.play().catch(() => {});
    }
  });

  skipBackwardButton.addEventListener("click", () => {
    seekTo((player.currentTime || 0) - 15);
  });

  skipForwardButton.addEventListener("click", () => {
    seekTo((player.currentTime || 0) + 30);
  });

  togglePlayButton.addEventListener("click", () => {
    if (player.paused) {
      player.play().catch(() => {});
      return;
    }

    player.pause();
  });

  function syncUI() {
    const time = player.currentTime || 0;
    const activeChapter = resolveCueAtTime(allChapters, time);
    const activeMetadata =
      resolveCueAtTime(metadataCues, time)?.metadata || activeChapter?.metadata || null;
    const navigation = activeChapter
      ? findVisibleNavigation(activeChapter, visibleChapters, time)
      : { previous: null, next: null };

    activeTitle.textContent =
      activeMetadata?.title || activeChapter?.title || "No active chapter";

    const visibleIndex = visibleChapters.findIndex(
      (chapter) => activeChapter && cueKey(chapter) === cueKey(activeChapter)
    );
    const visibleBeforeCount = visibleChapters.filter(
      (chapter) => chapter.start <= time
    ).length;
    const currentVisiblePosition =
      visibleIndex >= 0
        ? visibleIndex + 1
        : Math.max(1, Math.min(visibleBeforeCount, visibleChapters.length));
    chapterPosition.textContent = `${currentVisiblePosition} of ${visibleChapters.length}`;

    if (activeMetadata?.img) {
      episodeArt.src = activeMetadata.img;
      episodeArt.alt = activeMetadata.title || activeChapter?.title || "Chapter artwork";
    }

    if (activeMetadata?.url) {
      activeLink.href = activeMetadata.url;
      activeLink.classList.remove("is-hidden");
    } else {
      activeLink.href = "#";
      activeLink.classList.add("is-hidden");
    }

    tocList.querySelectorAll(".toc-item-button").forEach((button) => {
      const isActive = activeChapter && button.dataset.key === cueKey(activeChapter);
      button.classList.toggle("is-active", Boolean(isActive));
      button.setAttribute("aria-current", isActive ? "true" : "false");
    });

    previousChapterButton.disabled = !navigation.previous;
    nextChapterButton.disabled = !navigation.next;
    updatePlayButton(player, togglePlayButton);
  }

  player.addEventListener("play", () =>
    updatePlayButton(player, togglePlayButton)
  );
  player.addEventListener("pause", () =>
    updatePlayButton(player, togglePlayButton)
  );
  player.addEventListener("loadedmetadata", syncUI);
  player.addEventListener("timeupdate", syncUI);
  player.addEventListener("seeked", syncUI);
  syncUI();
}
