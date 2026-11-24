import {soundOutput} from '../shared/sound-output.js';
const smooth = value => { const t = Math.max(0, Math.min(1, value)); return t * t * (3 - 2 * t); };
// Match the opening text's 4.5-second arrival and 6.8–9.9-second dissolve.
export function whisperEnvelope(seconds) {
  return seconds < 0 || seconds >= 9.9 ? 0 : smooth(seconds / 4.5) * (1 - smooth((seconds - 6.8) / 3.1));
}

export function whisperSound(urls) {
  const context = new AudioContext();
  const master = context.createGain();
  master.gain.value = 0;
  master.connect(soundOutput(context));
  let buffers, voices = [], level = 0;
  const enable = document.createElement('button');
  enable.textContent = 'Enable sound';
  enable.style.cssText = 'position:fixed;right:22px;top:44px;z-index:20;background:#1a1d4a;color:#ff9ccf;border:1px solid #7b83d8;border-radius:16px;padding:8px 14px;cursor:pointer';
  enable.hidden = true;
  document.body.append(enable);
  function start() {
    if (!buffers || voices.length || level <= 0 || context.state !== 'running' || document.hidden) return;
    voices = buffers.map(buffer => {
      const voice = context.createBufferSource(), gain = context.createGain();
      voice.buffer = buffer;
      voice.loop = true;
      gain.gain.value = .55;
      voice.connect(gain).connect(master);
      voice.onended = () => { voice.disconnect(); gain.disconnect(); };
      voice.start();
      return voice;
    });
  }
  function stop() {
    voices.forEach(voice => voice.stop());
    voices = [];
    master.gain.cancelScheduledValues(context.currentTime);
    master.gain.value = 0;
  }
  const unlock = () => context.resume().then(() => { enable.hidden = true; start(); }).catch(() => { enable.hidden = level <= 0; });
  enable.addEventListener('click', unlock);
  addEventListener('pointerdown', unlock, {capture:true});
  addEventListener('keydown', unlock, {capture:true});
  Promise.all(urls.map(async url => {
    const response = await fetch(url);
    if (!response.ok) throw Error('Whisper recording unavailable');
    return context.decodeAudioData(await response.arrayBuffer());
  })).then(decoded => { buffers = decoded; start(); }).catch(error => console.error('Whisper audio:', error));
  document.addEventListener('visibilitychange', () => { if (document.hidden) stop(); });
  addEventListener('pagehide', stop);
  return seconds => {
    level = whisperEnvelope(seconds);
    enable.hidden = level <= 0 || context.state === 'running';
    if (document.hidden || level === 0) { stop(); return; }
    start();
    master.gain.setTargetAtTime(level, context.currentTime, .08);
  };
}
