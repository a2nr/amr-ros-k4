
BlockRegistry.register({
  name: 'pwmWrite',
  category: 'Robot',
  categoryColor: '#5b80a5',
  color: '#FF9800',
  tooltip: 'Set PCA9685 PWM channel duty cycle (0-4095)',

  definition: {
    init: function () {
      this.appendValueInput('PWM_VALUE')
        .appendField('PCA9685')
        .appendField(' addr:')
        .appendField(new Blockly.FieldDropdown([
          ['0x40', '64'], ['0x41', '65'], ['0x42', '66'], ['0x43', '67'],
          ['0x44', '68'], ['0x45', '69'], ['0x46', '70'], ['0x47', '71']
        ]), 'ADDRESS')
        .appendField(' ch:')
        .appendField(new Blockly.FieldNumber(0, 0, 15, 1), 'CHANNEL')
        .setCheck('Number')
        .appendField(' pwm:');

      this.setPreviousStatement(true, null);
      this.setNextStatement(true, null);
      this.setColour('#FF9800');
      this.setTooltip('Set PCA9685 PWM channel duty cycle (0-4095)');
    }
  },

  generator: function (block) {
    var ADDRESS = block.getFieldValue('ADDRESS');
    var CHANNEL = block.getFieldValue('CHANNEL');
    var VALUE = Blockly.JavaScript.valueToCode(block, 'PWM_VALUE', Blockly.JavaScript.ORDER_ATOMIC) || '0';
    return (
      'await highlightBlock(\'' + block.id + '\');\n' +
      'await executeAction(\'pwm_write\', { address: \'' + ADDRESS + '\', channel: \'' + CHANNEL + '\', value: String(' + VALUE + ') });\n'
    );
  }
});
