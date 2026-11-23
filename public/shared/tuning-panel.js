// Temporary framing controls for a card's standalone page: one slider + number per setting,
// "Copy settings" (the object to paste over the card's defaults) and "Reset".
// Values are kept in this browser under `storageKey`; never shown inside the exhibition or map.
//   const tuning = loadTuning(KEY, DEFAULTS);
//   tuningPanel(host, tuning, {defaults: DEFAULTS, ranges: {key: [min, max, step]}, storageKey: KEY, changed,
//     sections: {firstKeyOfSection: 'Title'}});

export function loadTuning(storageKey, defaults) {
  const tuning = {...defaults};
  try { Object.assign(tuning, JSON.parse(localStorage.getItem(storageKey) || '{}')); } catch {}
  return tuning;
}

export function tuningPanel(host, tuning, {defaults, ranges, storageKey, changed, sections = {}}) {
  const save = () => { try { localStorage.setItem(storageKey, JSON.stringify(tuning)); } catch {} changed(); };
  const panel = document.createElement('details');
  panel.open = true;
  panel.style.cssText = 'position:fixed;top:12px;right:12px;z-index:10;width:250px;max-height:calc(100vh - 24px);overflow:auto;background:#1a1d4aee;border:1px solid #8176a1;border-radius:10px;padding:8px 12px;font:12px system-ui,sans-serif;color:#e5d1ea';
  panel.innerHTML = '<summary style="cursor:pointer;font-weight:600">Tune framing &amp; look</summary>';
  const inputs = {};
  for (const [key, [min, max, step]] of Object.entries(ranges)) {
    if (sections[key]) {
      const title = document.createElement('div');
      title.textContent = sections[key];
      title.style.cssText = 'margin:14px 0 0;padding-top:8px;border-top:1px solid #45456e;font-weight:600;letter-spacing:.04em;text-transform:uppercase;font-size:10px;color:#b9a9d6';
      panel.append(title);
    }
    const row = document.createElement('label');
    row.style.cssText = 'display:grid;grid-template-columns:1fr 52px;gap:2px 6px;margin:8px 0 0';
    row.innerHTML = `<span>${key}</span><input type="number" min="${min}" max="${max}" step="${step}" style="width:52px;background:transparent;color:inherit;border:1px solid #45456e;border-radius:4px"><input type="range" min="${min}" max="${max}" step="${step}" style="grid-column:1/3;width:100%">`;
    const [number, range] = row.querySelectorAll('input');
    const set = value => {
      tuning[key] = +value;
      number.value = range.value = tuning[key];
      save();
    };
    number.addEventListener('input', () => set(number.value));
    range.addEventListener('input', () => set(range.value));
    number.value = range.value = tuning[key];
    inputs[key] = {number, range};
    panel.append(row);
  }
  const buttons = document.createElement('div');
  buttons.style.cssText = 'display:flex;gap:6px;margin:12px 0 4px';
  const button = (label, action) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = label;
    b.style.cssText = 'flex:1;color:inherit;background:transparent;border:1px solid #8176a1;border-radius:14px;padding:5px 8px;cursor:pointer';
    b.onclick = action;
    buttons.append(b);
    return b;
  };
  const copy = button('Copy settings', async () => {
    const text = JSON.stringify(Object.fromEntries(Object.keys(ranges).map(k => [k, tuning[k]])), null, 2);
    try { await navigator.clipboard.writeText(text); copy.textContent = 'Copied'; }
    catch { prompt('Copy these settings', text); }
    setTimeout(() => { copy.textContent = 'Copy settings'; }, 1500);
  });
  button('Reset', () => {
    Object.assign(tuning, defaults);
    for (const [key, {number, range}] of Object.entries(inputs)) number.value = range.value = tuning[key];
    save();
  });
  panel.append(buttons);
  host.body.append(panel);
}
