/**
 * pywebview Bridge — Communication layer between Blockly and ROS2.
 *
 * Provides executeAction() which calls Python's execute_action() method
 * via the pywebview JS-to-Python bridge. When running outside of pywebview
 * (e.g., in a browser for development), falls back to a mock implementation.
 *
 * Depends on: consoleLog (defined in index.html inline script)
 */

/**
 * Execute a ROS2 action via the pywebview bridge.
 *
 * @param {string} command - Command name (e.g. 'led_on', 'delay')
 * @param {Object} params  - Key-value parameters for the command
 * @returns {Promise<{success: boolean, message: string}>}
 */
async function executeAction(command, params) {
  const keys = Object.keys(params);
  const values = Object.values(params).map(String);

  consoleLog(
    `> ${command}(${keys.map((k, i) => k + '=' + values[i]).join(', ')})`,
    'info'
  );

  let result;

  if (window.pywebview && window.pywebview.api) {
    // Running inside pywebview — call real Python bridge
    result = await window.pywebview.api.execute_action(command, keys, values);
  } else {
    // Fallback for browser dev: simulate a successful response
    consoleLog(
      '  [mock] pywebview not available, simulating success',
      'feedback'
    );
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
