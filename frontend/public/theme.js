// Applies the saved theme before first paint (see src/hooks/use-theme.ts). Kept as a file rather
// than inline in index.html so the site's Content-Security-Policy can forbid inline scripts.
try {
  if (localStorage.getItem("p2cm.theme") === "light") document.documentElement.dataset.theme = "light";
} catch (e) {}
