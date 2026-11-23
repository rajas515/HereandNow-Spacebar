# 07 — The Auction

Source: the "New Auction 3D Composition - Laptop Transfer" (Nov 2026), from an earlier fork:
`Auction Composition.html`, its `Composition PNGs` and `auction-scene-with-card.json`.

- **What it is:** seven objects from the studio (room cutaway, shelf, instrument, pedestal, disco ball,
  leaning panel, cow head), pre-printed in riso ink, float gently in a CSS 3D composition. Hover lights
  an object to full colour (they rest see-through; a pixel-exact hit mask per object); click brings it forward with its outline and opens the
  Estate Sale card (inline SVG in `index.html`) with the three current bids and a bid form. Click the
  card or the object again, or press Escape, to close it. Bids are kept in the visitor's browser
  (`auction-local-bids-v1`), as in the transfer.
- **Port:** the transfer's page became a card: `scene.js` exports `mount(host)` and listens and measures
  only inside its own frame (hit testing works in the exhibition's shadow root and at any world zoom),
  so it runs standalone, in /map/ and in /exhibition/. The composition, hit masks, outlines and card
  placement are unchanged (`assets/composition.json`). The float pauses while the card is off screen.
- **Left out:** the editing tools (riso effects panel, card placement panel, card dragging, Save JSON)
  and the 2.2 MB of original source images only they used; the standalone "Auction Riso Studio" editor.
  The card's text is still the transfer's template (`<OBJECT NAME>`, sample bidders).
- **Weight:** the PNGs as WebP with alpha (2.5 MB → 0.6 MB); composition data 87 KB; page with the
  card SVG 98 KB.
