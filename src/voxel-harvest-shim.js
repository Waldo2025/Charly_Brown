'use strict';

import { EventEmitter } from 'events';
import ItemPile from 'itempile';

const voxelHarvestShim = (game, opts) => new Harvest(game, opts);
voxelHarvestShim.pluginInfo = {
  loadAfter: ['voxel-mine', 'voxel-registry', 'voxel-carry', 'voxel-inventory-hotbar', 'voxel-console']
};

class Harvest extends EventEmitter {
  constructor(game, opts) {
    super();

    this.game = game;
    this.enableToolDamage = opts?.enableToolDamage !== undefined ? opts.enableToolDamage : true;

    this.mine = game.plugins.get('voxel-mine');
    if (!this.mine) throw new Error('voxel-harvest requires "voxel-mine" plugin');

    this.registry = game.plugins.get('voxel-registry');
    if (!this.registry) throw new Error('voxel-harvest requires "voxel-registry" plugin');

    this.playerInventory = game.plugins.get('voxel-carry') ? game.plugins.get('voxel-carry').inventory : opts?.playerInventory;
    if (!this.playerInventory) throw new Error('voxel-harvest requires "voxel-carry" plugin or "playerInventory" option set to inventory instance');

    this.hotbar = game.plugins.get('voxel-inventory-hotbar');
    this.console = game.plugins.get('voxel-console');
    this.enable();
  }

  enable() {
    this.mine.on('break', this.onBreak = (target) => {
      if (!target) return;

      this.game.setBlock(target.voxel, 0);
      this.damageToolHeld(1);

      let event = {
        target,
        defaultPrevented: false,
        preventDefault: () => { event.defaultPrevented = true; }
      };
      this.emit('harvesting', event);
      if (event.defaultPrevented) return;

      const blockName = this.registry.getBlockName(target.value);
      const droppedPile = this.block2ItemPile(blockName, this.hotbar ? this.hotbar.held() : undefined);
      if (droppedPile === undefined) return;

      const excess = this.playerInventory.give(droppedPile);
      if (excess > 0) {
        this.game.setBlock(target.voxel, target.value);
        if (this.console) {
          this.console.log('Inventario lleno: no puedes cargar este bloque.');
        }
        return;
      }

      event = { target };
      this.emit('harvested', event);
    });
  }

  disable() {
    this.mine.removeListener('break', this.onBreak);
  }

  damageToolHeld(n) {
    if (n === undefined) n = 1;
    if (!this.hotbar) return;
    if (!this.enableToolDamage) return;

    let tool = this.hotbar.held();
    if (tool === undefined) return;

    const maxDamage = this.registry.getProp(tool.item, 'maxDamage');
    if (maxDamage === undefined) return;

    if (tool.tags.damage === undefined) tool.tags.damage = 0;
    tool.tags.damage += 1;

    if (tool.tags.damage >= maxDamage) {
      tool = undefined;
    }

    this.hotbar.inventory.set(this.hotbar.inventoryWindow.selectedIndex, tool);
    this.hotbar.refresh();
  }

  block2ItemPile(blockName) {
    let item = this.registry.getProp(blockName, 'itemDrop');
    if (item == null) return undefined;
    if (item === undefined) item = blockName;
    if (Array.isArray(item)) {
      return ItemPile.fromArrayIfArray(item);
    }
    return new ItemPile(item, 1);
  }
}

export default voxelHarvestShim;
