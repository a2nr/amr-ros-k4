
BlockRegistry.register({
  name: 'digitalOut',              // Must match Python handler name
  category: 'Robot',
  categoryColor: '#5b80a5',
  color: '#4CAF50',
  tooltip: 'set a digital output pin to HIGH (turn on LED)',

  definition: {
    init: function () {
      this.appendValueInput('digitalOut')
        .appendField(' gpio:')
        // FieldNumber(default, min, max, step)
        .appendField(new Blockly.FieldNumber(1, 0, 27, 1), 'GPIO')
        .setCheck('Boolean')
        .appendField(' state:');

      this.setPreviousStatement(true, null);  // connect above
      this.setNextStatement(true, null);      // connect below
      this.setColour('#4CAF50');
      this.setTooltip('set a digital output pin to HIGH (turn on LED)');
    }
  },

  generator: function (block) {
    const GPIO = block.getFieldValue('GPIO');
    const STATE = Blockly.JavaScript.valueToCode(block, 'digitalOut', Blockly.JavaScript.ORDER_ATOMIC) || 'false';
    return (
      'await highlightBlock(\'' + block.id + '\');\n' +
      'await executeAction(\'digital_out\', { gpio: \'' + GPIO + '\', state: String(' + STATE + ') });\n'
    );
  }
});