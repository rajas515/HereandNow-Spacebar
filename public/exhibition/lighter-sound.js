import {soundOutput} from '../shared/sound-output.js';
// The title shader reaches half its ink level at this point in its nine-second reveal.
export const LIGHTER_START = (.8 + 4.5 * Math.sqrt(1 - Math.cbrt(.5))) * 9 / 5.3;
export const TITLE_FULL = 9;

export function lighterSound(url, {start = LIGHTER_START, end = TITLE_FULL, label = 'Lighter', level = 1, fadeIn = .015, fadeOut = .15, excerpt = Infinity} = {}) {
  const context = new AudioContext();
  let buffer, trim = 0, voice, gain, previous = null, tick = 0;
  const enable = document.createElement('button');
  enable.textContent = 'Enable sound';
  enable.style.cssText = 'position:fixed;right:22px;top:44px;z-index:20;background:#1a1d4a;color:#ff9ccf;border:1px solid #7b83d8;border-radius:16px;padding:8px 14px;cursor:pointer';
  enable.hidden = true;
  document.body.append(enable);
  const unlock = () => context.resume().then(() => { enable.hidden = true; }).catch(() => {});
  addEventListener('pointerdown', unlock, {capture:true});
  addEventListener('keydown', unlock, {capture:true});
  enable.addEventListener('click', unlock);
  fetch(url).then(r => { if (!r.ok) throw Error(`${label} audio unavailable`); return r.arrayBuffer(); })
    .then(data => context.decodeAudioData(data)).then(decoded => {
      buffer = decoded;
      // Trim leading silence so the first audible attack meets the cue.
      const samples = buffer.getChannelData(0);
      let peak = 0;
      for (const sample of samples) peak = Math.max(peak, Math.abs(sample));
      const first = samples.findIndex(sample => Math.abs(sample) > Math.max(.005, peak * .06));
      trim = Math.max(0, first / buffer.sampleRate - .015);
    }).catch(error => console.error(`${label} sound:`, error));
  function stop() {
    if (!voice) return;
    const now = context.currentTime;
    gain.gain.cancelAndHoldAtTime(now);
    gain.gain.linearRampToValueAtTime(0, now + .06);
    voice.stop(now + .06);
    voice = null;
  }
  document.addEventListener('visibilitychange', () => { if (document.hidden) stop(); });
  addEventListener('pagehide', stop);
  addEventListener('blur', stop);
  return seconds => {
    const now = performance.now(), dt = (now - tick) / 1000;
    const speed = previous === null || dt <= 0 ? 0 : (seconds - previous) / dt;
    previous = seconds; tick = now;
    const active = seconds >= start && seconds < end && !document.hidden;
    enable.hidden = !active || context.state === 'running';
    if (!active || speed <= .01 || !buffer || context.state !== 'running') { stop(); return; }
    const progress = (seconds - start) / (end - start);
    const duration = Math.min(excerpt, buffer.duration - trim);
    const rate = Math.max(.1, Math.min(16, speed * duration / (end - start)));
    if (!voice) {
      voice = context.createBufferSource();
      voice.buffer = buffer;
      voice.playbackRate.value = rate;
      gain = context.createGain();
      gain.gain.value = 0;
      const source = voice, envelope = gain;
      source.connect(envelope).connect(soundOutput(context));
      source.onended = () => { source.disconnect(); envelope.disconnect(); };
      source.start(0, trim + progress * duration, duration * (1 - progress));
    } else voice.playbackRate.setTargetAtTime(rate, context.currentTime, .025);
    gain.gain.setTargetAtTime(level * Math.min(1, (end - seconds) / fadeOut), context.currentTime, fadeIn);
  };
}
