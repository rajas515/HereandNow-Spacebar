import {soundOutput} from '../shared/sound-output.js';
// Use the supplied recording as a keystroke instrument, driven by revealed characters.
export function typewriterSound(url) {
  const context = new AudioContext();
  let buffer, offset = 0, previous = null, lastStroke = -1;
  const voices = new Set();
  const enable = document.createElement('button');
  enable.textContent = 'Enable sound';
  enable.style.cssText = 'position:fixed;right:22px;top:44px;z-index:20;background:#1a1d4a;color:#ff9ccf;border:1px solid #7b83d8;border-radius:16px;padding:8px 14px;cursor:pointer';
  enable.hidden = true;
  document.body.append(enable);
  const unlock = () => context.resume().then(() => { enable.hidden = context.state === 'running'; }).catch(() => { enable.hidden = false; });
  enable.addEventListener('click', unlock);
  addEventListener('pointerdown', unlock, {capture:true});
  addEventListener('keydown', unlock, {capture:true});
  fetch(url).then(r => { if (!r.ok) throw Error('Typewriter audio unavailable'); return r.arrayBuffer(); })
    .then(data => context.decodeAudioData(data)).then(decoded => {
      buffer = decoded;
      // Locate an audible attack instead of repeatedly playing silence at the MP3 start.
      const samples = buffer.getChannelData(0), window = Math.max(1, Math.floor(buffer.sampleRate * .06));
      let peak = 0;
      for (let i = 0; i < samples.length - window; i += window) {
        let energy = 0;
        for (let j = i; j < i + window; j++) energy += samples[j] * samples[j];
        if (energy > peak) { peak = energy; offset = Math.max(0, i / buffer.sampleRate - .012); }
      }
    }).catch(error => console.error('Typewriter sound:', error));
  function stop() {
    for (const voice of voices) { voice.stop(); voice.disconnect(); }
    voices.clear();
  }
  addEventListener('blur', stop);
  addEventListener('pagehide', stop);
  document.addEventListener('visibilitychange', () => { if (document.hidden) stop(); });
  return (characters, active) => {
    const added = previous === null ? 0 : characters - previous;
    previous = characters;
    if (!active || document.hidden || added < 0) { stop(); enable.hidden = true; return; }
    if (context.state !== 'running') { enable.hidden = characters <= 0; return; }
    enable.hidden = true;
    if (!buffer || added <= 0) return;
    // Leave space between attacks so a fast reveal doesn't become a continuous buzz.
    // A complete key down/up from the recording stays at its original pitch and speed.
    if (context.currentTime - lastStroke < .075) return;
    lastStroke = context.currentTime;
    {
      const voice = context.createBufferSource(), gain = context.createGain();
      voice.buffer = buffer;
      const when = context.currentTime;
      gain.gain.setValueAtTime(0, when);
      gain.gain.linearRampToValueAtTime(.22, when + .008);
      gain.gain.linearRampToValueAtTime(.16, when + .045);
      gain.gain.linearRampToValueAtTime(0, when + .092);
      voice.connect(gain).connect(soundOutput(context));
      voices.add(voice);
      voice.onended = () => { voices.delete(voice); voice.disconnect(); gain.disconnect(); };
      voice.start(when, offset, .095);
    }
  };
}
