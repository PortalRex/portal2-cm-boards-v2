// A run's comment worth showing inline: many old co-op runs only have the partner's name as their
// comment, which the row already shows.
export function shownNote(note, players = []) {
  const text = (note || "").trim();
  if (!text) return null;
  const same = (name) => name && name.trim().toLowerCase() === text.toLowerCase();
  return players.some((p) => p && same(p.name)) ? null : text;
}
