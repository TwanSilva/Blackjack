import { type Card, cardName, isRed } from '../engine';
import { suitSvg } from './icons';

/** xl 170x244 (count drill), big 130x187, large 72x104 (strategy drill), medium 52x75 (table), small 40x56 (recaps). */
export type CardSize = 'xl' | 'big' | 'large' | 'medium' | 'small';

const SUIT_SIZE: Record<CardSize, number> = { xl: 100, big: 76, large: 44, medium: 30, small: 20 };

export function cardHtml(card: Card, size: CardSize = 'large'): string {
  return `<div class="card card-${size} ${isRed(card.suit) ? 'red' : 'black'}" role="img" aria-label="${cardName(card)}">
    <span class="card-rank">${card.rank}</span>
    <span class="card-suit">${suitSvg(card.suit, SUIT_SIZE[size])}</span>
  </div>`;
}

export function hiddenCardHtml(size: CardSize = 'large'): string {
  return `<div class="card card-${size} card-hidden" role="img" aria-label="Face-down card"></div>`;
}
