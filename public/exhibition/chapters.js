// Single source of truth for the exhibition world (arranged in /exhibition/?arrange).
// x / y are world positions in % of a card's width / height (a card is one screen high and
// ASPECT screen heights wide, see exhibition.js), so the layout holds on any screen; scale sizes the card.
// card: folder under public/ with the cutout page, or null for a placeholder card (tone shows on it);
// script: its scene module if not scene.js.
// heading (title lines), blurb and enter (the card's own zoom-in command) give a chapter its
// section intro, added one card at a time; titleQuad / textAt anchor its title (four corners)
// and description on the card, set in ?arrange.
// To rearrange visually, open /exhibition/?arrange, drag and Alt+scroll the cards, then
// "Copy layout" and paste the result over this file.

export const ACT_1 = {act: 'Act I · Arrival', label: 'Take it to the grave', card: 'act-1', script: 'walkthrough.js', fullscreen: true, length: 16, x: 0, y: -140, scale: 1};

export const CHAPTERS = [
  {n: '02', title: 'In the Life Of', act: 'Act II · The Wake', card: 'in-the-life-of', heading: ['In the', 'Life of'], blurb: 'Over the years, Exhib has built an exceptional body of work. Let us take a moment to revisit some of its most memorable creations.', enter: 'zoom', x: -115.9, y: -11, scale: 1.03, titleQuad: [[0.1514, 0.378], [0.2536, 0.4325], [0.2556, 0.5681], [0.1494, 0.6133]], textAt: [0.7693, 0.1048]},
  {n: '03', title: 'Where Are They Now?', act: 'Act II · The Wake', card: 'disco', heading: ['Where', 'Are they', 'Now'], blurb: 'And now, a little update from those who have since left the nest; because the departed may rest, but the living must go on. Here’s where some of our alumni are today.', enter: 'detail', x: 1.8, y: -14.7, scale: 1.36, titleQuad: [[0.3467, 0.1549], [0.4426, 0.2312], [0.4423, 0.3105], [0.3475, 0.2693]], textAt: [0.2723, 0.7237]},
  {n: '04', title: 'Eulogies', act: 'Act II · The Wake', card: 'architecture', script: 'app.js', x: -70.9, y: 104.2, scale: 0.84},
  {n: '05', title: 'Skeletons in the Closet', act: 'Act II · The Wake', card: 'skeletons-in-the-closet', x: 58.1, y: 200, scale: 1.22},
  {n: '06', title: 'The Will', act: 'Act II · The Wake', card: 'will', x: 94, y: 62.8, scale: 1.64},
  {n: '07', title: 'The Auction', act: 'Act II · The Wake', tone: 'Playful, competitive, sentimental', card: null, x: -39.1, y: 179.1, scale: 1.01},
  {n: '08', title: 'Karmic Debts', act: 'Act III · The Afterlife', tone: 'Contemplative, unresolved', card: 'karmic-debts', x: -55, y: 385, scale: 0.9},
  {n: '09', title: 'Prayers for the Next Life', act: 'Act III · The Afterlife', tone: 'Hopeful, intimate, bittersweet', card: 'prayers-for-the-next-life', x: 55, y: 450, scale: 0.9},
  {n: '10', title: 'Closing Statement / Reflections', act: 'Act III · The Afterlife', tone: 'Reflective, conclusive, quietly hopeful', card: 'closing-statement', x: 0, y: 535, scale: 0.9},
];
