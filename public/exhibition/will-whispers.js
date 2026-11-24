import {soundOutput} from '../shared/sound-output.js';
import {tunableTrack, effectChain} from '../shared/sound-tuning.js';

// A whisper layer: a recording of voices played backwards and blurred into a murmur. Reversed so
// no word survives, slowed a touch, its low rumble and its consonants filtered away, and mostly
// heard through a long dark reverb. It loops under the music; the caller sets how present it is
// (0–1) every frame. Used for The Will and for the reading of the note in Act I.
// All effect settings (speed/pitch, tone, low cut, reverb, dry, volume) can be adjusted live in
// the Sound settings panel.
export const WHISPER_SOUND = {rate: .92, tone: 1500, lowCut: 200, reverb: .8, dry: .45};

function reversed(context, decoded, start, end, reverse = true) {
  const from = Math.max(0, Math.floor(start * decoded.sampleRate));
  const to = Math.min(decoded.length, Math.floor(end * decoded.sampleRate));
  const length = Math.max(1, to - from);
  const out = context.createBuffer(decoded.numberOfChannels, length, decoded.sampleRate);
  const seam = Math.min(Math.floor(decoded.sampleRate * .6), Math.floor(length / 4));
  for (let c = 0; c < decoded.numberOfChannels; c++) {
    const samples = decoded.getChannelData(c).slice(from, to);
    if (reverse) samples.reverse();
    // Fold the tail into the head so the loop has no seam.
    for (let i = 0; i < seam; i++) {
      const mix = i / (seam - 1), tail = samples.length - seam + i;
      samples[tail] = samples[tail] * (1 - mix) + samples[i] * mix;
    }
    out.copyToChannel(samples, c);
  }
  return out;
}

// level: loudness at full presence (before the panel's volume); start/end: the part of the
// recording to use, in seconds.
// reverse: false plays the recording forwards (used for the Estate Sale ambience).
export function whisperLayer(url, {name, label, level = .5, start = 0, end = Infinity, reverse = true, sound = {}} = {}) {
  const context = new AudioContext();
  const master = context.createGain();
  master.gain.value = 0;
  master.connect(soundOutput(context));
  const tuning = tunableTrack(name, label, reverse ? {...WHISPER_SOUND, ...sound} : sound);
  const chain = effectChain(context, master, tuning.values);
  let buffer = null, voice = null, presence = 0;
  tuning.onChange(values => { chain.set(values); voice?.playbackRate.setTargetAtTime(values.rate, context.currentTime, .1); update(); });
  function update() {
    const audible = presence > .001 && !document.hidden;
    if (audible && buffer && context.state === 'running' && !voice) {
      voice = context.createBufferSource();
      voice.buffer = buffer; voice.loop = true; voice.playbackRate.value = tuning.values.rate;
      voice.connect(chain.input);
      voice.start(0, Math.random() * buffer.duration);   // somewhere in the murmur, not always the same spot
    }
    master.gain.setTargetAtTime(audible ? level * tuning.values.volume * presence : 0, context.currentTime, .4);
    tuning.playing(audible && voice ? tuning.values.volume * presence : 0);
    if (!audible && voice) {   // let the fade finish, then free the voice
      const v = voice; voice = null;
      v.stop(context.currentTime + 2);
    }
  }
  const unlock = () => context.resume().then(update).catch(() => {});
  addEventListener('pointerdown', unlock, {capture: true});
  addEventListener('keydown', unlock, {capture: true});
  fetch(url).then(r => { if (!r.ok) throw Error(`${label} unavailable`); return r.arrayBuffer(); })
    .then(data => context.decodeAudioData(data)).then(decoded => { buffer = reversed(context, decoded, start, end, reverse); update(); })
    .catch(error => console.error(`${label}:`, error));
  document.addEventListener('visibilitychange', update);
  addEventListener('pagehide', () => { presence = 0; update(); });
  // amount: 0 (silent) … 1 (fully present).
  return amount => {
    const next = Math.max(0, Math.min(1, amount));
    if (Math.abs(next - presence) < .002) return;
    presence = next;
    update();
  };
}
