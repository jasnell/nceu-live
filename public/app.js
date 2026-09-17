const defaultTitle = document.title;
const playerFrame = document.querySelector("#player-frame");
const standby = document.querySelector("#standby");
const standbyTitle = document.querySelector("#standby-title");
const standbyMessage = document.querySelector("#standby-message");
const retryButton = document.querySelector("#retry-stream");
const liveStatus = document.querySelector("#live-status");
const liveStatusLabel = document.querySelector("#live-status-label");
const viewerCount = document.querySelector("#viewer-count");
const viewerCountLabel = document.querySelector("#viewer-count-label");
const bolognaClock = document.querySelector("#bologna-clock");
const viewerClock = document.querySelector("#viewer-clock");
const currentSessionLabel = document.querySelector("#current-session-label");
const currentSessionTime = document.querySelector("#current-session-time");
const currentSessionTitle = document.querySelector("#current-session-title");
const currentSessionPeople = document.querySelector("#current-session-people");
const nextSession = document.querySelector("#next-session");
const nextSessionTime = document.querySelector("#next-session-time");
const nextSessionTitle = document.querySelector("#next-session-title");
const nextSessionPeople = document.querySelector("#next-session-people");
const directPlayerLinks = document.querySelectorAll("[data-direct-player]");
const themeColor = document.querySelector("#theme-color");
const themeButtons = document.querySelectorAll("[data-theme-value]");

let activePlayerUrl = null;
let refreshPromise = null;
let programDocument = null;
let programEntries = [];
let programRefreshPromise = null;
let programMinute = null;
const viewerCountFormatter = new Intl.NumberFormat("en");
const bolognaTimeFormatter = new Intl.DateTimeFormat(undefined, {
  hour: "numeric",
  minute: "2-digit",
  second: "2-digit",
  timeZone: "Europe/Rome",
});
const viewerTimeFormatter = new Intl.DateTimeFormat(undefined, {
  hour: "numeric",
  minute: "2-digit",
  second: "2-digit",
});
const bolognaTimeLabelFormatter = new Intl.DateTimeFormat(undefined, {
  weekday: "long",
  year: "numeric",
  month: "long",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
  second: "2-digit",
  timeZone: "Europe/Rome",
  timeZoneName: "short",
});
const viewerTimeLabelFormatter = new Intl.DateTimeFormat(undefined, {
  weekday: "long",
  year: "numeric",
  month: "long",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
  second: "2-digit",
  timeZoneName: "short",
});

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;

  for (const button of themeButtons) {
    const isActive = button.dataset.themeValue === theme;
    button.classList.toggle("is-active", isActive);
    button.setAttribute("aria-pressed", String(isActive));
  }

  if (themeColor) {
    themeColor.content = theme === "dark" ? "#14110c" : "#f3ecdc";
  }
}

function initializeThemeSwitch() {
  const theme = document.documentElement.dataset.theme === "dark" ? "dark" : "light";
  applyTheme(theme);

  for (const button of themeButtons) {
    button.addEventListener("click", () => {
      const nextTheme = button.dataset.themeValue;

      if (nextTheme !== "light" && nextTheme !== "dark") {
        return;
      }

      applyTheme(nextTheme);

      try {
        window.localStorage.setItem("nodeconf-theme", nextTheme);
      } catch {
        // Theme switching still works for the current page without storage.
      }
    });
  }
}

function setLiveStatus(state, label) {
  liveStatus.dataset.state = state;
  liveStatusLabel.textContent = label;
  document.title = state === "live" ? `Live now | ${defaultTitle}` : defaultTitle;
}

function setLiveViewerCount(value) {
  if (!Number.isSafeInteger(value) || value < 0) {
    viewerCount.hidden = true;
    return;
  }

  const label = `${viewerCountFormatter.format(value)} watching`;

  if (viewerCountLabel.textContent !== label) {
    viewerCountLabel.textContent = label;
  }

  viewerCount.hidden = false;
}

