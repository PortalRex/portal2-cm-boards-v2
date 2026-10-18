// Click handler for a table row that expands: toggles unless the click landed on a
// link, button or form control inside the row (those keep their own behaviour).
export const toggleOnRowClick = (toggle) => (e) => {
  if (e.target.closest("a, button, input, select, textarea, video")) return;
  if (window.getSelection?.().toString()) return; // selecting text, not clicking
  toggle();
};
