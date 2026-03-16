
BlockRegistry.register({
  name: 'encoderRead',
  category: 'Robot',
  categoryColor: '#5b80a5',
  color: '#9C27B0',
  tooltip: 'Read AS5600 encoder angle in degrees (0-360)',

  definition: {
    init: function () {
      this.appendDummyInput()
        .appendField('Encoder Read id:')
        .appendField(new Blockly.FieldNumber(0, 0, 2, 1), 'ENCODER_ID');
      this.setOutput(true, 'Number');
      this.setColour('#9C27B0');
      this.setTooltip('Read AS5600 encoder angle in degrees (0-360)');
    }
  },

  generator: function (block) {
    var encoderId = block.getFieldValue('ENCODER_ID');
    var code =
      'parseFloat((await executeAction(\'encoder_read\', { encoder_id: \'' + encoderId + '\' })).message)';
    return [code, Blockly.JavaScript.ORDER_AWAIT];
  }
});
