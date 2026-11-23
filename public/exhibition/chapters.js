// Single source of truth for the exhibition world (arranged in /exhibition/?arrange).
// x / y are world positions in % of a card's width / height (a card is one screen high and
// ASPECT screen heights wide, see exhibition.js), so the layout holds on any screen; scale sizes the card.
// card: folder under public/ with the cutout page, or null for a placeholder card (tone shows on it);
// script: its scene module if not scene.js.
// To rearrange visually, open /exhibition/?arrange, drag and Alt+scroll the cards, then
// "Copy layout" and paste the result over this file.

// Act I is the walkthrough in public/act-1: it fills the screen's height and its sequence plays
// over `length` screens of scrolling before the world continues down into Act II.
export const ACT_1 = {act: 'Act I · Arrival', label: 'Take it to the grave', card: 'act-1', script: 'walkthrough.js', fullscreen: true, length: 16, x: 0, y: -140, scale: 1};

export const CHAPTERS = [
  {n: '02', title: 'In the Life Of', act: 'Act II · The Wake', card: 'in-the-life-of', x: -116.7, y: -13.1, scale: 1.03},
  {n: '03', title: 'Where Are They Now?', act: 'Act II · The Wake', card: 'disco', x: 1.7, y: -18.3, scale: 1.36},
  {n: '04', title: 'Eulogies', act: 'Act II · The Wake', card: 'architecture', script: 'app.js', x: -70.9, y: 104.2, scale: 0.84},
  {n: '05', title: 'Skeletons in the Closet', act: 'Act II · The Wake', card: 'skeletons-in-the-closet', x: 58.1, y: 200, scale: 1.22},
  {n: '06', title: 'The Will', act: 'Act II · The Wake', card: 'will', x: 94, y: 62.8, scale: 1.64},
  {n: '07', title: 'The Auction', act: 'Act II · The Wake', tone: 'Playful, competitive, sentimental', card: null, x: -39.1, y: 179.1, scale: 1.01},
  {n: '08', title: 'Karmic Debts', act: 'Act III · The Afterlife', tone: 'Contemplative, unresolved', card: null, x: -55, y: 385, scale: 0.9},
  {n: '09', title: 'Prayers for the Next Life', act: 'Act III · The Afterlife', tone: 'Hopeful, intimate, bittersweet', card: null, x: 55, y: 450, scale: 0.9},
  {n: '10', title: 'Closing Statement / Reflections', act: 'Act III · The Afterlife', tone: 'Reflective, conclusive, quietly hopeful', card: 'closing-statement', x: 0, y: 535, scale: 0.9},
];
