import type { Suit } from '../engine';

const stroke = (body: string, size = 20) =>
  `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;

export const icon = {
  back: () => stroke('<path d="M15 5l-7 7 7 7"/>'),
  close: () => stroke('<path d="M6 6l12 12M18 6L6 18"/>'),
  grid: () => stroke('<rect x="3.5" y="3.5" width="4.5" height="4.5" rx="1"/><rect x="9.75" y="3.5" width="4.5" height="4.5" rx="1"/><rect x="16" y="3.5" width="4.5" height="4.5" rx="1"/><rect x="3.5" y="9.75" width="4.5" height="4.5" rx="1"/><rect x="9.75" y="9.75" width="4.5" height="4.5" rx="1"/><rect x="16" y="9.75" width="4.5" height="4.5" rx="1"/><rect x="3.5" y="16" width="4.5" height="4.5" rx="1"/><rect x="9.75" y="16" width="4.5" height="4.5" rx="1"/><rect x="16" y="16" width="4.5" height="4.5" rx="1"/>'),
  chevron: () => stroke('<path d="M9 5l7 7-7 7"/>', 18),
  backspace: () => stroke('<path d="M9 5h11v14H9l-6-7z"/><path d="M12.5 9.5l5 5M17.5 9.5l-5 5"/>', 22),
  check: (size = 20) => stroke('<path d="M5 12.5l4.5 4.5L19 7.5"/>', size),
  cross: (size = 20) => stroke('<path d="M6.5 6.5l11 11M17.5 6.5l-11 11"/>', size),
};

/** Suits are SVG shapes, never text glyphs, so they can't turn into emoji. */
export function suitSvg(suit: Suit, size: number): string {
  const shapes: Record<Suit, string> = {
    hearts: '<path d="M12 21.2C5.6 16.4 2.5 12.9 2.5 8.9 2.5 5.9 4.8 3.6 7.6 3.6c1.8 0 3.4.9 4.4 2.4 1-1.5 2.6-2.4 4.4-2.4 2.8 0 5.1 2.3 5.1 5.3 0 4-3.1 7.5-9.5 12.3z"/>',
    diamonds: '<path d="M12 2l8 10-8 10-8-10z"/>',
    spades: '<path d="M12 2.2C8.6 6.4 3 9.6 3 14c0 2.6 2 4.5 4.5 4.5 1.4 0 2.6-.6 3.4-1.6L9.8 21.8h4.4l-1.1-4.9c.8 1 2 1.6 3.4 1.6 2.5 0 4.5-1.9 4.5-4.5 0-4.4-5.6-7.6-9-11.8z"/>',
    clubs: '<circle cx="12" cy="7" r="4.3"/><circle cx="6.9" cy="13.6" r="4.3"/><circle cx="17.1" cy="13.6" r="4.3"/><path d="M10.9 13h2.2l1.2 8.8H9.7z"/>',
  };
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">${shapes[suit]}</svg>`;
}
