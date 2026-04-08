'use strict';

import shellwords from 'shellwords';
import ItemPile from 'itempile';

const voxelCommandsShim = (game, opts) => new CommandsPlugin(game, opts);
voxelCommandsShim.pluginInfo = {
  loadAfter: ['voxel-console']
};

class CommandsPlugin {
  constructor(game, opts) {
    this.game = game;
    this.console = this.game.plugins.get('voxel-console');
    if (!this.console) throw new Error('voxel-commands requires voxel-console');
    this.registry = this.game.plugins.get('voxel-registry');
    if (!this.registry) throw new Error('voxel-commands requires voxel-registry');

    this.isConnectedToServer = false;

    this.usages = {
      pos: 'x y z',
      home: '',
      item: 'name [count [tags]]',
      clear: '',
      block: 'name [data]',
      plugins: '',
      enable: 'plugin',
      disable: 'plugin'
    };

    this.handlers = {
      undefined: (command, ...args) => {
        this.console.log(`Invalid command ${command} ${args.join(' ')}`);
      },
      help: () => {
        this.console.log('Available commands:');
        for (const name in this.usages) {
          let usage = this.usages[name];
          if (usage === undefined) usage = '';
          this.console.log(`.${name} ${usage}`);
        }
      },
      plugins: () => {
        const list = this.game.plugins.list();
        this.console.log(`Enabled plugins (${list.length}): ` + list.join(' '));
      },
      enable: (name) => {
        if (this.game.plugins.enable(name)) {
          this.console.log(`Enabled plugin: ${name}`);
        } else {
          this.console.log(`Failed to enable plugin: ${name}`);
        }
      },
      disable: (name) => {
        if (this.game.plugins.disable(name)) {
          this.console.log(`Disabled plugin: ${name}`);
        } else {
          this.console.log(`Failed to disable plugin: ${name}`);
        }
      },
      pos: (x, y, z) => {
        const player = this.game.plugins.get('voxel-player');
        if (player) {
          player.moveTo(x, y, z);
          this.console.log([player.position.x, player.position.y, player.position.z]);
        }
      },
      home: () => {
        if (this.game.plugins.get('voxel-player')) {
          this.game.plugins.get('voxel-player').home();
        }
      },
      item: (name, count, tagsStr) => {
        const props = this.registry.getItemProps(name);
        if (!props) {
          this.console.log(`No such item: ${name}`);
          return;
        }
        let tags;
        if (tagsStr !== undefined) {
          try {
            tags = JSON.parse(tagsStr);
          } catch (e) {
            this.console.log(`Invalid JSON ${tagsStr}: ${e}`);
            return;
          }
        } else {
          tags = undefined;
        }

        if (count !== undefined) count = 1;
        count = parseInt(count, 10);
        if (isNaN(count)) count = 1;
        const pile = new ItemPile(name, count, tags);
        const carry = this.game.plugins.get('voxel-carry');
        if (carry) {
          carry.inventory.give(pile);
          this.console.log(`Gave ${name} x ${count} ${tags !== undefined ? JSON.stringify(tags) : ''}`);
        }
      },
      clear: () => {
        const carry = this.game.plugins.get('voxel-carry');
        if (carry) {
          carry.inventory.clear();
          this.console.log('Cleared inventory');
        }
      },
      block: (name, data) => {
        if (name !== undefined) {
          const index = this.registry.getBlockIndex(name);
          if (index === undefined) {
            this.console.log(`No such block: ${name}`);
            return;
          }
        }

        const reachDistance = 8;
        const hit = this.game.raycastVoxels(this.game.cameraPosition(), this.game.cameraVector(), reachDistance);
        if (!hit) {
          this.console.log('No block targetted');
          return;
        }
        const x = hit.voxel[0];
        const y = hit.voxel[1];
        const z = hit.voxel[2];

        const oldIndex = hit.value;
        const oldName = this.registry.getBlockName(oldIndex);

        if (name !== undefined) {
          const index = this.registry.getBlockIndex(name);
          if (index !== undefined) {
            this.game.setBlock(hit.voxel, index);
          }
        }

        const blockdata = this.game.plugins.get('voxel-blockdata');
        let oldData;
        if (blockdata !== undefined) {
          oldData = blockdata.get(x, y, z);
          if (data !== undefined) {
            blockdata.set(x, y, z, data);
          }
        }

        let dataInfo = '';
        if (oldData !== undefined) {
          dataInfo = `${JSON.stringify(oldData)} -> `;
        }
        if (data === undefined) data = oldData;
        if (oldData !== undefined) {
          dataInfo += JSON.stringify(data);
        }

        if (name === undefined) name = oldName;
        this.console.log(`Set (${x}, ${y}, ${z}) ${oldName}/${oldIndex} -> ${name} ${dataInfo}`);
      }
    };

    this.handlers.p = this.handlers.position = this.handlers.tp = this.handlers.pos;
    this.handlers.i = this.handlers.give = this.handlers.item;
    this.handlers.b = this.handlers.setblock = this.handlers.set = this.handlers.block;

    this.enable();
  }

  process(input) {
    if (input.indexOf('.') !== 0) {
      if (!this.isConnectedToServer) {
        this.console.log(input);
      }
      return;
    }

    const args = shellwords.split(input.substring(1));
    const command = args.shift();
    const handler = this.handlers[command] || this.handlers.undefined;
    handler.apply(this, [command].concat(args));
  }

  enable() {
    this.console.widget.on('input', this.onInput = (text) => this.process(text));
  }

  disable() {
    this.console.widget.removeListener('input', this.onInput);
  }
}

export default voxelCommandsShim;
