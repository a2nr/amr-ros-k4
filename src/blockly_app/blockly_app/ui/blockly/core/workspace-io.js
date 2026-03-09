/**
 * Workspace I/O — Export and import workspace as JSON via native OS dialogs.
 *
 * Calls Python save_workspace() / load_workspace() via pywebview bridge.
 * Both methods are synchronous on the Python side (blocking file dialog),
 * and return their result directly — no evaluate_js callback needed.
 *
 * Depends on: workspace (global, index.html), consoleLog (index.html),
 *             Blockly (vendor), refreshCodePanel (ui-tabs.js)
 */

/**
 * Serialize workspace and open native OS "Save As" dialog.
 */
async function exportWorkspace() {
  if (typeof workspace === 'undefined' || !workspace) {
    consoleLog('No workspace to export', 'error');
    return;
  }
  const state = Blockly.serialization.workspaces.save(workspace);
  const json = JSON.stringify(state, null, 2);
  try {
    const res = await window.pywebview.api.save_workspace(json);
    if (res.success) {
      consoleLog('Workspace saved to: ' + res.path, 'success');
    } else if (res.error !== 'Cancelled') {
      consoleLog('Export failed: ' + res.error, 'error');
    }
  } catch (err) {
    consoleLog('Export error: ' + err, 'error');
  }
}

/**
 * Open native OS file picker and load selected JSON into workspace.
 */
async function importWorkspace() {
  try {
    const res = await window.pywebview.api.load_workspace();
    if (!res.success) {
      if (res.error !== 'Cancelled') {
        consoleLog('Import failed: ' + res.error, 'error');
      }
      return;
    }
    const state = JSON.parse(res.data);
    workspace.clear();
    Blockly.serialization.workspaces.load(state, workspace);
    consoleLog('Workspace loaded from: ' + res.path, 'success');
    const codePanel = document.getElementById('code-panel');
    if (codePanel && codePanel.style.display !== 'none') {
      refreshCodePanel();
    }
  } catch (err) {
    consoleLog('Import error: ' + err, 'error');
  }
}