function updateClocks() {
  const now = new Date();
  const dateTime = now.toISOString();

  bolognaClock.textContent = bolognaTimeFormatter.format(now);
  bolognaClock.dateTime = dateTime;
  bolognaClock.setAttribute("aria-label", bolognaTimeLabelFormatter.format(now));

  viewerClock.textContent = viewerTimeFormatter.format(now);
  viewerClock.dateTime = dateTime;
  viewerClock.setAttribute("aria-label", viewerTimeLabelFormatter.format(now));

  const minute = Math.floor(now.getTime() / 60_000);

  if (programMinute !== minute) {
    programMinute = minute;
    updateProgramTimeline(now);
  }
}

function parseProgramTime(value) {
  const match = typeof value === "string" && value.match(/^(\d{2}):(\d{2})$/);

  if (!match) {
    return null;
  }

  const hours = Number(match[1]);
  const minutes = Number(match[2]);

  if (hours > 23 || minutes > 59) {
    return null;
  }

  return hours * 60 + minutes;
}

function isBroadcastSession(session) {
  if (!session || typeof session !== "object") {
    return false;
  }

  if (session.type === "talk" || session.type === "intro") {
    return true;
  }

  return session.type === "break" && session.start >= "09:00";
}

function createProgramEntries(program) {
  const entries = [];

  for (const day of program.days) {
    if (
      !day ||
      typeof day !== "object" ||
      typeof day.date !== "string" ||
      !Array.isArray(day.sessions)
    ) {
      continue;
    }

    for (const session of day.sessions) {
      const startMinutes = parseProgramTime(session?.start);
      const endMinutes = parseProgramTime(session?.end);

      if (
        !isBroadcastSession(session) ||
        startMinutes === null ||
        typeof session.title !== "string"
      ) {
        continue;
      }

      entries.push({
        date: day.date,
        dayLabel: typeof day.label === "string" ? day.label : day.date,
        endMinutes: endMinutes ?? startMinutes + 30,
        session,
        startMinutes,
      });
    }
  }

  return entries.sort(
    (a, b) => a.date.localeCompare(b.date) || a.startMinutes - b.startMinutes,
  );
}

function getProgramNow(now, timeZone) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone,
  });
  const parts = Object.fromEntries(
    formatter
      .formatToParts(now)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]),
  );

  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    minutes: Number(parts.hour) * 60 + Number(parts.minute),
  };
}

function sessionPeople(session) {
  const people = [];

  if (typeof session.speaker === "string") {
    people.push(session.speaker);
  } else if (
    typeof session.speakerId === "string" &&
    typeof programDocument?.speakerNames?.[session.speakerId] === "string"
  ) {
    people.push(programDocument.speakerNames[session.speakerId]);
  }

  if (Array.isArray(session.coSpeakerIds)) {
    for (const id of session.coSpeakerIds) {
      const name = programDocument?.speakerNames?.[id];

      if (typeof name === "string" && !people.includes(name)) {
        people.push(name);
      }
    }
  }

  return people.join(" & ");
}

function setProgramLink(link, session) {
  const suffix =
    typeof session?.talkId === "string"
      ? `#${encodeURIComponent(session.talkId)}`
      : "";
  link.href = `https://nodeconf.eu/program${suffix}`;
  link.setAttribute(
    "aria-label",
    `${session.title} (opens in a new tab)`,
  );
}

function setSessionTime(element, entry) {
  const end =
    typeof entry.session.end === "string" ? `-${entry.session.end}` : "";
  element.textContent = `${entry.session.start}${end}`;
  element.dateTime = `${entry.date}T${entry.session.start}:00`;
  element.setAttribute(
    "aria-label",
    `${entry.dayLabel}, ${entry.session.start}${
      entry.session.end ? ` to ${entry.session.end}` : ""
    }, Bologna time`,
  );
  element.hidden = false;
}

function setSessionPeople(element, entry) {
  const people = sessionPeople(entry.session);
  element.textContent = people;
  element.hidden = people.length === 0;
}

