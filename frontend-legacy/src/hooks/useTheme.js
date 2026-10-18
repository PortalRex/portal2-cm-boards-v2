import { useCallback, useEffect, useState } from "react";

// "dark" (the design default) or "light", remembered per browser. public/index.html
// applies the saved value before React mounts so the page doesn't flash.
const KEY = "p2cm.theme";

function saved() {
  try {
    return localStorage.getItem(KEY) === "light" ? "light" : "dark";
  } catch {
    return "dark";
  }
}

export default function useTheme() {
  const [theme, setTheme] = useState(saved);

  useEffect(() => {
    if (theme === "light") document.documentElement.dataset.theme = "light";
    else delete document.documentElement.dataset.theme;
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", theme === "light" ? "#e9ebee" : "#1e1f21");
    try {
      localStorage.setItem(KEY, theme);
    } catch {
      // Storage blocked: the choice lasts for this page view.
    }
  }, [theme]);

  const toggleTheme = useCallback(() => setTheme((t) => (t === "light" ? "dark" : "light")), []);
  return { theme, toggleTheme };
}
