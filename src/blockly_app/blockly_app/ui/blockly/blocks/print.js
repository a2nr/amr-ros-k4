/**
 * Block: print — Output a value to the console panel for debugging.
 *
 * Type: Statement block (client-side, no ROS2 action)
 * Category: Program
 *
 * This is a purely client-side block — it calls consoleLog() directly
 * in generated JS code, with zero ROS2 round-trip. Uses String(expr)
 * pattern to handle any expression type (variables, math, strings).
 */

BlockRegistry.register({
  name: 'print',
  category: 'Program',
  categoryColor: '#FF9800',
  color: '#FFCA28',
  tooltip: 'Print a value to the console for debugging',

  definition: {
    init: function () {
      this.appendValueInput('TEXT')
        .appendField('Print');
      this.setPreviousStatement(true, null);
      this.setNextStatement(true, null);
      this.setColour('#FFCA28');
      this.setTooltip('Print a value to the console for debugging');
    },
  },

  generator: function (block) {
    var value = Blockly.JavaScript.valueToCode(
      block, 'TEXT', Blockly.JavaScript.ORDER_ATOMIC
    ) || "''";
    return (
      "await highlightBlock('" + block.id + "');\n" +
      "consoleLog(String( ' USER LOG >>> ' + " + value + "), 'print');\n"
    );
  },
});
