/**
 * Block: main_hmi_program — HMI program entry point (hat block).
 *
 * Type: Hat block (no top/bottom connectors, statement input for body)
 * Category: Program
 *
 * Runs concurrently with main_program via Promise.all().
 * The body is automatically wrapped in a while-loop by the debug engine.
 * Only one main_hmi_program block is allowed per workspace.
 *
 * Unlike main_program, this block does NOT emit highlightBlock() calls
 * so the HMI loop runs at full speed without debug pauses.
 */

BlockRegistry.register({
  name: 'main_hmi_program',
  category: 'Program',
  categoryColor: '#FF9800',
  color: '#00BCD4',
  tooltip: 'HMI program loop. Runs concurrently with Main Program. Only one allowed.',

  definition: {
    init: function () {
      this.appendDummyInput()
        .appendField('\u{1F4CA} HMI Program');
      this.appendStatementInput('BODY');
      this.setPreviousStatement(false);
      this.setNextStatement(false);
      this.setColour('#00BCD4');
      this.setTooltip('HMI program loop. Runs concurrently with Main Program. Only one allowed.');
    },
  },

  generator: function (block) {
    var body = javascript.javascriptGenerator.statementToCode(block, 'BODY');
    // No highlightBlock — HMI runs at full speed, no debug pauses
    return body;
  },
});
