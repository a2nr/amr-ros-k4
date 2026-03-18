/**
 * Workspace I/O — Export and import workspace as JSON via native OS dialogs.
 *
 * Saves both Blockly workspace state and HMI grid layout in a combined
 * format: { workspace: {...}, hmiLayout: [...] }
 *
 * Backward compatible: imports old format (plain workspace JSON) by
 * detecting presence of 'workspace' key.
 *
 * Depends on: workspace (global), consoleLog (index.html), HMI (hmi-manager.js),
 *             Blockly (vendor), refreshCodePanel (ui-tabs.js)
 */

/**
 * Serialize workspace + HMI layout and open native OS "Save As" dialog.
 */
async function exportWorkspace() {
  if (typeof workspace === 'undefined' || !workspace) {
    consoleLog('No workspace to export', 'error');
    return;
  }
  var wsState = Blockly.serialization.workspaces.save(workspace);
  var hmiLayout = HMI.getLayout();

  var combined = {
    workspace: wsState,
    hmiLayout: hmiLayout,
  };
  var json = JSON.stringify(combined, null, 2);

  try {
    var res = await window.pywebview.api.save_workspace(json);
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
 * Supports both new format (combined) and old format (plain workspace).
 */
async function importWorkspace() {
  try {
    var res = await window.pywebview.api.load_workspace();
    if (!res.success) {
      if (res.error !== 'Cancelled') {
        consoleLog('Import failed: ' + res.error, 'error');
      }
      return;
    }

    var parsed = JSON.parse(res.data);

    // Detect format: new (has 'workspace' key) vs old (plain workspace)
    var wsState;
    var hmiLayout = null;
    if (parsed.workspace && typeof parsed.workspace === 'object') {
      wsState = parsed.workspace;
      hmiLayout = parsed.hmiLayout || null;
    } else {
      wsState = parsed;  // Old format: plain workspace JSON
    }

    // Clear everything
    workspace.clear();
    HMI.clearAll();

    // Load workspace (this triggers BLOCK_CREATE events → preview widgets created)
    Blockly.serialization.workspaces.load(wsState, workspace);

    // Restore HMI grid layout if available
    if (hmiLayout) {
      // Wait for previews to be created by block events, then apply layout
      setTimeout(function () {
        HMI.loadLayout(hmiLayout);
      }, 100);
    }

    consoleLog('Workspace loaded from: ' + res.path, 'success');

    var codePanel = document.getElementById('code-panel');
    if (codePanel && codePanel.style.display !== 'none') {
      refreshCodePanel();
    }
  } catch (err) {
    consoleLog('Import error: ' + err, 'error');
  }
}
