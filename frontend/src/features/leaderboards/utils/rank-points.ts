/** What a place on the board is worth, as the rank's bubble says it. */
export const pointsText = (points: number) =>
  points > 0 ? `Worth ${Math.round(points * 10) / 10} points` : 'No points (only the top 200 score)'
