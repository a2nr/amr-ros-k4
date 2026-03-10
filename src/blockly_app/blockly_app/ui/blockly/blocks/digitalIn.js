
BlockRegistry.register({
  name: 'digitalIn',
  category: 'Robot',
  categoryColor: '#5b80a5',
  color: '#E91E63',
  tooltip: 'Read digital input pin state (returns 0 or 1)',

  definition: {
    init: function () {
      this.appendDummyInput()
        .appendField('Digital Read gpio:')
        .appendField(new Blockly.FieldNumber(5, 0, 27, 1), 'GPIO');
      this.setOutput(true, 'Number');
      this.setColour('#E91E63');
      this.setTooltip('Read digital input pin state (returns 0 or 1)');
    }
  },

  generator: function (block) {
    const gpio = block.getFieldValue('GPIO');
    const code =
      "parseFloat((await executeAction('digital_in', { gpio: '" + gpio + "' })).message)";
    return [code, Blockly.JavaScript.ORDER_AWAIT];
  }
});
