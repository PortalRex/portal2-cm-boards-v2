// Applies the saved theme and glass look before first paint (see src/hooks/use-theme.ts and
// use-glass.ts). Kept as a file rather than inline in index.html so the site's
// Content-Security-Policy can forbid inline scripts.
try {
  if (localStorage.getItem('p2cm.theme') === 'light') document.documentElement.dataset.theme = 'light'
  if (localStorage.getItem('p2cm.glass') === '1') document.documentElement.dataset.glass = 'on'
} catch (e) {}
