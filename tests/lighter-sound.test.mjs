import {test} from 'node:test';
import assert from 'node:assert/strict';
import {LIGHTER_START, TITLE_FULL} from '../public/exhibition/lighter-sound.js';
test('lighter starts at half the title ink and finishes at full reveal', () => {
  const titleTime = LIGHTER_START * 5.3 / 9;
  const r = (titleTime - .8) / 4.5;
  assert.ok(Math.abs((1 - (1 - r * r) ** 3) - .5) < 1e-10);
  assert.equal(TITLE_FULL, 9);
  assert.ok(LIGHTER_START > 0 && LIGHTER_START < TITLE_FULL);
});
