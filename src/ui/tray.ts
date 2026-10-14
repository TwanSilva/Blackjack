/**
 * A side view of a discard tray, drawn to scale for the shoe, with a single deck beside it for comparison.
 * There are no tick marks: reading it is the skill being practised.
 */
export function trayHtml(cardsDiscarded: number, shoeDecks: number): string {
  const W = 320;
  const bottom = 224;
  const full = 196; // height of a full shoe's worth of cards
  const perDeck = full / shoeDecks;
  const stack = (cardsDiscarded / 52) * perDeck;
  const trayX = 40;
  const trayW = 150;
  const edges: string[] = [];
  for (let y = bottom - 3; y > bottom - stack; y -= 3) {
    edges.push(`<line x1="${trayX + 5}" y1="${y.toFixed(1)}" x2="${trayX + trayW - 5}" y2="${y.toFixed(1)}"/>`);
  }
  const refX = 228;
  const refW = 64;
  const refEdges: string[] = [];
  for (let y = bottom - 3; y > bottom - perDeck; y -= 3) {
    refEdges.push(`<line x1="${refX + 2}" y1="${y.toFixed(1)}" x2="${refX + refW - 2}" y2="${y.toFixed(1)}"/>`);
  }
  return `<svg class="tray" viewBox="0 0 ${W} 250" role="img" aria-label="Discard tray beside a single deck for scale">
    <rect x="${trayX + 3}" y="${(bottom - stack).toFixed(1)}" width="${trayW - 6}" height="${stack.toFixed(1)}" rx="2" class="tray-stack"/>
    <g class="tray-edges">${edges.join('')}</g>
    <path d="M${trayX} ${bottom - full - 6} V${bottom + 2} H${trayX + trayW} V${bottom - full - 6}" class="tray-box"/>
    <rect x="${refX}" y="${(bottom - perDeck).toFixed(1)}" width="${refW}" height="${perDeck.toFixed(1)}" rx="2" class="tray-stack"/>
    <g class="tray-edges">${refEdges.join('')}</g>
    <text x="${refX + refW / 2}" y="${bottom + 20}" text-anchor="middle" class="tray-label">1 deck</text>
    <text x="${trayX + trayW / 2}" y="${bottom + 20}" text-anchor="middle" class="tray-label">Discards</text>
  </svg>`;
}
