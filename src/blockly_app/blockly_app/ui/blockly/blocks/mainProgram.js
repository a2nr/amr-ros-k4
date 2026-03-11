/**
 * Block: main_program — Main program entry point (hat block).
 *
 * Type: Hat block (no top/bottom connectors, statement input for body)
 * Category: Program
 *
 * When present, only function definitions + this block's body are executed.
 * Orphan blocks outside the main block are ignored.
 * Only one main_program block is allowed per workspace.
 */

BlockRegistry.register({
  name: 'main_program',
  category: 'Program',
  categoryColor: '#FF9800',
  color: '#FF9800',
  tooltip: 'Main program entry point. Only one allowed per workspace.',

  definition: {
    init: function () {
      this.appendDummyInput()
        .appendField('\u{1F3C1} Main Program');
      this.appendStatementInput('BODY');
      this.setPreviousStatement(false);
      this.setNextStatement(false);
      this.setColour('#FF9800');
      this.setTooltip('Main program entry point. Only one allowed per workspace.');
    },
  },

  generator: function (block) {
    const body = javascript.javascriptGenerator.statementToCode(block, 'BODY');
    return "highlightBlock('" + block.id + "');\n" + body;
  },
});
