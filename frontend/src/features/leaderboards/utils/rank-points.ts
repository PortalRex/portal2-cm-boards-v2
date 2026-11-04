/** What a place on the board is worth, as the rank's bubble says it. */
export const pointsText = (points: number) => {
  if (points <= 0) return 'No points (only the top 200 score)'
  const shown = Math.round(points * 10) / 10
  return `Worth ${shown} point${shown === 1 ? '' : 's'}`
}
