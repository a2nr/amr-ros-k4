/**
 * Block: delay — Wait for a specified duration in milliseconds.
 *
 * Type: Statement block (action command)
 * Category: Robot
 * Python handler: delay
 */

BlockRegistry.register({
  name: 'delay',
  category: 'Robot',
  categoryColor: '#5b80a5',
  color: '#2196F3',
  tooltip: 'Wait for the specified duration in milliseconds',

  definition: {
    init: function () {
      this.appendDummyInput()
        .appendField('Delay')
        .appendField(new Blockly.FieldNumber(500, 0, 60000, 100), 'DURATION_MS')
        .appendField('ms');
      this.setPreviousStatement(true, null);
      this.setNextStatement(true, null);
      this.setColour('#2196F3');
      this.setTooltip('Wait for the specified duration in milliseconds');
    },
  },

  generator: function (block) {
    const ms = block.getFieldValue('DURATION_MS');
    return (
      "await highlightBlock('" + block.id + "');\n" +
      "await executeAction('delay', { duration_ms: '" + ms + "' });\n"
    );
  },
});
