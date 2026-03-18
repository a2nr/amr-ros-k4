/**
 * HMI Preview — Design-time widget preview via workspace event listener.
 *
 * When an HMI block is placed in the workspace, a preview widget immediately
 * appears in the HMI panel grid. When the block's NAME field changes, the
 * widget label updates. When the block is deleted, the widget is removed.
 *
 * Depends on: HMI (hmi-manager.js), Blockly (vendor), workspace (global)
 */

// eslint-disable-next-line no-unused-vars
function initHMIPreview(ws) {
  // Map from block ID to widget name (for tracking renames and deletions)
  var _blockToWidget = new Map();

  // HMI block types that trigger preview
  var HMI_BLOCK_TYPES = {
    hmiSetLed: 'led',
    hmiSetNumber: 'number',
    hmiSetText: 'text',
    hmiSetGauge: 'gauge',
    hmiSetButton: 'button',
    hmiSetSlider: 'slider',
    hmiSetSwitch: 'switch',
  };

  // Name prefixes for auto-increment (extracted from default field values)
  var _namePrefixPattern = /^(.+?)(\d+)$/;

  /**
   * Generate a unique widget name by auto-incrementing the numeric suffix.
   * e.g., if 'LED1' is taken, returns 'LED2', then 'LED3', etc.
   */
  function _uniqueName(baseName) {
    var taken = false;
    _blockToWidget.forEach(function (n) { if (n === baseName) taken = true; });
    if (!taken) return baseName;

    var match = _namePrefixPattern.exec(baseName);
    var prefix = match ? match[1] : baseName;
    var counter = match ? Number(match[2]) : 1;

    while (true) {
      counter++;
      var candidate = prefix + counter;
      var used = false;
      _blockToWidget.forEach(function (n) { if (n === candidate) used = true; });
      if (!used) return candidate;
    }
  }

  // Default preview configs per widget type
  var _previewDefaults = {
    led: { state: false, color: '#4caf50' },
    number: { value: '---', unit: '' },
    text: { text: '' },
    gauge: { value: 50, min: 0, max: 100 },
    button: { label: 'Press', color: '#2196f3', _pressed: false },
    slider: { value: 50, min: 0, max: 100, _userValue: 50, _userInteracting: false },
    switch: { state: false },
  };

  /**
   * Read current config from a block's fields.
   */
  function _readBlockConfig(block) {
    var type = HMI_BLOCK_TYPES[block.type];
    var config = Object.assign({}, _previewDefaults[type] || {});

    // Read fields that exist on the block
    var name = block.getFieldValue('NAME');
    if (type === 'led') {
      config.color = block.getFieldValue('COLOR') || '#4caf50';
    } else if (type === 'number') {
      config.unit = block.getFieldValue('UNIT') || '';
    } else if (type === 'gauge') {
      config.min = Number(block.getFieldValue('MIN')) || 0;
      config.max = Number(block.getFieldValue('MAX')) || 100;
      config.value = (config.min + config.max) / 2;
    } else if (type === 'text') {
      config.text = name || '';
    } else if (type === 'button') {
      config.label = block.getFieldValue('LABEL') || 'Press';
      config.color = block.getFieldValue('COLOR') || '#2196f3';
    } else if (type === 'slider') {
      config.min = Number(block.getFieldValue('MIN')) || 0;
      config.max = Number(block.getFieldValue('MAX')) || 100;
      config.value = (config.min + config.max) / 2;
      config._userValue = config.value;
    } else if (type === 'switch') {
      config.state = false;
    }

    return { name: name, config: config };
  }

  // Debounced reconcile timer — catches undo/redo edge cases
  var _reconcileTimer = null;

  /**
   * Handle workspace change events for HMI block preview.
   */
  ws.addChangeListener(function (event) {
    // Don't update during runtime
    if (HMI.getMode() === 'runtime') return;

    if (event.type === Blockly.Events.BLOCK_CREATE) {
      _handleCreate(event);
    } else if (event.type === Blockly.Events.BLOCK_DELETE) {
      _handleDelete(event);
    } else if (event.type === Blockly.Events.BLOCK_CHANGE) {
      _handleChange(event);
    }

    // Debounced reconcile — syncs widgets with actual workspace state
    // Catches edge cases from undo, redo, paste, drag-to-trash
    clearTimeout(_reconcileTimer);
    _reconcileTimer = setTimeout(_reconcile, 100);
  });

  function _handleCreate(event) {
    // BLOCK_CREATE can contain multiple block IDs (when pasting/loading)
    var ids = event.ids || [event.blockId];

    for (var i = 0; i < ids.length; i++) {
      var block = ws.getBlockById(ids[i]);
      if (!block || !HMI_BLOCK_TYPES[block.type]) continue;

      var type = HMI_BLOCK_TYPES[block.type];
      var info = _readBlockConfig(block);
      var name = info.name || block.type + '_' + block.id.substring(0, 4);

      // Auto-increment name if already taken by another block
      var uniqueName = _uniqueName(name);
      if (uniqueName !== name) {
        block.setFieldValue(uniqueName, 'NAME');
        name = uniqueName;
      }

      _blockToWidget.set(block.id, name);
      HMI.addWidget(name, type, info.config, block.id);
    }
  }

  function _handleDelete(event) {
    // BLOCK_DELETE: block is already gone from workspace
    var ids = event.ids || [event.blockId];

    for (var i = 0; i < ids.length; i++) {
      var deletedId = ids[i];
      var name = _blockToWidget.get(deletedId);
      if (name) {
        _blockToWidget.delete(deletedId);

        // Only remove widget if no other block still uses this name
        var stillUsed = false;
        _blockToWidget.forEach(function (n) { if (n === name) stillUsed = true; });
        if (!stillUsed) {
          HMI.removeWidget(name);
        }
      }
    }
  }

  function _handleChange(event) {
    if (!event.blockId) return;
    var block = ws.getBlockById(event.blockId);
    if (!block || !HMI_BLOCK_TYPES[block.type]) return;

    var oldName = _blockToWidget.get(block.id);
    if (!oldName) return;  // block not tracked (shouldn't happen)

    if (event.name === 'NAME') {
      // Widget name changed — remove old, create new
      var newName = event.newValue || block.type + '_' + block.id.substring(0, 4);
      if (newName !== oldName) {
        HMI.removeWidget(oldName);
        _blockToWidget.set(block.id, newName);

        var type = HMI_BLOCK_TYPES[block.type];
        var info = _readBlockConfig(block);
        HMI.addWidget(newName, type, info.config, block.id);
      }
    } else {
      // Other field changed (COLOR, UNIT, MIN, MAX) — update config
      var info2 = _readBlockConfig(block);
      HMI.updateWidget(oldName, info2.config);
    }
  }

  /**
   * Reconcile _blockToWidget map with actual workspace state.
   * Removes widgets for deleted blocks, adds widgets for untracked blocks.
   * Called on a debounce after any workspace change event.
   */
  function _reconcile() {
    if (HMI.getMode() === 'runtime') return;

    // 1. Find all HMI blocks currently in workspace
    var currentBlocks = new Map();
    var allBlocks = ws.getAllBlocks(false);
    for (var i = 0; i < allBlocks.length; i++) {
      var block = allBlocks[i];
      if (!HMI_BLOCK_TYPES[block.type]) continue;
      var type = HMI_BLOCK_TYPES[block.type];
      var info = _readBlockConfig(block);
      var name = info.name || block.type + '_' + block.id.substring(0, 4);
      currentBlocks.set(block.id, { type: type, name: name, config: info.config });
    }

    // 2. Remove widgets for blocks that no longer exist
    var toRemove = [];
    _blockToWidget.forEach(function (name, blockId) {
      if (!currentBlocks.has(blockId)) {
        toRemove.push({ blockId: blockId, name: name });
      }
    });
    for (var j = 0; j < toRemove.length; j++) {
      HMI.removeWidget(toRemove[j].name);
      _blockToWidget.delete(toRemove[j].blockId);
    }

    // 3. Add widgets for blocks that aren't tracked
    currentBlocks.forEach(function (info, blockId) {
      if (!_blockToWidget.has(blockId)) {
        _blockToWidget.set(blockId, info.name);
        HMI.addWidget(info.name, info.type, info.config, blockId);
      }
    });
  }

  /**
   * Scan existing blocks on workspace load to recreate previews.
   * Called after importing a workspace.
   */
  function scanExistingBlocks() {
    var allBlocks = ws.getAllBlocks(false);
    for (var i = 0; i < allBlocks.length; i++) {
      var block = allBlocks[i];
      if (!HMI_BLOCK_TYPES[block.type]) continue;
      if (_blockToWidget.has(block.id)) continue;  // already tracked

      var type = HMI_BLOCK_TYPES[block.type];
      var info = _readBlockConfig(block);
      var name = info.name || block.type + '_' + block.id.substring(0, 4);

      _blockToWidget.set(block.id, name);
      HMI.addWidget(name, type, info.config, block.id);
    }
  }

  // Expose scan function globally for workspace-io.js to call after import
  window._hmiPreviewScan = scanExistingBlocks;
}
