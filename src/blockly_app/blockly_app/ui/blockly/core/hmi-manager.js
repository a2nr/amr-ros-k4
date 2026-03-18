/**
 * HMI Manager — LabVIEW-style Front Panel with gridstack grid layout.
 *
 * Provides global HMI object for creating, updating, and arranging widgets
 * in a grid. Supports design-time preview (widgets created when blocks are
 * placed) and runtime mode (live values from running program).
 *
 * Uses gridstack.js for drag-to-reposition and drag-to-resize widgets.
 *
 * Security: All user-provided values rendered via textContent (no raw HTML).
 *
 * Depends on: GridStack (vendor/gridstack-all.js), #hmi-content.grid-stack
 */

// eslint-disable-next-line no-unused-vars
const HMI = (() => {
  // Internal state
  const _widgets = new Map();  // name -> { type, blockId, ...config }
  let _grid = null;            // GridStack instance
  let _mode = 'design';       // 'design' | 'runtime'

  // Default grid sizes per widget type: [width, height] in grid units
  const _defaultSizes = {
    led: [2, 1],
    number: [2, 1],
    text: [3, 1],
    gauge: [3, 2],
  };

  // Throttle rendering
  const _pendingRenders = new Set();
  let _rafScheduled = false;

  function _scheduleRender(name) {
    _pendingRenders.add(name);
    if (!_rafScheduled) {
      _rafScheduled = true;
      requestAnimationFrame(function () {
        _rafScheduled = false;
        for (var widgetName of _pendingRenders) {
          _render(widgetName);
        }
        _pendingRenders.clear();
      });
    }
  }

  // ─── Grid Initialization ───────────────────────────────────────────────

  /**
   * Initialize the GridStack instance. Called once after DOM is ready.
   */
  function init() {
    if (_grid) return;  // already initialized

    _grid = GridStack.init({
      column: 6,
      cellHeight: 70,
      margin: 4,
      float: true,
      disableOneColumnMode: true,
      removable: false,
      animate: false,
    }, '#hmi-content');
  }

  // ─── Widget Lifecycle ──────────────────────────────────────────────────

  /**
   * Add a widget to the grid. Used by design-time preview and runtime.
   * If widget with same name exists, updates it instead.
   *
   * @param {string} name - Widget identifier
   * @param {string} type - Widget type: 'led', 'number', 'text', 'gauge'
   * @param {Object} config - Type-specific config (state, value, color, etc.)
   * @param {string} [blockId] - Blockly block ID that owns this widget
   */
  function addWidget(name, type, config, blockId) {
    if (!_grid) init();

    var existing = _widgets.get(name);
    if (existing) {
      // Update existing widget
      _widgets.set(name, Object.assign({}, existing, config, { type: type, blockId: blockId || existing.blockId }));
      _scheduleRender(name);
      return;
    }

    var sizes = _defaultSizes[type] || [2, 1];
    var w = sizes[0];
    var h = sizes[1];

    // Create gridstack item
    var contentEl = document.createElement('div');
    contentEl.className = 'hmi-widget' + (_mode === 'design' ? ' hmi-widget-preview' : '');
    contentEl.id = 'hmi-w-' + name.replace(/[^a-zA-Z0-9_-]/g, '_');

    var gsWidget = _grid.addWidget({
      w: w,
      h: h,
      content: '',
      id: name,
    });

    // Replace gridstack's content with our DOM element
    var gsContent = gsWidget.querySelector('.grid-stack-item-content');
    if (gsContent) {
      gsContent.textContent = '';
      gsContent.appendChild(contentEl);
    }

    _widgets.set(name, Object.assign({}, config, {
      type: type,
      blockId: blockId || null,
      gsWidget: gsWidget,
    }));

    _scheduleRender(name);
  }

  /**
   * Remove a widget from the grid.
   */
  function removeWidget(name) {
    var widget = _widgets.get(name);
    if (!widget) return;

    if (_grid && widget.gsWidget) {
      _grid.removeWidget(widget.gsWidget, true);
    }

    _widgets.delete(name);
    _pendingRenders.delete(name);
  }

  /**
   * Update widget config without recreating it.
   */
  function updateWidget(name, config) {
    var widget = _widgets.get(name);
    if (!widget) return;
    _widgets.set(name, Object.assign({}, widget, config));
    _scheduleRender(name);
  }

  // ─── Mode Management ──────────────────────────────────────────────────

  /**
   * Switch between design and runtime modes.
   * - design: grid unlocked (drag/resize enabled), preview values
   * - runtime: grid locked, live values from running code
   */
  function setMode(mode) {
    _mode = mode;
    if (!_grid) return;

    if (mode === 'runtime') {
      _grid.enableMove(false);
      _grid.enableResize(false);
      // Switch all widgets from preview to live appearance
      _widgets.forEach(function (widget, name) {
        var el = _getWidgetEl(name);
        if (el) el.classList.remove('hmi-widget-preview');
      });
    } else {
      _grid.enableMove(true);
      _grid.enableResize(true);
      // Switch all widgets back to preview appearance
      _widgets.forEach(function (widget, name) {
        var el = _getWidgetEl(name);
        if (el) el.classList.add('hmi-widget-preview');
        // Reset to preview defaults
        _resetToPreview(name);
      });
    }
  }

  function getMode() {
    return _mode;
  }

  function _resetToPreview(name) {
    var widget = _widgets.get(name);
    if (!widget) return;

    switch (widget.type) {
      case 'led':
        widget.state = false;
        break;
      case 'number':
        widget.value = '---';
        break;
      case 'text':
        widget.text = name;
        break;
      case 'gauge':
        var mid = ((widget.min || 0) + (widget.max || 100)) / 2;
        widget.value = mid;
        break;
    }
    _scheduleRender(name);
  }

  // ─── Layout Serialization ─────────────────────────────────────────────

  /**
   * Get current grid layout for serialization.
   * @returns {Array} Array of {name, type, x, y, w, h, config}
   */
  function getLayout() {
    if (!_grid) return [];
    var items = [];

    _widgets.forEach(function (widget, name) {
      var gsWidget = widget.gsWidget;
      if (!gsWidget) return;
      var node = gsWidget.gridstackNode;
      if (!node) return;

      // Extract type-specific config (exclude internal fields)
      var config = {};
      if (widget.type === 'led') config.color = widget.color;
      if (widget.type === 'number') config.unit = widget.unit;
      if (widget.type === 'gauge') { config.min = widget.min; config.max = widget.max; }

      items.push({
        name: name,
        type: widget.type,
        x: node.x,
        y: node.y,
        w: node.w,
        h: node.h,
        config: config,
      });
    });

    return items;
  }

  /**
   * Restore grid layout from serialized data.
   * Positions existing widgets or creates new ones.
   */
  function loadLayout(items) {
    if (!_grid || !Array.isArray(items)) return;

    items.forEach(function (item) {
      var widget = _widgets.get(item.name);
      if (widget && widget.gsWidget) {
        // Reposition existing widget
        _grid.update(widget.gsWidget, {
          x: item.x,
          y: item.y,
          w: item.w,
          h: item.h,
        });
      }
    });
  }

  // ─── Render ───────────────────────────────────────────────────────────

  function _getWidgetEl(name) {
    return document.getElementById('hmi-w-' + name.replace(/[^a-zA-Z0-9_-]/g, '_'));
  }

  function _render(name) {
    var widget = _widgets.get(name);
    if (!widget) return;

    var el = _getWidgetEl(name);
    if (!el) return;

    // Clear previous content
    el.textContent = '';

    // Widget label
    var label = document.createElement('div');
    label.className = 'hmi-widget-label';
    label.textContent = name;
    el.appendChild(label);

    // Widget body
    var body = document.createElement('div');
    body.className = 'hmi-widget-body';

    switch (widget.type) {
      case 'led':
        _renderLED(body, widget);
        break;
      case 'number':
        _renderNumber(body, widget);
        break;
      case 'text':
        _renderText(body, widget);
        break;
      case 'gauge':
        _renderGauge(body, widget);
        break;
      default:
        body.textContent = 'Unknown widget type';
    }

    el.appendChild(body);
  }

  function _renderLED(body, widget) {
    var led = document.createElement('div');
    led.className = 'hmi-led ' + (widget.state ? 'on' : 'off');
    led.style.setProperty('--led-color', widget.color || '#4caf50');
    body.appendChild(led);

    var stateLabel = document.createElement('span');
    stateLabel.style.marginLeft = '8px';
    stateLabel.style.fontSize = '13px';
    stateLabel.textContent = widget.state ? 'ON' : 'OFF';
    body.appendChild(stateLabel);
  }

  function _renderNumber(body, widget) {
    var val = document.createElement('span');
    val.className = 'hmi-number-value';
    val.textContent = String(widget.value);
    body.appendChild(val);

    if (widget.unit) {
      var unit = document.createElement('span');
      unit.className = 'hmi-number-unit';
      unit.textContent = widget.unit;
      body.appendChild(unit);
    }
  }

  function _renderText(body, widget) {
    var txt = document.createElement('span');
    txt.className = 'hmi-text-value';
    txt.textContent = String(widget.text);
    body.appendChild(txt);
  }

  function _renderGauge(body, widget) {
    var min = widget.min || 0;
    var max = widget.max || 100;
    var val = Math.max(min, Math.min(max, Number(widget.value) || 0));
    var pct = max > min ? ((val - min) / (max - min)) * 100 : 0;

    var valDiv = document.createElement('div');
    valDiv.style.fontSize = '14px';
    valDiv.style.fontWeight = '600';
    valDiv.style.marginBottom = '4px';
    valDiv.textContent = String(widget.value);
    body.appendChild(valDiv);

    var bar = document.createElement('div');
    bar.className = 'hmi-gauge-bar';
    var fill = document.createElement('div');
    fill.className = 'hmi-gauge-fill';
    fill.style.width = pct.toFixed(1) + '%';
    bar.appendChild(fill);
    body.appendChild(bar);

    var labels = document.createElement('div');
    labels.className = 'hmi-gauge-labels';
    var minLabel = document.createElement('span');
    minLabel.textContent = String(min);
    labels.appendChild(minLabel);
    var maxLabel = document.createElement('span');
    maxLabel.textContent = String(max);
    labels.appendChild(maxLabel);
    body.appendChild(labels);
  }

  // ─── Public API (called from generated Blockly code) ──────────────────

  function setLED(name, state, color) {
    var existing = _widgets.get(name);
    if (existing) {
      existing.state = Boolean(state);
      existing.color = color || existing.color || '#4caf50';
      _scheduleRender(name);
    } else {
      addWidget(name, 'led', { state: Boolean(state), color: color || '#4caf50' });
    }
  }

  function setNumber(name, value, unit) {
    var existing = _widgets.get(name);
    if (existing) {
      existing.value = value;
      existing.unit = unit || existing.unit || '';
      _scheduleRender(name);
    } else {
      addWidget(name, 'number', { value: value, unit: unit || '' });
    }
  }

  function setText(name, text) {
    var existing = _widgets.get(name);
    if (existing) {
      existing.text = String(text);
      _scheduleRender(name);
    } else {
      addWidget(name, 'text', { text: String(text) });
    }
  }

  function setGauge(name, value, min, max) {
    var existing = _widgets.get(name);
    if (existing) {
      existing.value = value;
      existing.min = min;
      existing.max = max;
      _scheduleRender(name);
    } else {
      addWidget(name, 'gauge', { value: value, min: min, max: max });
    }
  }

  /**
   * Remove all widgets and reset grid.
   */
  function clearAll() {
    if (_grid) {
      _grid.removeAll(false);
    }
    _widgets.clear();
    _pendingRenders.clear();
  }

  return {
    init, addWidget, removeWidget, updateWidget,
    setMode, getMode, getLayout, loadLayout,
    setLED, setNumber, setText, setGauge, clearAll,
  };
})();
