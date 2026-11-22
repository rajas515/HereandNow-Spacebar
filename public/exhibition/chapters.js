// Single source of truth for the exhibition world (arranged in /exhibition/?arrange).
// x / y are world positions in viewport percentages; scale sizes the card.
// card: folder under public/ with the cutout page, or null for a placeholder;
// script: its scene module if not scene.js.
// To rearrange visually, open /exhibition/?arrange, drag and Alt+scroll the cards, then
// "Copy layout" and paste the result over this file.

// Act I is the walkthrough in public/act-1: it fills the screen and its sequence plays over
// `length` screens of scrolling before the world continues down into Act II.
export const ACT_1 = {act: 'Act I · Arrival', label: 'Take it to the grave', card: 'act-1', script: 'walkthrough.js', fullscreen: true, length: 16, x: 0, y: -140, scale: 1};

export const CHAPTERS = [
  {n: '02', title: 'In the Life Of', act: 'Act II · The Wake', card: 'in-the-life-of', x: -128.8, y: -11.3, scale: 0.9},
  {n: '03', title: 'Where Are They Now?', act: 'Act II · The Wake', card: 'disco', x: -5.1, y: -9.7, scale: 1.53},
  {n: '04', title: 'Eulogies', act: 'Act II · The Wake', card: 'architecture', script: 'app.js', x: 6.3, y: 134.1, scale: 0.8},
  {n: '05', title: 'Skeletons in the Closet', act: 'Act II · The Wake', card: 'skeletons-in-the-closet', x: 96.8, y: 168.5, scale: 1.08},
  {n: '06', title: 'The Will', act: 'Act II · The Wake', card: 'will', x: 122.2, y: 5.3, scale: 1.08},
  {n: '07', title: 'The Auction', act: 'Act II · The Wake', card: null, x: -57.6, y: 189.1, scale: 1.01},
];
