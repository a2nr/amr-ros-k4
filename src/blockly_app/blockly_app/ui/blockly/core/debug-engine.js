/**
 * Debug Engine — Step-by-step execution, breakpoints, and program control.
 *
 * Provides Run, Debug, Step Over, Step Into, Continue, and Stop functionality
 * for Blockly programs. In debug mode, execution pauses at breakpoints
 * and allows step-by-step control via async highlightBlock().
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
  callDepth: 0,        // function call nesting depth
  stepMode: null,       // 'into' | 'over' | 'continue' | null
  stepStartDepth: 0,    // callDepth when step-over was initiated
};

let debugResolve = null; // resolve function for pause/resume

// ─── Highlight Helper ───────────────────────────────────────────────────────
/**
 * Highlight the currently executing block in the workspace.
 * In non-debug mode this is synchronous (await on undefined is a no-op).
 * In debug mode, runDebug() overrides this with an async version that
 * can pause execution at breakpoints and step boundaries.
 *
 * @param {string|null} blockId - Block ID to highlight, or null to clear
 */
function highlightBlock(blockId) {
  debugState.currentBlockId = blockId;
  if (typeof workspace !== 'undefined') {
    workspace.highlightBlock(blockId);
  }
}

// ─── Call Depth Tracking ────────────────────────────────────────────────────
/**
 * Called before entering a user-defined function body.
 * Generated code injects enterFunction()/exitFunction() around procedure calls.
 */
function enterFunction() {
  debugState.callDepth++;
}

function exitFunction() {
  debugState.callDepth--;
}

// ─── Run Program (Non-Debug) ────────────────────────────────────────────────
/**
 * Run the full Blockly program using async eval().
 * No step-by-step control — just run everything as fast as possible.
 *
 * Note: eval() is intentional here — Blockly generates JavaScript code
 * strings that must be evaluated at runtime. This is the core execution
 * model for the visual programming environment.
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
    const wrappedCode = '(async function() {\n' + code + '\n})()';
    await (0, globalThis.eval)(wrappedCode);
    if (!debugState.stopRequested) {
      consoleLog('=== Program completed ===', 'success');
    }
  } catch (e) {
    if (e.message === 'STOP_EXECUTION') {
      consoleLog('=== Program stopped by user ===', 'info');
    } else {
      consoleLog('Error: ' + e.message, 'error');
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
 * Pauses at the first block, at breakpoints, and supports Step Over/Into.
 *
 * All pause logic lives in the async highlightBlock() override — this is
 * the single pause point for the entire debug engine. executeAction()
 * only checks stopRequested.
 *
 * Note: eval() is intentional — see runProgram() comment.
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
  debugState.callDepth = 0;
  debugState.stepMode = null;
  debugState.stepStartDepth = 0;
  updateButtonStates();

  consoleLog('=== Debug started ===', 'info');

  let firstHighlight = true;

  try {
    const wrappedCode = '(async function() {\n' + code + '\n})()';

    // Override executeAction — only check stop, no pause logic
    const originalExecuteAction = window.executeAction;

    window.executeAction = async function (command, params) {
      if (debugState.stopRequested) {
        throw new Error('STOP_EXECUTION');
      }
      return await originalExecuteAction(command, params);
    };

    // Override highlightBlock with async version — the universal pause point
    const originalHighlight = window.highlightBlock;

    window.highlightBlock = async function (blockId) {
      originalHighlight(blockId);

      if (debugState.stopRequested) {
        throw new Error('STOP_EXECUTION');
      }

      var shouldPause = false;

      if (firstHighlight) {
        // Always pause on the very first block in debug mode
        firstHighlight = false;
        shouldPause = true;
      } else if (debugState.stepMode === 'into') {
        shouldPause = true;
      } else if (debugState.stepMode === 'over') {
        // Only pause when back at same depth or shallower
        if (debugState.callDepth <= debugState.stepStartDepth) {
          shouldPause = true;
        }
      } else if (debugState.stepMode === 'continue' || debugState.stepMode === null) {
        // Continue or auto-run: only pause at breakpoints
        if (activeBreakpoints.has(blockId)) {
          shouldPause = true;
        }
      }

      if (shouldPause) {
        debugState.isPaused = true;
        debugState.stepMode = null;
        updateButtonStates();

        if (activeBreakpoints.has(blockId)) {
          consoleLog('Breakpoint hit on block ' + blockId, 'feedback');
        }

        await new Promise(function (resolve) {
          debugResolve = resolve;
        });

        if (debugState.stopRequested) {
          throw new Error('STOP_EXECUTION');
        }
      } else {
        // Not pausing — add small delay for visual feedback, but only when
        // it makes sense (auto-run mode). Skip delay when:
        // - continue mode (running to next breakpoint at full speed)
        // - step over inside a function body (should skip instantly)
        var inDeeperCall = debugState.stepMode === 'over' &&
          debugState.callDepth > debugState.stepStartDepth;
        if (debugState.stepMode === null && !inDeeperCall) {
          await new Promise(function (r) { setTimeout(r, 300); });
        }
      }
    };

    await (0, globalThis.eval)(wrappedCode);

    if (!debugState.stopRequested) {
      consoleLog('=== Debug completed ===', 'success');
    }
  } catch (e) {
    if (e.message === 'STOP_EXECUTION') {
      consoleLog('=== Program stopped by user ===', 'info');
    } else {
      consoleLog('Error: ' + e.message, 'error');
    }
  } finally {
    // Always restore overrides — even on error or stop
    window.executeAction = originalExecuteAction;
    window.highlightBlock = originalHighlight;
    debugState.isRunning = false;
    debugState.isPaused = false;
    debugState.callDepth = 0;
    debugState.stepMode = null;
    debugResolve = null;
    workspace.highlightBlock(null);
    updateButtonStates();
  }
}

// ─── Control Functions ──────────────────────────────────────────────────────

/**
 * Step Over: execute current block and pause at next block at same depth.
 * Skips function bodies — only pauses when callDepth <= current depth.
 */
function stepOver() {
  if (!debugState.isPaused) return;

  debugState.isPaused = false;
  debugState.stepMode = 'over';
  debugState.stepStartDepth = debugState.callDepth;

  if (debugResolve) {
    debugResolve();
    debugResolve = null;
  }
  updateButtonStates();
}

/**
 * Step Into: resume and pause on the very next highlightBlock call.
 * Enters function bodies — pauses at first block inside the function.
 */
function stepInto() {
  if (!debugState.isPaused) return;

  debugState.isPaused = false;
  debugState.stepMode = 'into';

  if (debugResolve) {
    debugResolve();
    debugResolve = null;
  }
  updateButtonStates();
}

/**
 * Continue: resume execution and only pause at the next breakpoint.
 */
function continueExecution() {
  if (!debugState.isPaused) return;

  debugState.isPaused = false;
  debugState.stepMode = 'continue';

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
  debugState.isRunning = false; // Immediately reflect stopped state in UI

  // Cancel any in-flight executeAction() call (JS + Python side)
  cancelCurrentAction();

  // If paused, resolve to allow the throw to propagate
  if (debugResolve) {
    debugResolve();
    debugResolve = null;
  }

  // Clear block highlight and update UI immediately
  workspace.highlightBlock(null);
  consoleLog('Stop requested...', 'info');
  updateButtonStates();
}