function renderCurrentSession(entry, label) {
  currentSessionLabel.textContent = label;
  currentSessionTitle.textContent = entry.session.title;
  setProgramLink(currentSessionTitle, entry.session);
  setSessionTime(currentSessionTime, entry);
  setSessionPeople(currentSessionPeople, entry);
}

function renderNextSession(entry) {
  nextSessionTitle.textContent = entry.session.title;
  setProgramLink(nextSessionTitle, entry.session);
  setSessionTime(nextSessionTime, entry);
  setSessionPeople(nextSessionPeople, entry);
  nextSession.hidden = false;
}

function updateProgramTimeline(now = new Date()) {
  if (!programDocument || programEntries.length === 0) {
    return;
  }

  const programNow = getProgramNow(now, programDocument.timeZone);
  const current = programEntries.find(
    (entry) =>
      entry.date === programNow.date &&
      entry.startMinutes <= programNow.minutes &&
      programNow.minutes < entry.endMinutes,
  );
  const upcoming = programEntries.filter(
    (entry) =>
      entry.date > programNow.date ||
      (entry.date === programNow.date && entry.startMinutes > programNow.minutes),
  );

  if (current) {
    renderCurrentSession(
      current,
      current.session.type === "break" ? "Happening now" : "On stage now",
    );

    if (upcoming[0]) {
      renderNextSession(upcoming[0]);
    } else {
      nextSession.hidden = true;
    }

    return;
  }

  if (upcoming[0]) {
    const label =
      upcoming[0].date === programNow.date
        ? "Coming up"
        : `${upcoming[0].dayLabel} / Coming up`;
    renderCurrentSession(upcoming[0], label);
    nextSession.hidden = true;
    return;
  }

  currentSessionLabel.textContent = "Program complete";
  currentSessionTime.hidden = true;
  currentSessionTitle.textContent = "Thanks for joining us.";
  currentSessionTitle.href = "https://nodeconf.eu/program";
  currentSessionTitle.setAttribute(
    "aria-label",
    "View the complete program (opens in a new tab)",
  );
  currentSessionPeople.textContent = "Revisit the full program and speaker lineup.";
  currentSessionPeople.hidden = false;
  nextSession.hidden = true;
}

function isProgramDocument(value) {
  return (
    value !== null &&
    typeof value === "object" &&
    value.schemaVersion === 1 &&
    value.timeZone === "Europe/Rome" &&
    Array.isArray(value.days) &&
    value.speakerNames !== null &&
    typeof value.speakerNames === "object"
  );
}

function showProgramUnavailable() {
  currentSessionLabel.textContent = "Running order";
  currentSessionTime.hidden = true;
  currentSessionTitle.textContent = "Program temporarily unavailable.";
  currentSessionTitle.href = "https://nodeconf.eu/program";
  currentSessionTitle.setAttribute(
    "aria-label",
    "Open the full program (opens in a new tab)",
  );
  currentSessionPeople.textContent = "Open the full program for the latest schedule.";
  currentSessionPeople.hidden = false;
  nextSession.hidden = true;
}

async function refreshProgram() {
  if (programRefreshPromise) {
    return programRefreshPromise;
  }

  programRefreshPromise = (async () => {
    try {
      const response = await fetch("/api/program", {
        headers: { Accept: "application/json" },
      });

      if (!response.ok) {
        throw new Error(`Program endpoint returned ${response.status}`);
      }

      const program = await response.json();

      if (!isProgramDocument(program)) {
        throw new Error("Program endpoint returned an unsupported schema");
      }

      programDocument = program;
      programEntries = createProgramEntries(program);
      programMinute = Math.floor(Date.now() / 60_000);
      updateProgramTimeline();
    } catch {
      if (!programDocument) {
        showProgramUnavailable();
      }
    } finally {
      programRefreshPromise = null;
    }
  })();

  return programRefreshPromise;
}

