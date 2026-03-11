/**
 * Debug Engine — Step-by-step execution, breakpoints, and program control.
 *
 * Provides Run, Debug, Step Over, Step Into, and Stop functionality
 * for Blockly programs. In debug mode, execution pauses at breakpoints
 * and allows step-by-step control.
 *
 * Depends on: executeAction (bridge.js), activeBreakpoints/debugModeActive
 *             (breakpoints.js), updateButtonStates (ui-controls.js),
 *             consoleLog (index.html), workspace (workspace-init.js)
 */

// ─── Debug State ────────────────────────────────────────────────────────────
const debugState = {
  isRunning: false,
  isPaused: false,
  currentBlockId: null,
  stopRequested: false,
};

let debugResolve = null; // resolve function for pause/resume

// ─── Highlight Helper ───────────────────────────────────────────────────────
/**
 * Highlight the currently executing block in the workspace.
 * @param {string|null} blockId - Block ID to highlight, or null to clear
 */
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
  const code = generateCode(workspace);

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
/**
 * Run the program in debug mode.
 * Pauses at breakpoints and supports Step Over/Step Into.
 */
async function runDebug() {
  const code = generateCode(workspace);

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
        consoleLog(
          `Breakpoint hit on block ${debugState.currentBlockId}`,
          'feedback'
        );
        debugState.isPaused = true;
        updateButtonStates();
        // Wait until resumed
        await new Promise((resolve) => {
          debugResolve = resolve;
        });
      }

      // If running in debug auto-step mode, add a small delay for visual feedback
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
 * Step Over: resume from pause, execute current block, pause at next block.
 */
function stepOver() {
  if (!debugState.isPaused) return;

  debugState.isPaused = false;

  const currentBlock = debugState.currentBlockId;
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
 * For our async model, this pauses on the very next highlightBlock call.
 */
function stepInto() {
  if (!debugState.isPaused) return;

  debugState.isPaused = false;

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

  // Cancel any in-flight executeAction() call (JS + Python side)
  cancelCurrentAction();

  // If paused, resolve to allow the throw to propagate
  if (debugResolve) {
    debugResolve();
    debugResolve = null;
  }

  consoleLog('Stop requested...', 'info');
  updateButtonStates();
}
