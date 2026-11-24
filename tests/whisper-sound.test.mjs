import {test} from 'node:test';
import assert from 'node:assert/strict';
import {whisperEnvelope} from '../public/exhibition/whisper-sound.js';

test('whisper layers fade with the opening text and finish before the room', () => {
  assert.equal(whisperEnvelope(-1), 0);
  assert.equal(whisperEnvelope(0), 0);
  assert.equal(whisperEnvelope(2.25), .5);
  assert.equal(whisperEnvelope(4.5), 1);
  assert.equal(whisperEnvelope(6.8), 1);
  assert.ok(Math.abs(whisperEnvelope(8.35) - .5) < .0001);
  assert.equal(whisperEnvelope(9.9), 0);
  assert.equal(whisperEnvelope(15), 0);
});
