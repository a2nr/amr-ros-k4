/**
 * UI Controls — Button state management and event handlers.
 *
 * Manages the toolbar buttons (Run, Step Over, Step Into, Stop)
 * and the debug mode toggle.
 *
 * Depends on: debugState (debug-engine.js), debugModeActive/activeBreakpoints
 *             (breakpoints.js), BLOCK_COLORS (registry.js),
 *             runProgram/runDebug (debug-engine.js)
 */

// ─── Run Button Handler ─────────────────────────────────────────────────────
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

// ─── Debug Mode Toggle ─────────────────────────────────────────────────────
/**
 * Called when the debug mode checkbox is toggled.
 * Clears all breakpoints when debug mode is turned off.
 *
 * @param {boolean} checked - Whether debug mode is now active
 */
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
/**
 * Update toolbar button enabled/disabled states based on current debug state.
 */
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
