// One GLTF loader setup for every card. Models are Draco-compressed (geometry decodes
// back to ordinary float attributes, vertex order preserved) and may carry WebP textures.
import {GLTFLoader} from './vendor/GLTFLoader.js';
import {DRACOLoader} from './vendor/DRACOLoader.js';
import {Cache} from './vendor/three.module.js';

// Cards in the exhibition share one page: load a file once (the garden photo is used by four).
Cache.enabled = true;

const draco = new DRACOLoader().setDecoderPath(new URL('./vendor/draco/', import.meta.url).href).setDecoderConfig({type: 'wasm'});

export function gltfLoader() {
  return new GLTFLoader().setDRACOLoader(draco);
}
