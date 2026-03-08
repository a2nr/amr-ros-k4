/**
 * Workspace Initialization — Sets up the Blockly workspace after all
 * blocks have been loaded and registered.
 *
 * Builds the toolbox from BlockRegistry, injects the workspace,
 * and sets up event listeners.
 *
 * Depends on: BlockRegistry (registry.js), toggleBreakpoint (breakpoints.js),
 *             debugModeActive (breakpoints.js), consoleLog (index.html)
 */

/**
 * Initialize the Blockly workspace with auto-generated toolbox.
 *
 * Call this after loadAllBlocks() has completed.
 *
 * @returns {Blockly.Workspace} The initialized workspace
 */
function initWorkspace() {
  // Build toolbox from registry
  const toolbox = BlockRegistry.getToolboxJSON();

  // Inject Blockly workspace
  const ws = Blockly.inject('blockly-div', {
    toolbox: toolbox,
    grid: {
      spacing: 20,
      length: 3,
      colour: '#333',
      snap: true,
    },
    zoom: {
      controls: true,
      wheel: true,
      startScale: 1.0,
      maxScale: 3,
      minScale: 0.3,
      scaleSpeed: 1.2,
    },
    trashcan: true,
    theme: Blockly.Themes.Classic,
  });

  // Set up breakpoint click listener
  ws.addChangeListener(function (event) {
    if (event.type === Blockly.Events.CLICK && event.blockId) {
      const block = ws.getBlockById(event.blockId);
      if (block && debugModeActive) {
        toggleBreakpoint(block);
      }
    }
  });

  // Resize handler
  function onResize() {
    const area = document.getElementById('blockly-area');
    const div = document.getElementById('blockly-div');
    div.style.width = area.offsetWidth + 'px';
    div.style.height = area.offsetHeight + 'px';
    Blockly.svgResize(ws);
  }
  window.addEventListener('resize', onResize);
  onResize();

  consoleLog('Blockly ROS2 Robot Controller initialized', 'info');

  return ws;
}
