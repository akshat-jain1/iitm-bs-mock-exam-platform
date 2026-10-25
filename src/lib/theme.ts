export const THEME_STORAGE_KEY = "iitm-theme";

// Runs before first paint. Keep the fallback in sync with ThemeProvider.
export const THEME_INIT_SCRIPT = `(function(){var t;try{t=localStorage.getItem("${THEME_STORAGE_KEY}")}catch(e){}document.documentElement.dataset.theme=t==="light"||t==="dark"?t:window.matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light"})()`;
