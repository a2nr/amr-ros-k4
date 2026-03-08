/**
 * Breakpoint management for Blockly debug mode.
 *
 * Tracks which blocks have breakpoints set. When debug mode is active,
 * clicking a block toggles its breakpoint (visual indicator: red color).
 *
 * Depends on: BLOCK_COLORS from registry.js
 */

const activeBreakpoints = new Set();
let debugModeActive = false;

const BREAKPOINT_COLOR = '#d32f2f';

/**
 * Toggle breakpoint on a block.
 * When debug mode is active, clicking a block toggles its breakpoint status.
 *
 * @param {Blockly.Block} block - The block to toggle breakpoint on
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
