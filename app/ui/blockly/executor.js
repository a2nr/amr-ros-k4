/**
 * Block Runtime Executor & Debug Engine for Blockly ROS2 Robot Controller.
 *
 * This file defines the runtime behavior of each custom block when executed
 * by Blockly, plus the debug engine that supports step-by-step execution,
 * breakpoints, and program control (Run/Stop/Step Over/Step Into).
 *
 * Key concept: Blockly is the EXECUTOR of the program. When it encounters
 * a robot action block, it calls Python via pywebview bridge and WAITS
 * for the result before continuing to the next block.
 */

// ─── Debug State ────────────────────────────────────────────────────────────
const debugState = {
  isRunning: false,
  isPaused: false,
  currentBlockId: null,
  stopRequested: false,
};

// ─── Helper: Execute Action via pywebview bridge ────────────────────────────
/**
 * Call Python's execute_action() via pywebview bridge.
 * Returns a Promise that resolves with { success: bool, message: string }.
 *
 * When running outside of pywebview (e.g. in a browser for dev),
 * this falls back to a console-based mock.
 */
async function executeAction(command, params) {
  const keys = Object.keys(params);
  const values = Object.values(params).map(String);

  consoleLog(`> ${command}(${keys.map((k, i) => k + '=' + values[i]).join(', ')})`, 'info');

  let result;

  if (window.pywebview && window.pywebview.api) {
    // Running inside pywebview — call real Python bridge
    result = await window.pywebview.api.execute_action(command, keys, values);
  } else {
    // Fallback for browser dev: simulate a successful response
    consoleLog('  [mock] pywebview not available, simulating success', 'feedback');
    await new Promise((r) => setTimeout(r, 200));
    result = { success: true, message: `[mock] ${command} executed` };
  }

  if (result.success) {
    consoleLog(`  OK: ${result.message}`, 'success');
  } else {
    consoleLog(`  FAIL: ${result.message}`, 'error');
  }

  return result;
}

// ─── Code Generators for Custom Blocks ──────────────────────────────────────
// These define what JavaScript code is generated for each block.
// The generated code is executed by eval() or JS-Interpreter.

javascript.javascriptGenerator.forBlock['led_on'] = function (block) {
  const pin = block.getFieldValue('PIN');
  const code =
    `highlightBlock('${block.id}');\n` +
    `await executeAction('led_on', { pin: '${pin}' });\n`;
  return code;
};

javascript.javascriptGenerator.forBlock['led_off'] = function (block) {
  const pin = block.getFieldValue('PIN');
  const code =
    `highlightBlock('${block.id}');\n` +
    `await executeAction('led_off', { pin: '${pin}' });\n`;
  return code;
};

javascript.javascriptGenerator.forBlock['delay'] = function (block) {
  const ms = block.getFieldValue('DURATION_MS');
  const code =
    `highlightBlock('${block.id}');\n` +
    `await executeAction('delay', { duration_ms: '${ms}' });\n`;
  return code;
};

// ─── Highlight Helper ───────────────────────────────────────────────────────
function highlightBlock(blockId) {
  debugState.currentBlockId = blockId;
  if (typeof workspace !== 'undefined') {
    workspace.highlightBlock(blockId);
  }
}

// ─── Run Program (Non-Debug) ────────────────────────────────────────────────
/**
 * Run the full Blockly program using async eval().
 * No step-by-step control — just run everything as fast as possible.
 */
async function runProgram() {
  const code = javascript.javascriptGenerator.workspaceToCode(workspace);

  if (!code.trim()) {
    consoleLog('No blocks to execute', 'error');
    return;
  }

  debugState.isRunning = true;
  debugState.isPaused = false;
  debugState.stopRequested = false;
  updateButtonStates();

  consoleLog('=== Program started ===', 'info');

  try {
    // Wrap in async function to support await
    const wrappedCode = `(async function() {\n${code}\n})()`;
    await eval(wrappedCode);
    if (!debugState.stopRequested) {
      consoleLog('=== Program completed ===', 'success');
    }
  } catch (e) {
    if (e.message === 'STOP_EXECUTION') {
      consoleLog('=== Program stopped by user ===', 'info');
    } else {
      consoleLog(`Error: ${e.message}`, 'error');
    }
  } finally {
    debugState.isRunning = false;
    debugState.isPaused = false;
    workspace.highlightBlock(null);
    updateButtonStates();
  }
}

// ─── Debug Engine ───────────────────────────────────────────────────────────
// For debug mode, we use a simpler approach: generate code as a sequence
// of async steps, then step through them one at a time.

let debugSteps = [];
let debugStepIndex = 0;
let debugResolve = null; // resolve function for pause/resume

/**
 * Run the program in debug mode.
 * Each block's generated code is treated as a step.
 * The program pauses between blocks, allowing Step Over/Step Into.
 */
