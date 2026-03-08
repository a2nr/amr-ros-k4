/**
 * Block: led_on — Turn on LED at a specified GPIO pin.
 *
 * Type: Statement block (action command)
 * Category: Robot
 * Python handler: led_on
 */

BlockRegistry.register({
  name: 'led_on',
  category: 'Robot',
  categoryColor: '#5b80a5',
  color: '#4CAF50',
  tooltip: 'Turn on LED at the specified GPIO pin',

  definition: {
    init: function () {
      this.appendDummyInput()
        .appendField('LED ON  pin')
        .appendField(new Blockly.FieldNumber(1, 0, 40, 1), 'PIN');
      this.setPreviousStatement(true, null);
      this.setNextStatement(true, null);
      this.setColour('#4CAF50');
      this.setTooltip('Turn on LED at the specified GPIO pin');
    },
  },

  generator: function (block) {
    const pin = block.getFieldValue('PIN');
    return (
      "highlightBlock('" + block.id + "');\n" +
      "await executeAction('led_on', { pin: '" + pin + "' });\n"
    );
  },
});
