(function applySavedTheme() {
  try {
    const saved = window.localStorage.getItem("nodeconf-theme");
    const theme =
      saved === "light" || saved === "dark"
        ? saved
        : window.matchMedia("(prefers-color-scheme: dark)").matches
          ? "dark"
          : "light";

    document.documentElement.dataset.theme = theme;
  } catch {
    // The light theme remains the safe fallback when storage is unavailable.
  }
})();
