import { type Card, cardName, isRed } from '../engine';
import { suitSvg } from './icons';

export type CardSize = 'large' | 'small';

export function cardHtml(card: Card, size: CardSize = 'large'): string {
  const suit = size === 'small' ? 20 : 44;
  return `<div class="card card-${size} ${isRed(card.suit) ? 'red' : 'black'}" role="img" aria-label="${cardName(card)}">
    <span class="card-rank">${card.rank}</span>
    <span class="card-suit">${suitSvg(card.suit, suit)}</span>
  </div>`;
}

export function hiddenCardHtml(size: CardSize = 'large'): string {
  return `<div class="card card-${size} card-hidden" role="img" aria-label="Face-down card"></div>`;
}
