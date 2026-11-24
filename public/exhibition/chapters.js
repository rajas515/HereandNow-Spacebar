// Single source of truth for the exhibition world (arranged in /exhibition/?arrange).
// x / y are world positions in % of a card's width / height (a card is one screen high and
// ASPECT screen heights wide, see exhibition.js), so the layout holds on any screen; scale sizes the card.
// card: folder under public/ with the cutout page, or null for a placeholder card (tone shows on it);
// script: its scene module if not scene.js.
// heading (title lines), blurb and enter (the card's own zoom-in command) give a chapter its
// section intro, added one card at a time; titleQuad / textAt anchor its title (four corners)
// and description on the card, set in ?arrange; titleQuad may instead list one quad per heading
// word, each fitted on its own (Skeletons in the Closet).
// focusAt: the point of the card box the camera centres on when arriving (default its centre).
// cta: the Enter cursor's label; hoverCta: the label only follows what the card points at, and the
// click stays the card's own (The Estate Sale: Bid); ctaAnywhere: the label works over the whole card. anchorAt: where the card's room point was when the title was placed;
// the intro follows that point as the room moves inside its card (Skeletons).
// mapOffset nudges a chapter's name in the map view only (fractions of the map's width / height).
// To rearrange visually, open /exhibition/?arrange, drag and Alt+scroll the cards, then
// "Copy layout" and paste the result over this file.

export const ACT_1 = {act: 'Act I · Arrival', label: 'Take it to the grave', card: 'act-1', script: 'walkthrough.js', fullscreen: true, length: 16, x: 0, y: -140, scale: 1};

export const CHAPTERS = [
  {n: '02', title: 'In the Life Of', act: 'Act II · The Wake', card: 'in-the-life-of', heading: ['In the', 'Life of'], blurb: 'Over the years, Exhib has built an exceptional body of work. Let us take a moment to revisit some of its most memorable creations.', enter: 'zoom', x: -115.9, y: -11, scale: 1.03, titleQuad: [[0.1514, 0.378], [0.2536, 0.4325], [0.2556, 0.5681], [0.1494, 0.6133]], textAt: [0.7693, 0.1048]},
  {n: '03', title: 'Where Are They Now?', act: 'Act II · The Wake', card: 'disco', heading: ['Where', 'Are they', 'Now'], blurb: 'And now, a little update from those who have since left the nest; because the departed may rest, but the living must go on. Here’s where some of our alumni are today.', enter: 'detail', mapOffset: [0.04, 0.115], x: 1.8, y: -14.7, scale: 1.36, titleQuad: [[0.3467, 0.1549], [0.4426, 0.2312], [0.4423, 0.3105], [0.3475, 0.2693]], textAt: [0.2723, 0.7237]},
  {n: '04', title: 'Eulogies', act: 'Act II · The Wake', card: 'architecture', script: 'app.js', x: -70.9, y: 104.2, scale: 0.84},
  {n: '05', title: 'Skeletons in the Closet', act: 'Act II · The Wake', card: 'skeletons-in-the-closet', heading: ['Skele', 'tons', 'In', 'The', 'Closet'], blurb: 'Death has a funny way of loosening tongues.\n\nWith nothing left to lose, it’s time to spill the secrets, expose the scandals and get a few things off our chests. Submit an anonymous confession and, in return, receive one from someone else.', enter: 'confess', cta: 'Confess', anchorAt: [0.2565, 0.9396], focusAt: [0.47, 0.56], x: 55.9, y: 195.4, scale: 1.15, titleQuad: [[[0.1384, 0.608], [0.151, 0.2133], [0.1902, 0.294], [0.1834, 0.5889]], [[0.1577, 0.2081], [0.3219, 0.1205], [0.3186, 0.2281], [0.1935, 0.2879]], [[0.7438, 0.3955], [0.8095, 0.3747], [0.8095, 0.4727], [0.7438, 0.4787]], [[0.7114, 0.5724], [0.7851, 0.5863], [0.7838, 0.6808], [0.7076, 0.6522]], [[0.6407, 0.8118], [0.7838, 0.7919], [0.7784, 0.8691], [0.6373, 0.9072]]], textAt: [0.7002, 0.1737]},
  {n: '06', title: 'The Will', act: 'Act II · The Wake', card: 'will', enter: 'read', cta: 'Read', ctaAnywhere: true, heading: ['Will'], x: 94, y: 62.8, scale: 1.64, titleQuad: [[0.2442, 0.257], [0.3297, 0.2179], [0.3297, 0.2701], [0.2442, 0.3092]], textAt: [0.2442, 0.3092]},
  {n: '07', title: 'The Estate Sale', act: 'Act II · The Wake', tone: 'Playful, competitive, sentimental', card: 'the-auction', cta: 'Bid', hoverCta: true, heading: ['The', 'Estate', 'Sale'], blurb: 'Following the unfortunate passing of Exhibition Design, we find ourselves with a rather substantial collection of belongings in need of new homes. After nearly five decades of creating, hoarding, repurposing, and occasionally forgetting about things, it is time to pass them on.', x: -39.1, y: 179.1, scale: 1.01, titleQuad: [[0.1434, 0.6463], [0.2817, 0.6463], [0.2817, 0.8644], [0.1434, 0.8644]], textAt: [0.5422, 0.2463]},
  {n: '08', title: 'Karmic Debts', act: 'Act III · The Afterlife', tone: 'Contemplative, unresolved', card: 'karmic-debts', x: -55, y: 385, scale: 0.9},
  {n: '09', title: 'Prayers for the Next Life', act: 'Act III · The Afterlife', tone: 'Hopeful, intimate, bittersweet', card: 'prayers-for-the-next-life', x: 55, y: 450, scale: 0.9},
  {n: '10', title: 'Closing Statement / Reflections', act: 'Act III · The Afterlife', tone: 'Reflective, conclusive, quietly hopeful', card: 'closing-statement', x: 0, y: 535, scale: 0.9},
];
