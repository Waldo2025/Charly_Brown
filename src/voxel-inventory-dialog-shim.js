'use strict';

import Inventory from 'inventory';
import InventoryWindow from 'inventory-window';
import ItemPile from 'itempile';
import ModalDialog from 'voxel-modal-dialog';

const voxelInventoryDialogShim = (game, opts) => {
  return new InventoryDialog(game, opts);
};

voxelInventoryDialogShim.pluginInfo = {
  loadAfter: ['voxel-recipes', 'voxel-carry', 'voxel-registry']
};

class InventoryDialog extends ModalDialog {
  constructor(game, opts) {
    super(game, InventoryDialog.createInventoryDialogContent(game, opts));
  }

  static createInventoryDialogContent(game, opts = {}) {
    const registry = game.plugins.get('voxel-registry');
    if (!registry) throw new Error('voxel-inventory-dialog requires "voxel-registry" plugin');

    const playerInventory = game.plugins.get('voxel-carry').inventory || opts.playerInventory;
    if (!playerInventory) throw new Error('voxel-inventory-dialog requires "voxel-carry" plugin or playerInventory set');

    const playerIW = new InventoryWindow({ inventory: playerInventory, registry: registry, linkedInventory: opts.playerLinkedInventory });

    const upper = document.createElement('div');
    if (opts.upper) {
      for (const element of opts.upper) {
        upper.appendChild(element);
      }
    }

    const contents = [];
    contents.push(upper);
    contents.push(document.createElement('br'));
    contents.push(playerIW.createContainer());

    opts.contents = contents;
    opts.escapeKeys = [192, 69];

    return opts;
  }
}

export default voxelInventoryDialogShim;
export { InventoryDialog, Inventory, InventoryWindow, ItemPile };