function setDirectPlayerUrl(url) {
  for (const link of directPlayerLinks) {
    if (url) {
      link.href = url;
      link.hidden = false;
    } else {
      link.removeAttribute("href");
      link.hidden = true;
    }
  }
}

function showStandby(title, message, canRetry = false) {
  activePlayerUrl = null;
  standbyTitle.textContent = title;
  standbyMessage.textContent = message;
  retryButton.hidden = !canRetry;
  playerFrame.replaceChildren(standby);
  playerFrame.dataset.state = canRetry ? "error" : "standby";
  playerFrame.setAttribute("aria-busy", "false");
  setDirectPlayerUrl(null);
}

function isCloudflareStreamPlayerUrl(value) {
  if (typeof value !== "string") {
    return false;
  }

  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      url.hostname.startsWith("customer-") &&
      url.hostname.endsWith(".cloudflarestream.com") &&
      url.pathname.endsWith("/iframe")
    );
  } catch {
    return false;
  }
}

function mountPlayer(url) {
  if (activePlayerUrl === url) {
    return;
  }

  const iframe = document.createElement("iframe");
  iframe.src = url;
  iframe.title = "NodeConf EU 2026 main-stage live stream";
  iframe.allow = "accelerometer; gyroscope; autoplay; encrypted-media; picture-in-picture";
  iframe.allowFullscreen = true;
  iframe.referrerPolicy = "strict-origin-when-cross-origin";

  playerFrame.dataset.state = "ready";
  playerFrame.setAttribute("aria-busy", "true");
  playerFrame.replaceChildren(iframe);
  iframe.addEventListener(
    "load",
    () => playerFrame.setAttribute("aria-busy", "false"),
    { once: true },
  );

  activePlayerUrl = url;
  setDirectPlayerUrl(url);
}

async function refreshStream() {
  if (refreshPromise) {
    return refreshPromise;
  }

  refreshPromise = (async () => {
    if (!activePlayerUrl) {
      setLiveStatus("loading", "Checking the line");
      playerFrame.setAttribute("aria-busy", "true");
    }

    try {
      const response = await fetch("/api/stream", {
        headers: { Accept: "application/json" },
      });

      if (!response.ok) {
        throw new Error(`Stream endpoint returned ${response.status}`);
      }

      const stream = await response.json();

      if (!stream.configured || !isCloudflareStreamPlayerUrl(stream.playerUrl)) {
        setLiveViewerCount(null);
        setLiveStatus("standby", "Channel opening soon");
        showStandby(
          "The broadcast begins here.",
          "The player will appear as soon as the main-stage channel opens.",
        );
        return;
      }

      mountPlayer(stream.playerUrl);

      if (stream.status === "live") {
        setLiveViewerCount(stream.liveViewers);
        setLiveStatus("live", "Live now");
      } else if (stream.status === "standby") {
        setLiveViewerCount(null);
        setLiveStatus("standby", "Stream not started");
      } else {
        setLiveViewerCount(null);
        setLiveStatus("unknown", "Player ready");
      }
    } catch {
      setLiveViewerCount(null);
      setLiveStatus("unknown", activePlayerUrl ? "Player ready" : "Connection unavailable");

      if (!activePlayerUrl) {
        showStandby(
          "We could not reach the broadcast.",
          "Check your connection, then try the player again.",
          true,
        );
      }
    } finally {
      refreshPromise = null;
    }
  })();

  return refreshPromise;
}

initializeThemeSwitch();
updateClocks();
retryButton.addEventListener("click", refreshStream);
refreshStream();
refreshProgram();

window.setInterval(() => {
  if (!document.hidden) {
    refreshStream();
  }
}, 15_000);

window.setInterval(() => {
  if (!document.hidden) {
    updateClocks();
  }
}, 1_000);

window.setInterval(() => {
  if (!document.hidden) {
    refreshProgram();
  }
}, 300_000);

document.addEventListener("visibilitychange", () => {
  if (!document.hidden) {
    updateClocks();
    refreshStream();
    refreshProgram();
  }
});
