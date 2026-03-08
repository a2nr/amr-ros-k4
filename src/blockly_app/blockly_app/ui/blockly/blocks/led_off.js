/**
 * Block: led_off — Turn off LED at a specified GPIO pin.
 *
 * Type: Statement block (action command)
 * Category: Robot
 * Python handler: led_off
 */

BlockRegistry.register({
  name: 'led_off',
  category: 'Robot',
  categoryColor: '#5b80a5',
  color: '#FF9800',
  tooltip: 'Turn off LED at the specified GPIO pin',

  definition: {
    init: function () {
      this.appendDummyInput()
        .appendField('LED OFF  pin')
        .appendField(new Blockly.FieldNumber(1, 0, 40, 1), 'PIN');
      this.setPreviousStatement(true, null);
      this.setNextStatement(true, null);
      this.setColour('#FF9800');
      this.setTooltip('Turn off LED at the specified GPIO pin');
    },
  },

  generator: function (block) {
    const pin = block.getFieldValue('PIN');
    return (
      "highlightBlock('" + block.id + "');\n" +
      "await executeAction('led_off', { pin: '" + pin + "' });\n"
    );
  },
});
