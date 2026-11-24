import {soundOutput} from '../shared/sound-output.js';
import {tunableTrack, effectChain} from '../shared/sound-tuning.js';
export const AMBIENT_LEVEL = .30;
export const DUCKED_LEVEL = .006;

// Each score is {name, label, url, trim, sound}: trim is a fixed gain that evens out the
// recordings' loudness so every score sounds equally loud at the same AMBIENT_LEVEL (see
// SCORE_TRIM in exhibition.js); sound holds its default effect settings (speed/pitch, tone,
// low cut, reverb, dry, volume), which can be adjusted live in the Sound settings panel.
function track(context, {name, label, url, trim = 1, sound = {}}, onChange) {
  const gain = context.createGain();
  gain.gain.value = 0;
  gain.connect(soundOutput(context));
  const tuning = tunableTrack(name, label, sound);
  const chain = effectChain(context, gain, tuning.values);
  const t = {url, trim, tuning: tuning.values, playing: tuning.playing, input: chain.input, gain, weight: 0, buffer: null, voice: null};
  tuning.onChange(values => { chain.set(values); if (t.voice) t.voice.playbackRate.setTargetAtTime(values.rate, context.currentTime, .1); onChange(); });
  return t;
}
export function ambientSound(mainScore, ...regionalScores) {
  const context = new AudioContext();
  const main = track(context, mainScore, () => update());
  const gain = main.gain, mainTrim = main.trim, url = main.url;
  const regions = regionalScores.map(score => track(context, score, () => update()));
  let fadeTime = .35;
  let buffer, voice, active = false, ducking = 0;
  const enable = document.createElement('button');
  enable.textContent = 'Enable sound';
  enable.style.cssText = 'position:fixed;right:22px;top:66px;z-index:20;background:#1a1d4a;color:#fff;border:1.5px solid #fff;border-radius:0;padding:9px 14px;cursor:pointer;font:800 11px Mulish,Arial,sans-serif;letter-spacing:.08em;text-transform:uppercase;';
  enable.hidden = true;
  document.body.append(enable);
  function update() {
    enable.hidden = !active || context.state === 'running';
    if (document.hidden || !active) {
      if (voice) { voice.stop(); voice.disconnect(); voice = main.voice = null; }
      for (const region of regions) {
        if (region.voice) {
          region.voice.stop();
          region.voice.disconnect();
          region.voice = null;
        }
        region.gain.gain.cancelScheduledValues(context.currentTime);
        region.gain.gain.value = 0;
      }
      gain.gain.cancelScheduledValues(context.currentTime);
      gain.gain.value = 0;
      main.playing(0); regions.forEach(region => region.playing(0));
      return;
    }
    if (!buffer || context.state !== 'running') return;
    if (!voice) {
      voice = context.createBufferSource();
      voice.buffer = buffer;
      voice.loop = true;
      voice.loopStart = 5.3;
      voice.loopEnd = buffer.duration;
      voice.playbackRate.value = main.tuning.rate;
      voice.connect(main.input);
      voice.start();
      main.voice = voice;
    }
    for (const region of regions) {
      if (!region.buffer || region.voice || region.weight <= 0) continue;
      const source = context.createBufferSource();
      source.buffer = region.buffer;
      source.loop = true;
      source.loopStart = .35;
      source.playbackRate.value = region.tuning.rate;
      source.connect(region.input);
      source.start();
      region.voice = source;
    }
    const weights = regions.map(region => region.voice ? region.weight : 0);
    const original = weights.reduce((remaining, weight) => remaining * (1 - weight), 1);
    const total = original + weights.reduce((sum, weight) => sum + weight, 0);
    const level = AMBIENT_LEVEL - ducking * (AMBIENT_LEVEL - DUCKED_LEVEL);
    const fade = ducking > 0 ? .18 : fadeTime;
    gain.gain.setTargetAtTime(level * mainTrim * main.tuning.volume * Math.sqrt(original / total), context.currentTime, fade);
    main.playing(voice ? level / AMBIENT_LEVEL * main.tuning.volume * Math.sqrt(original / total) : 0);
    regions.forEach((region, i) => {
      region.gain.gain.setTargetAtTime(level * region.trim * region.tuning.volume * Math.sqrt(weights[i] / total), context.currentTime, fade);
      region.playing(level / AMBIENT_LEVEL * region.tuning.volume * Math.sqrt(weights[i] / total));
    });
  }
  const unlock = () => context.resume().then(update).catch(() => {});
  addEventListener('pointerdown', unlock, {capture:true});
  addEventListener('keydown', unlock, {capture:true});
  enable.addEventListener('click', unlock);
  fetch(url).then(r => { if (!r.ok) throw Error('Ambient music unavailable'); return r.arrayBuffer(); })
    .then(data => context.decodeAudioData(data)).then(decoded => {
      // Only the first fifteen seconds enter the playback buffer.
      const frames = Math.min(decoded.length, Math.floor(decoded.sampleRate * 15));
      buffer = context.createBuffer(decoded.numberOfChannels, frames, decoded.sampleRate);
      for (let channel = 0; channel < decoded.numberOfChannels; channel++) {
        const samples = decoded.getChannelData(channel).slice(0, frames);
        // A tiny seam fade avoids a click when the fifteen-second excerpt repeats.
        const fade = Math.min(Math.floor(decoded.sampleRate * .3), Math.floor(frames / 2));
        for (let i = 0; i < fade; i++) { const mix = i / (fade - 1); const tail = frames - fade + i; samples[tail] = samples[tail] * (1 - mix) + samples[5 * decoded.sampleRate + i] * mix; }
        buffer.copyToChannel(samples, channel);
      }
      update();
    }).catch(error => console.error('Ambient music:', error));
  for (const region of regions) fetch(region.url).then(response => {
    if (!response.ok) throw Error('Act II score unavailable');
    return response.arrayBuffer();
  }).then(data => context.decodeAudioData(data)).then(decoded => {
    const windowSize = Math.round(decoded.sampleRate * .025);
    const channels = Array.from({length: decoded.numberOfChannels}, (_, i) => decoded.getChannelData(i));
    let start = 0, end = decoded.length;
    const audible = offset => channels.some(samples => {
      let energy = 0;
      for (let i = offset; i < offset + windowSize; i++) energy += samples[i] ** 2;
      return energy / windowSize > .000001;
    });
    while (start + windowSize < end && !audible(start)) start += windowSize;
    while (end - windowSize > start && !audible(end - windowSize)) end -= windowSize;
    const frames = end - start;
    const fade = Math.round(decoded.sampleRate * .35);
    if (frames <= fade * 2) throw Error('Act II score has no usable loop');
    region.buffer = context.createBuffer(channels.length, frames, decoded.sampleRate);
    channels.forEach((channel, i) => {
      const samples = channel.slice(start, end);
      for (let j = 0; j < fade; j++) {
        const mix = j / (fade - 1);
        const tail = frames - fade + j;
        samples[tail] = samples[tail] * (1 - mix) + samples[j] * mix;
      }
      region.buffer.copyToChannel(samples, i);
    });
    update();
  }).catch(error => console.error(region.url.href, error));
  document.addEventListener('visibilitychange', update);
  addEventListener('pagehide', () => { active = false; update(); });
  return (shouldPlay, duckAmount, weights, transitionTime) => {
    const unchanged = regions.every((region, i) => region.weight === weights[i]);
    if (active === shouldPlay && ducking === duckAmount && unchanged && fadeTime === transitionTime) return;
    regions.forEach((region, i) => { region.weight = weights[i]; });
    fadeTime = transitionTime;
    active = shouldPlay;
    ducking = duckAmount;
    update();
  };
}
