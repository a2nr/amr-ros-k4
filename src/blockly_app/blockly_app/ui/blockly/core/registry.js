/**
 * BlockRegistry — Central registration system for custom Blockly blocks.
 *
 * Each block file calls BlockRegistry.register() to register its visual
 * definition, code generator, and toolbox metadata. The workspace-init
 * script then reads the registry to build the toolbox automatically.
 *
 * This file must be loaded BEFORE any block files.
 */

// Global block color map — used by breakpoints to restore original colors.
const BLOCK_COLORS = {};

const BlockRegistry = (() => {
  const _blocks = [];

  /**
   * Register a custom block with its full definition.
   *
   * @param {Object} config - Block configuration
   * @param {string}   config.name          - Unique block ID (must match Python handler)
   * @param {string}   config.category      - Toolbox category name
   * @param {string}   [config.categoryColor='#5b80a5'] - Category sidebar color
   * @param {string}   config.color         - Block body color
   * @param {string}   [config.tooltip='']  - Hover tooltip text
   * @param {string}   [config.outputType]  - If set, block is an output block (e.g. 'Number')
   * @param {Object}   config.definition    - Blockly block definition (init function)
   * @param {Function} config.generator     - Code generator function
   */
  function register(config) {
    _blocks.push(config);

    // Register with Blockly
    Blockly.Blocks[config.name] = config.definition;
    javascript.javascriptGenerator.forBlock[config.name] = config.generator;

    // Register color for breakpoint restoration
    BLOCK_COLORS[config.name] = config.color;
  }

  /**
   * Get all registered blocks.
   * @returns {Object[]}
   */
  function getBlocks() {
    return _blocks;
  }

  /**
   * Build Blockly toolbox JSON config from registered blocks.
   *
   * Groups custom blocks by their category, then appends
   * built-in Blockly categories (Logic, Loops, Math, Variables).
   *
   * @returns {Object} Blockly toolbox JSON configuration
   */
  function getToolboxJSON() {
    // Group custom blocks by category
    const categories = {};
    for (const block of _blocks) {
      const catName = block.category || 'Uncategorized';
      if (!categories[catName]) {
        categories[catName] = {
          color: block.categoryColor || '#5b80a5',
          blocks: [],
        };
      }
      categories[catName].blocks.push(block.name);
    }

    const contents = [];

    // Add custom categories
    for (const [name, cat] of Object.entries(categories)) {
      contents.push({
        kind: 'category',
        name: name,
        colour: cat.color,
        contents: cat.blocks.map((blockName) => ({
          kind: 'block',
          type: blockName,
        })),
      });
    }

    // Add built-in Blockly categories
    contents.push(
      {
        kind: 'category',
        name: 'Logic',
        colour: '#5b80a5',
        contents: [
          { kind: 'block', type: 'controls_if' },
          { kind: 'block', type: 'logic_compare' },
          { kind: 'block', type: 'logic_operation' },
          { kind: 'block', type: 'logic_boolean' },
        ],
      },
      {
        kind: 'category',
        name: 'Loops',
        colour: '#5ba55b',
        contents: [
          {
            kind: 'block',
            type: 'controls_repeat_ext',
            inputs: {
              TIMES: {
                shadow: { type: 'math_number', fields: { NUM: 3 } },
              },
            },
          },
          { kind: 'block', type: 'controls_whileUntil' },
        ],
      },
      {
        kind: 'category',
        name: 'Math',
        colour: '#5b67a5',
        contents: [
          { kind: 'block', type: 'math_number' },
          { kind: 'block', type: 'math_arithmetic' },
        ],
      },
      {
        kind: 'category',
        name: 'Variables',
        colour: '#a55b80',
        custom: 'VARIABLE',
      }
    );

    return { kind: 'categoryToolbox', contents: contents };
  }

  return { register, getBlocks, getToolboxJSON };
})();
