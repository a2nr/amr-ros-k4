/**
 * UI Tabs — Tab switching between Blocks editor and Code preview.
 *
 * Depends on: workspace (global, index.html), refreshCodePanel (this file),
 *             Blockly (vendor), javascript (vendor)
 */

/**
 * Switch between "blocks" and "code" tabs.
 * Calls Blockly.svgResize when returning to blocks tab (canvas was hidden).
 *
 * @param {string} tab - "blocks" or "code"
 */
function switchTab(tab) {
  const blocksArea = document.getElementById('blockly-area');
  const codePanel  = document.getElementById('code-panel');
  const tabBlocks  = document.getElementById('tab-blocks');
  const tabCode    = document.getElementById('tab-code');

  if (tab === 'blocks') {
    blocksArea.style.display = 'block';
    codePanel.style.display  = 'none';
    tabBlocks.classList.add('active');
    tabCode.classList.remove('active');
    // Restore Blockly canvas dimensions — they're zeroed while hidden
    if (typeof workspace !== 'undefined' && workspace) {
      Blockly.svgResize(workspace);
    }
  } else {
    blocksArea.style.display = 'none';
    codePanel.style.display  = 'block';
    tabBlocks.classList.remove('active');
    tabCode.classList.add('active');
    refreshCodePanel();
  }
}

/**
 * Regenerate JS code from workspace and display in code panel.
 * Handles both plain string (single program) and structured result
 * { definitions, mainCode, hmiCode } (concurrent mode).
 */
function refreshCodePanel() {
  if (typeof workspace === 'undefined' || !workspace) return;
  const codeResult = generateCode(workspace);

  var display = '';
  if (typeof codeResult === 'object' && codeResult.hmiCode !== undefined) {
    if (codeResult.definitions.trim()) {
      display += '// ─── Function Definitions ───\n' + codeResult.definitions + '\n';
    }
    if (codeResult.mainCode.trim()) {
      display += '// ─── Main Program ───\n' + codeResult.mainCode + '\n';
    }
    if (codeResult.hmiCode.trim()) {
      display += '// ─── HMI Program (loop ~20Hz) ───\n' + codeResult.hmiCode;
    }
  } else {
    display = typeof codeResult === 'string' ? codeResult : '';
  }

  document.getElementById('code-output').value = display || '// (no blocks)';
}
