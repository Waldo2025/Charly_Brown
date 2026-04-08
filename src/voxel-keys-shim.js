'use strict';

import vkey from 'vkey';
import { EventEmitter } from 'events';

function toArraySafe(value) {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value : [value];
}

function filteredVKey(key) {
  let next = key;
  if (next.charAt(0) === '<' && next.charAt(next.length - 1) === '>') {
    next = next.substring(1, next.length - 1);
  }
  return next.replace(/\s/g, '-');
}

const voxelKeysShim = (game, opts = {}) => new KeysPlugin(game, opts);
voxelKeysShim.pluginInfo = {
  clientOnly: true
};

class KeysPlugin {
  constructor(game, opts = {}) {
    this.game = game;
    if (this.game.shell && this.game.shell.bindings) {
      this.getBindingsNames = this.getBindingsNamesGS;
    } else if (this.game.buttons && this.game.buttons.bindings) {
      this.getBindingsNames = this.getBindingsNamesKB;
    } else {
      throw new Error('voxel-keys requires either kb-bindings or game-shell');
    }

    this.states = {};
    this.isActive = false;
    this.preventDefaultKeys = opts.preventDefaultKeys !== undefined ? opts.preventDefaultKeys : true;
    this.preventDefaultContext = opts.preventDefaultContext !== undefined ? opts.preventDefaultContext : true;
    this.down = new EventEmitter();
    this.up = new EventEmitter();
    this.changed = new EventEmitter();
    this.enable();
  }

  registerKey(name, defaultKey) {
    if (!this.game.shell) return;
    if (!(name in this.game.shell.bindings)) {
      this.game.shell.bind(name, defaultKey);
    }
  }

  unregisterKey(name) {
    if (!this.game.shell) return;
    this.game.shell.unbind(name);
  }

  getBindingsNamesKB(code) {
    const key = vkey[code];
    if (key === undefined) return [];
    const bindingName = this.game.buttons.bindings[key];
    return toArraySafe(bindingName);
  }

  getBindingsNamesGS(code) {
    const key = vkey[code];
    if (key === undefined) return [];

    const found = [];
    const normalizedKey = filteredVKey(key);
    for (const bindingName in this.game.shell.bindings) {
      if (this.game.shell.bindings[bindingName].indexOf(normalizedKey) !== -1) {
        found.push(bindingName);
      }
    }
    return found;
  }

  enable() {
    if (this.game.shell) {
      this.activate(true);
    } else if (this.game.interact) {
      this.game.interact.on('attain', this.onAttain = () => this.activate(true));
      this.game.interact.on('release', this.onRelease = () => this.activate(false));
    } else {
      throw new Error('voxel-keys could not enable, have neither game.shell nor game.interact');
    }

    if (this.preventDefaultContext) {
      document.body.addEventListener('contextmenu', this.onContextMenu = (ev) => {
        ev.preventDefault();
      });
    }
  }

  disable() {
    if (this.preventDefaultContext) {
      document.body.removeEventListener('contextmenu', this.onContextMenu);
    }
    this.activate(false);
    if (!this.game.shell && this.game.interact) {
      this.game.interact.removeListener('attain', this.onAttain);
      this.game.interact.removeListener('release', this.onRelease);
    }
  }

  activate(flag) {
    if (!(this.isActive ^ flag)) return;
    if (flag) {
      document.body.addEventListener('keydown', this.onKeyDown = this.keyDown.bind(this));
      document.body.addEventListener('keyup', this.onKeyUp = this.keyUp.bind(this));
    } else {
      document.body.removeEventListener('keydown', this.onKeyDown);
      document.body.removeEventListener('keyup', this.onKeyUp);
      this.states = {};
    }
    this.isActive = flag;
  }

  keyDown(ev) {
    if (this.game.shell && !this.game.shell.pointerLock) return;
    if (this.preventDefaultKeys) ev.preventDefault();
    const code = ev.keyCode;
    const current = this.states[code] || 0;
    if (current === 0) {
      const bindings = this.getBindingsNames(code);
      for (let i = 0; i < bindings.length; i += 1) {
        const binding = bindings[i];
        this.down.emit(binding, ev);
        this.changed.emit(binding, ev);
      }
    }
    this.states[code] = current + 1;
  }

  keyUp(ev) {
    if (this.game.shell && !this.game.shell.pointerLock) return;
    if (this.preventDefaultKeys) ev.preventDefault();
    const code = ev.keyCode;
    const current = this.states[code] || 0;
    if (current !== 0) {
      const bindings = this.getBindingsNames(code);
      for (let i = 0; i < bindings.length; i += 1) {
        const binding = bindings[i];
        this.up.emit(binding, ev);
        this.changed.emit(binding, ev);
      }
    }
    this.states[code] = 0;
  }
}

export default voxelKeysShim;
