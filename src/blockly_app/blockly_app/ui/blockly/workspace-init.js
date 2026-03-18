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

  // Dark theme — fixes toolbox text visibility against dark UI background
  const DarkTheme = Blockly.Theme.defineTheme('dark-ros2', {
    base: Blockly.Themes.Classic,
    componentStyles: {
      toolboxBackgroundColour: '#252526',
      toolboxForegroundColour: '#cccccc',
      flyoutBackgroundColour: '#2d2d2d',
      flyoutOpacity: 0.95,
    },
  });

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
    theme: DarkTheme,
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

  // Enforce single main_program and main_hmi_program blocks per workspace
  ws.addChangeListener(function (event) {
    if (event.type === Blockly.Events.BLOCK_CREATE) {
      const mainBlocks = ws.getBlocksByType('main_program');
      if (mainBlocks.length > 1) {
        const newest = mainBlocks[mainBlocks.length - 1];
        newest.dispose();
        consoleLog('Only one Main Program block is allowed', 'error');
      }
      const hmiBlocks = ws.getBlocksByType('main_hmi_program');
      if (hmiBlocks.length > 1) {
        const newest = hmiBlocks[hmiBlocks.length - 1];
        newest.dispose();
        consoleLog('Only one HMI Program block is allowed', 'error');
      }
    }
  });

  // Refresh Code tab when blocks change
  ws.addChangeListener(function () {
    const codePanel = document.getElementById('code-panel');
    if (codePanel && codePanel.style.display !== 'none') {
      refreshCodePanel();
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

  // Initialize HMI grid and design-time preview
  HMI.init();
  initHMIPreview(ws);

  // Initialize resizable panel dividers
  initResizablePanels();

  consoleLog('Blockly ROS2 Robot Controller initialized', 'info');

  return ws;
}
