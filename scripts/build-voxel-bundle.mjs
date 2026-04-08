import { build } from 'esbuild';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const entry = path.join(rootDir, 'src', 'voxeljs-bundle-entry.js');
const outfile = path.join(rootDir, 'public', 'vendor', 'voxeljs.bundle.js');

const nodeBuiltinStub = {
  name: 'node-builtin-stub',
  setup(buildApi) {
    const builtins = new Set(['fs', 'path', 'stream', 'util', 'zlib']);
    buildApi.onResolve({ filter: /^(fs|path|stream|util|zlib)$/ }, (args) => {
      if (!builtins.has(args.path)) return null;
      return { path: args.path, namespace: 'node-builtin-stub' };
    });
    buildApi.onLoad({ filter: /.*/, namespace: 'node-builtin-stub' }, (args) => {
      if (args.path === 'path') {
        return {
          contents: `
            export const join = (...parts) => parts.join('/');
            export const resolve = (...parts) => parts.join('/');
            export default { join, resolve };
          `,
          loader: 'js'
        };
      }
      if (args.path === 'stream') {
        return {
          contents: `
            function EventEmitter() {
              this._events = Object.create(null);
            }
            EventEmitter.prototype.on = function(event, listener) {
              if (!this._events[event]) this._events[event] = [];
              this._events[event].push(listener);
              return this;
            };
            EventEmitter.prototype.addListener = EventEmitter.prototype.on;
            EventEmitter.prototype.removeListener = function(event, listener) {
              const list = this._events[event];
              if (!list) return this;
              const idx = list.indexOf(listener);
              if (idx >= 0) list.splice(idx, 1);
              return this;
            };
            EventEmitter.prototype.emit = function(event, ...args) {
              const list = this._events[event];
              if (!list || list.length === 0) return false;
              list.slice().forEach((fn) => fn.apply(this, args));
              return true;
            };
            EventEmitter.prototype.listeners = function(event) {
              const list = this._events[event];
              return list ? list.slice() : [];
            };
            export function Stream() {
              EventEmitter.call(this);
            }
            Stream.prototype = Object.create(EventEmitter.prototype);
            Stream.prototype.constructor = Stream;
            Stream.prototype.pipe = function(dest) {
              this.on('data', (data) => {
                if (typeof dest?.write === 'function') dest.write(data);
              });
              this.on('end', () => {
                if (typeof dest?.end === 'function') dest.end();
              });
              return dest;
            };
            export function Readable() {
              Stream.call(this);
            }
            Readable.prototype = Object.create(Stream.prototype);
            Readable.prototype.constructor = Readable;
            export default { Stream, Readable };
          `,
          loader: 'js'
        };
      }
      if (args.path === 'util') {
        return {
          contents: `
            export const inherits = () => {};
            export default { inherits };
          `,
          loader: 'js'
        };
      }
      return { contents: 'export default {};', loader: 'js' };
    });
  }
};

const aliasPlugin = {
  name: 'voxel-aliases',
  setup(buildApi) {
    buildApi.onResolve({ filter: /^voxel-inventory-dialog$/ }, () => {
      return { path: path.join(rootDir, 'src', 'voxel-inventory-dialog-shim.js') };
    });
  }
};

await build({
  entryPoints: [entry],
  bundle: true,
  format: 'iife',
  globalName: 'VoxelJS',
  platform: 'browser',
  target: ['es2018'],
  sourcemap: true,
  outfile,
  banner: {
    js: 'var global = globalThis;'
  },
  define: {
    'process.browser': 'true',
    'global': 'globalThis'
  },
  plugins: [aliasPlugin, nodeBuiltinStub],
  logLevel: 'info'
});
