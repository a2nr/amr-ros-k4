/**
 * Custom Block Definitions for Blockly ROS2 Robot Controller.
 *
 * Defines the visual appearance of robot command blocks:
 * - led_on:  Turn on LED at a given pin
 * - led_off: Turn off LED at a given pin
 * - delay:   Wait for a specified duration
 *
 * Each block also supports breakpoint toggling via click when debug mode is active.
 */

// ─── Breakpoint State ───────────────────────────────────────────────────────
const activeBreakpoints = new Set();
let debugModeActive = false;

// Original colors for restoring after breakpoint removal
const BREAKPOINT_COLOR = '#d32f2f';
const BLOCK_COLORS = {
  led_on: '#4CAF50',
  led_off: '#FF9800',
  delay: '#2196F3',
};

/**
 * Toggle breakpoint on a block.
 * When debug mode is active, clicking a block toggles its breakpoint status.
 */
function toggleBreakpoint(block) {
  if (!debugModeActive) return;

  const blockId = block.id;
  if (activeBreakpoints.has(blockId)) {
    activeBreakpoints.delete(blockId);
    // Restore original color
    const originalColor = BLOCK_COLORS[block.type] || '#888';
    block.setColour(originalColor);
  } else {
    activeBreakpoints.add(blockId);
    block.setColour(BREAKPOINT_COLOR);
  }
}

// ─── Block: led_on ──────────────────────────────────────────────────────────
Blockly.Blocks['led_on'] = {
  init: function () {
    this.appendDummyInput()
      .appendField('LED ON  pin')
      .appendField(new Blockly.FieldNumber(1, 0, 40, 1), 'PIN');
    this.setPreviousStatement(true, null);
    this.setNextStatement(true, null);
    this.setColour(BLOCK_COLORS.led_on);
    this.setTooltip('Turn on LED at the specified GPIO pin');
  },
};

// ─── Block: led_off ─────────────────────────────────────────────────────────
Blockly.Blocks['led_off'] = {
  init: function () {
    this.appendDummyInput()
      .appendField('LED OFF  pin')
      .appendField(new Blockly.FieldNumber(1, 0, 40, 1), 'PIN');
    this.setPreviousStatement(true, null);
    this.setNextStatement(true, null);
    this.setColour(BLOCK_COLORS.led_off);
    this.setTooltip('Turn off LED at the specified GPIO pin');
  },
};

// ─── Block: delay ───────────────────────────────────────────────────────────
Blockly.Blocks['delay'] = {
  init: function () {
    this.appendDummyInput()
      .appendField('Delay')
      .appendField(new Blockly.FieldNumber(500, 0, 60000, 100), 'DURATION_MS')
      .appendField('ms');
    this.setPreviousStatement(true, null);
    this.setNextStatement(true, null);
    this.setColour(BLOCK_COLORS.delay);
    this.setTooltip('Wait for the specified duration in milliseconds');
  },
};

// ─── Breakpoint Click Listener ──────────────────────────────────────────────
// Attach breakpoint toggle to workspace block click events
if (typeof workspace !== 'undefined') {
  // Will be set up after workspace is initialized in index.html
} else {
  // Setup will happen when workspace is available
  document.addEventListener('DOMContentLoaded', function () {
    // Workspace click listener is set up via executor.js setupWorkspaceListeners()
  });
}