async function runDebug() {
  const code = javascript.javascriptGenerator.workspaceToCode(workspace);

  if (!code.trim()) {
    consoleLog('No blocks to execute', 'error');
    return;
  }

  debugState.isRunning = true;
  debugState.isPaused = false;
  debugState.stopRequested = false;
  updateButtonStates();

  consoleLog('=== Debug started ===', 'info');

  try {
    // In debug mode, we wrap executeAction to check for stop and breakpoints
    const wrappedCode = `
      (async function() {
        ${code}
      })()
    `;

    // Override executeAction temporarily to add debug pause logic
    const originalExecuteAction = window.executeAction;

    window.executeAction = async function (command, params) {
      // Check if stop was requested
      if (debugState.stopRequested) {
        throw new Error('STOP_EXECUTION');
      }

      // Check for breakpoint on current block
      if (activeBreakpoints.has(debugState.currentBlockId)) {
        consoleLog(`Breakpoint hit on block ${debugState.currentBlockId}`, 'feedback');
        debugState.isPaused = true;
        updateButtonStates();
        // Wait until resumed
        await new Promise((resolve) => {
          debugResolve = resolve;
        });
      }

      // If running in debug auto-step mode (Run with debug on),
      // add a small delay for visual feedback
      if (!debugState.isPaused && debugModeActive) {
        await new Promise((r) => setTimeout(r, 300));
      }

      // Check stop again after pause
      if (debugState.stopRequested) {
        throw new Error('STOP_EXECUTION');
      }

      return await originalExecuteAction(command, params);
    };

    // Override highlightBlock to also pause on breakpoints
    const originalHighlight = window.highlightBlock;
    window.highlightBlock = function (blockId) {
      originalHighlight(blockId);
    };

    await eval(wrappedCode);

    if (!debugState.stopRequested) {
      consoleLog('=== Debug completed ===', 'success');
    }

    // Restore originals
    window.executeAction = originalExecuteAction;
    window.highlightBlock = originalHighlight;
  } catch (e) {
    if (e.message === 'STOP_EXECUTION') {
      consoleLog('=== Program stopped by user ===', 'info');
    } else {
      consoleLog(`Error: ${e.message}`, 'error');
    }
  } finally {
    debugState.isRunning = false;
    debugState.isPaused = false;
    debugResolve = null;
    workspace.highlightBlock(null);
    updateButtonStates();
  }
}

// ─── Control Functions ──────────────────────────────────────────────────────

/**
 * Called when Run button is clicked.
 * Runs in debug mode or normal mode depending on debug toggle.
 */
function onRunClick() {
  if (debugModeActive) {
    runDebug();
  } else {
    runProgram();
  }
}

/**
 * Step Over: resume from pause, execute current block, pause at next block.
 */
function stepOver() {
  if (!debugState.isPaused) return;

  debugState.isPaused = false;

  // Set up a one-time pause on next block change
  const currentBlock = debugState.currentBlockId;
  const origExec = window.executeAction;

  // We'll resume, and the next time highlightBlock changes, we pause
  const origHighlight = window.highlightBlock;
  window.highlightBlock = function (blockId) {
    origHighlight(blockId);
    if (blockId !== currentBlock) {
      // Moved to a new block — pause again
      debugState.isPaused = true;
      updateButtonStates();
      window.highlightBlock = origHighlight;
    }
  };

  if (debugResolve) {
    debugResolve();
    debugResolve = null;
  }
  updateButtonStates();
}

/**
 * Step Into: resume from pause, execute one interpreter step.
 * For our async model, this behaves same as Step Over but
 * will enter into loop/conditional blocks.
 */
function stepInto() {
  if (!debugState.isPaused) return;

  debugState.isPaused = false;

  // Pause on the very next highlightBlock call
  const origHighlight = window.highlightBlock;
  window.highlightBlock = function (blockId) {
    origHighlight(blockId);
    debugState.isPaused = true;
    updateButtonStates();
    window.highlightBlock = origHighlight;
  };

  if (debugResolve) {
    debugResolve();
    debugResolve = null;
  }
  updateButtonStates();
}

/**
 * Stop execution immediately.
 */
function stopExecution() {
  debugState.stopRequested = true;
  debugState.isPaused = false;

  // If paused, resolve to allow the throw to propagate
  if (debugResolve) {
    debugResolve();
    debugResolve = null;
  }

  consoleLog('Stop requested...', 'info');
  updateButtonStates();
}

// ─── Debug Mode Toggle ─────────────────────────────────────────────────────
function onDebugToggle(checked) {
  debugModeActive = checked;

  if (!checked) {
    // Clear all breakpoints when debug mode is turned off
    activeBreakpoints.forEach((blockId) => {
      const block = workspace.getBlockById(blockId);
      if (block) {
        const originalColor = BLOCK_COLORS[block.type] || '#888';
        block.setColour(originalColor);
      }
    });
    activeBreakpoints.clear();
  }

  consoleLog(`Debug mode: ${checked ? 'ON' : 'OFF'}`, 'info');
}

// ─── Button State Management ────────────────────────────────────────────────
function updateButtonStates() {
  const btnRun = document.getElementById('btn-run');
  const btnStepOver = document.getElementById('btn-step-over');
  const btnStepInto = document.getElementById('btn-step-into');
  const btnStop = document.getElementById('btn-stop');

  if (debugState.isRunning) {
    btnRun.disabled = true;
    btnStop.disabled = false;
    btnStepOver.disabled = !debugState.isPaused;
    btnStepInto.disabled = !debugState.isPaused;
  } else {
    btnRun.disabled = false;
    btnStop.disabled = true;
    btnStepOver.disabled = true;
    btnStepInto.disabled = true;
  }
}

// ─── Workspace Click Listener for Breakpoints ───────────────────────────────
/**
 * Setup click listener on workspace for breakpoint toggling.
 * Must be called after workspace is initialized.
 */
function setupWorkspaceListeners(ws) {
  ws.addChangeListener(function (event) {
    if (event.type === Blockly.Events.CLICK && event.blockId) {
      const block = ws.getBlockById(event.blockId);
      if (block && debugModeActive) {
        toggleBreakpoint(block);
      }
    }
  });
}

// Initialize workspace listeners when DOM is ready
document.addEventListener('DOMContentLoaded', function () {
  if (typeof workspace !== 'undefined') {
    setupWorkspaceListeners(workspace);
  }
});

// Try to set up immediately if workspace already exists
if (typeof workspace !== 'undefined') {
  setupWorkspaceListeners(workspace);
}
