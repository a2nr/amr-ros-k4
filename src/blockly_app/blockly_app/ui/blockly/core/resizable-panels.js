/**
 * Resizable Panels — Drag dividers between Blockly/HMI and workspace/console.
 *
 * Two dividers:
 * - Vertical (#resize-v): between #left-pane and #hmi-panel (col-resize)
 * - Horizontal (#resize-h): between #workspace-area and #console-panel (row-resize)
 *
 * Listeners are on document (not the divider element) so dragging remains
 * smooth even when cursor moves fast past the narrow 4px handle.
 *
 * Depends on: Blockly (vendor), workspace (global)
 */

// eslint-disable-next-line no-unused-vars
function initResizablePanels() {
  var resizeV = document.getElementById('resize-v');
  var resizeH = document.getElementById('resize-h');
  var hmiPanel = document.getElementById('hmi-panel');
  var consolePanel = document.getElementById('console-panel');

  var dragging = null; // 'v' | 'h' | null

  // ─── Vertical divider: left-pane ↔ hmi-panel ───────────────────────────
  if (resizeV && hmiPanel) {
    resizeV.addEventListener('mousedown', function (e) {
      e.preventDefault();
      dragging = 'v';
      resizeV.classList.add('dragging');
      document.body.style.userSelect = 'none';
      document.body.style.cursor = 'col-resize';
    });
  }

  // ─── Horizontal divider: workspace-area ↔ console-panel ────────────────
  if (resizeH && consolePanel) {
    resizeH.addEventListener('mousedown', function (e) {
      e.preventDefault();
      dragging = 'h';
      resizeH.classList.add('dragging');
      document.body.style.userSelect = 'none';
      document.body.style.cursor = 'row-resize';
    });
  }

  // ─── Mousemove: handle drag ────────────────────────────────────────────
  document.addEventListener('mousemove', function (e) {
    if (!dragging) return;

    if (dragging === 'v') {
      // HMI panel width = distance from cursor to right edge
      var newWidth = window.innerWidth - e.clientX;
      var maxWidth = window.innerWidth * 0.5;
      newWidth = Math.max(200, Math.min(maxWidth, newWidth));
      hmiPanel.style.width = newWidth + 'px';
    } else if (dragging === 'h') {
      // Console height = distance from cursor to bottom edge
      var newHeight = window.innerHeight - e.clientY;
      var maxHeight = window.innerHeight * 0.4;
      newHeight = Math.max(80, Math.min(maxHeight, newHeight));
      consolePanel.style.height = newHeight + 'px';
    }

    // Update Blockly container dimensions to match new layout, then resize SVG
    var area = document.getElementById('blockly-area');
    var div = document.getElementById('blockly-div');
    if (area && div) {
      div.style.width = area.offsetWidth + 'px';
      div.style.height = area.offsetHeight + 'px';
    }
    if (typeof workspace !== 'undefined' && workspace) {
      Blockly.svgResize(workspace);
    }
  });

  // ─── Mouseup: end drag ─────────────────────────────────────────────────
  document.addEventListener('mouseup', function () {
    if (!dragging) return;

    if (dragging === 'v' && resizeV) resizeV.classList.remove('dragging');
    if (dragging === 'h' && resizeH) resizeH.classList.remove('dragging');

    dragging = null;
    document.body.style.userSelect = '';
    document.body.style.cursor = '';
  });
}
