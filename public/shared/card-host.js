// A card's scene module exports `mount(host)`. The host tells the card where it runs:
// - pageHost(): its own standalone page (and the /map/ iframes), with its own renderer.
// - the exhibition world (exhibition/world-gl.js): one shared renderer, no iframe.
// Cards use host.$ instead of document.querySelector, host.createRenderer instead of
// new THREE.WebGLRenderer, host.installMapBridge instead of importing it, and
// host.embedded instead of `parent !== window`, and host.innerWidth/innerHeight for
// the card's own viewport size.
import * as THREE from './vendor/three.module.js';
import {installMapBridge} from './map-bridge.js';

export function pageHost() {
  return {
    world: false,
    embedded: parent !== window,
    root: document,
    get innerWidth() { return innerWidth; },   // the card's viewport (the iframe's, inside /map/)
    get innerHeight() { return innerHeight; },
    documentElement: document.documentElement,
    get body() { return document.body; },
    $: s => document.querySelector(s),
    $$: s => document.querySelectorAll(s),
    createRenderer: options => new THREE.WebGLRenderer(options),
    createGL: (canvas, attributes) => canvas.getContext('webgl', attributes),
    installMapBridge,
  };
}
