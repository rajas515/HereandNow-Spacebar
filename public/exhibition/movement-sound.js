import {soundOutput} from '../shared/sound-output.js';
// A single looping voice follows movement; gestures unlock browser audio.
export function movementSound(url) {
  let context, buffer, loading, voice, gain, timer, moving = false, rate = 1;
  function stop() {
    moving = false;
    clearTimeout(timer);
    if (!voice) return;
    const now = context.currentTime;
    gain.gain.cancelAndHoldAtTime(now);
    gain.gain.linearRampToValueAtTime(0, now + .28);
    voice.stop(now + .28);
    voice = null;
  }
  function play() {
    if (!moving || !buffer || context?.state !== 'running' || voice) return;
    voice = context.createBufferSource();
    voice.buffer = buffer;
    voice.loop = true;
    voice.playbackRate.value = rate;
    gain = context.createGain();
    const source = voice, envelope = gain;
    const now = context.currentTime;
    envelope.gain.setValueAtTime(0, now);
    envelope.gain.linearRampToValueAtTime(.14, now + .12);
    source.connect(envelope).connect(soundOutput(context));
    source.onended = () => { source.disconnect(); envelope.disconnect(); };
    voice.start();
  }
  function unlock() {
    context ||= new AudioContext();
    context.resume().then(play).catch(() => {});
    loading ||= fetch(url).then(response => {
      if (!response.ok) throw new Error('Could not load glimmer sound');
      return response.arrayBuffer();
    }).then(data => context.decodeAudioData(data)).then(decoded => {
      buffer = decoded;
      play();
    }).catch(() => { loading = null; });
  }
  addEventListener('pointerdown', unlock, {capture: true});
  addEventListener('keydown', unlock, {capture: true});
  addEventListener('blur', stop);
  addEventListener('pagehide', stop);
  document.addEventListener('visibilitychange', () => { if (document.hidden) stop(); });
  return {
    move(playbackRate = 1) {
      rate = Math.max(.5, Math.min(3, playbackRate));
      if (voice) voice.playbackRate.setTargetAtTime(rate, context.currentTime, .04);
      moving = true;
      clearTimeout(timer);
      timer = setTimeout(stop, 180);
      play();
    },
    stop,
  };
}
