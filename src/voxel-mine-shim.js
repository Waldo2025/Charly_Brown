'use strict';

import { EventEmitter } from 'events';

const voxelMineShim = (game, opts) => new Mine(game, opts);
voxelMineShim.pluginInfo = {
  loadAfter: ['voxel-reach', 'voxel-registry', 'voxel-inventory-hotbar']
};

class Mine extends EventEmitter {
  constructor(game, opts) {
    super();

    this.game = game;
    this.registry = game.plugins.get('voxel-registry');
    this.hotbar = game.plugins.get('voxel-inventory-hotbar');

    this.reach = game.plugins.get('voxel-reach');
    if (!this.reach) throw new Error('voxel-mine requires "voxel-reach" plugin');

    this.decals = game.plugins.get('voxel-decals');
    this.stitch = game.plugins.get('voxel-stitch');

    if (this.game.controls) {
      if (this.game.controls.needs_discrete_fire !== false) {
        throw new Error('voxel-mine requires discreteFire:false,fireRate:100 in voxel-control options (or voxel-engine controls discreteFire:false,fireRate:100)');
      }
      this.secondsPerFire = this.game.controls.fire_rate / 1000;
    } else {
      this.secondsPerFire = 100.0 / 1000.0;
    }

    if (!opts) opts = {};
    if (opts.instaMine === undefined) opts.instaMine = false;
    if (opts.timeToMine === undefined) opts.timeToMine = undefined;
    if (opts.progressTexturesPrefix === undefined) opts.progressTexturesPrefix = undefined;
    if (opts.progressTexturesCount === undefined) opts.progressTexturesCount = 10;

    if (opts.applyTextureParams === undefined) {
      opts.applyTextureParams = (texture) => {
        texture.magFilter = this.game.THREE.NearestFilter;
        texture.minFilter = this.game.THREE.LinearMipMapLinearFilter;
        texture.wrapT = this.game.THREE.RepeatWrapping;
        texture.wrapS = this.game.THREE.RepeatWrapping;
      };
    }

    if (opts.defaultTextureURL === undefined) opts.defaultTextureURL = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAARElEQVQ4y62TMQoAMAgD8/9PX7cuhYLmnAQTQZMkCdkXT7Mhb5YwHkwwNOQfkOZJNDI1MncLsO5XFFA8oLhQyYGSxMs9lwAf4Z8BoD8AAAAASUVORK5CYII=';

    this.opts = opts;

    this.instaMine = opts.instaMine;
    this.progress = 0;

    if (this.game.isClient) {
      this.texturesEnabled = !this.opts.disableOverlay && this.opts.progressTexturesPrefix !== undefined;
      if (this.texturesEnabled && this.game.shell && !this.decals) {
        throw new Error('voxel-mine with game-shell requires voxel-decals to enable textures');
      }

      this.overlay = null;
      this.setupTextures();
    }

    this.enable();
  }

  timeToMine(target) {
    if (this.opts.timeToMine !== undefined) {
      return this.opts.timeToMine(target);
    }

    if (!this.registry) return 9;

    const blockID = this.game.getBlock(target.voxel);
    const blockName = this.registry.getBlockName(blockID);
    let hardness = this.registry.getProp(blockName, 'hardness');
    if (hardness === undefined) hardness = 1.0;

    let effectiveTool = this.registry.getProp(blockName, 'effectiveTool');
    if (effectiveTool === undefined) effectiveTool = 'pickaxe';

    if (!this.hotbar) return hardness;

    const heldItem = this.hotbar.held();
    const toolClass = this.registry.getProp(heldItem !== undefined ? heldItem.item : heldItem, 'toolClass');

    let speed = 1.0;
    if (toolClass === effectiveTool) {
      speed = this.registry.getProp(heldItem !== undefined ? heldItem.item : heldItem, 'speed');
      if (speed === undefined) speed = 1.0;
    }

    return Math.max(hardness / speed, 0);
  }

  enable() {
    this.reach.on('mining', this.onMining = (target) => {
      if (!target) {
        return;
      }

      this.progress += 1;
      const progressSeconds = this.progress * this.secondsPerFire;
      const required = this.instaMine ? 0 : this.timeToMine(target);
      if (progressSeconds < required) {
        if (this.texturesEnabled) this.updateOverlay(target, progressSeconds / required);
        return;
      }

      this.progress = 0;
      this.removeOverlay();

      this.emit('break', target);
    });
  }

  disable() {
    this.reach.removeListener('mining', this.onMining);
  }

  setupTextures() {
    if (!this.game.materials.artPacks) return;
    this.game.materials.artPacks.on('refresh', () => this.refreshTextures());
    this.refreshTextures();
  }

  refreshTextures() {
    this.progressTextures = [];
    if (!this.game.materials.artPacks) return;

    for (let i = 0; i < this.opts.progressTexturesCount; ++i) {
      const name = `${this.opts.progressTexturesPrefix || ''}${i}`;
      const path = this.game.materials.artPacks.getTexture(name);
      if (!path) continue;
      if (this.game.THREE.ImageUtils) {
        if (this.game.THREE.ImageUtils.crossOrigin) delete this.game.THREE.ImageUtils.crossOrigin;
        this.progressTextures.push(this.game.THREE.ImageUtils.loadTexture(path));
      }
    }
  }

  updateOverlay(target, ratio) {
    if (!this.texturesEnabled || !this.progressTextures?.length) return;
    const index = Math.min(this.progressTextures.length - 1, Math.floor(ratio * this.progressTextures.length));
    const texture = this.progressTextures[index] || this.progressTextures[0];
    if (!texture) return;
    if (!this.overlay) {
      this.overlay = this.game.THREE.Mesh(
        new this.game.THREE.BoxGeometry(1.01, 1.01, 1.01),
        new this.game.THREE.MeshBasicMaterial({ map: texture, transparent: true })
      );
      this.game.scene.add(this.overlay);
    } else {
      this.overlay.material.map = texture;
      this.overlay.material.needsUpdate = true;
    }
    this.overlay.position.set(target.voxel[0], target.voxel[1], target.voxel[2]);
  }

  removeOverlay() {
    if (!this.overlay) return;
    this.game.scene.remove(this.overlay);
    this.overlay = null;
  }
}

export default voxelMineShim;
