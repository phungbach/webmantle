/* Theme registry and switcher logic. Must match the [data-theme] blocks in css/themes.css. */
(function () {
  const STORAGE_KEY = "blog-theme";
  const DEFAULT_THEME = "light";

  // Labels shown in the dropdown. Order here is the order in the menu.
  const THEMES = [
    { id: "light", label: "Light" },
    { id: "dark", label: "Dark" },
    { id: "sepia", label: "Sepia" },
    { id: "ocean", label: "Ocean" },
    { id: "forest", label: "Forest" },
    { id: "rose", label: "Rose" },
  ];

  function readSaved() {
    try {
      return localStorage.getItem(STORAGE_KEY);
    } catch (e) {
      return null; // storage blocked (private mode, disabled cookies)
    }
  }

  function save(id) {
    try {
      localStorage.setItem(STORAGE_KEY, id);
    } catch (e) {
      /* ignore: theme still applies for this page view */
    }
  }

  function isValid(id) {
    return THEMES.some((t) => t.id === id);
  }

  function applyTheme(id) {
    const theme = isValid(id) ? id : DEFAULT_THEME;
    document.documentElement.setAttribute("data-theme", theme);
    const select = document.getElementById("theme-select");
    if (select) select.value = theme;
    return theme;
  }

  function setTheme(id) {
    const theme = applyTheme(id);
    save(theme);
    return theme;
  }

  function initSwitcher() {
    const select = document.getElementById("theme-select");
    if (!select) return;

    THEMES.forEach((t) => {
      const option = document.createElement("option");
      option.value = t.id;
      option.textContent = t.label;
      select.appendChild(option);
    });

    select.addEventListener("change", (e) => setTheme(e.target.value));
    applyTheme(readSaved() || DEFAULT_THEME);
  }

  // Expose a small API for other scripts (e.g. a future settings page).
  window.BlogThemes = { list: THEMES, set: setTheme, current: () => document.documentElement.getAttribute("data-theme") };

  // Apply the saved theme as early as possible to avoid a flash of the wrong theme.
  applyTheme(readSaved() || DEFAULT_THEME);
  document.addEventListener("DOMContentLoaded", initSwitcher);
})();
