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
const directPlayerLinks = document.querySelectorAll("[data-direct-player]");
const themeColor = document.querySelector("#theme-color");
const themeButtons = document.querySelectorAll("[data-theme-value]");

let activePlayerUrl = null;
let refreshPromise = null;
const viewerCountFormatter = new Intl.NumberFormat("en");

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
retryButton.addEventListener("click", refreshStream);
refreshStream();

window.setInterval(() => {
  if (!document.hidden) {
    refreshStream();
  }
}, 15_000);

document.addEventListener("visibilitychange", () => {
  if (!document.hidden) {
    refreshStream();
  }
});
