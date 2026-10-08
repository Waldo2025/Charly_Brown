(() => {
  const allowedThemes = ["light", "medium", "dark"];
  let savedTheme = "light";
  try {
    const storedTheme = localStorage.getItem("marcie_ui_theme_v1");
    if (allowedThemes.includes(storedTheme)) savedTheme = storedTheme;
  } catch (_) {}
  document.documentElement.dataset.marcieUiTheme = savedTheme;
})();
