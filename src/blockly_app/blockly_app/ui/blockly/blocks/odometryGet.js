
BlockRegistry.register({
  name: 'odometryGet',
  category: 'Robot',
  categoryColor: '#5b80a5',
  color: '#00897B',
  tooltip: 'Extract a field from odometry data — connect a variable block to "from"',

  definition: {
    init: function () {
      this.appendValueInput('VAR')
        .appendField('getValueOdometry')
        .appendField(new Blockly.FieldDropdown([
          ['X (cm)', 'x'],
          ['Y (cm)', 'y'],
          ['Heading (rad)', 'heading'],
          ['Vel X (cm/s)', 'vx'],
          ['Vel Y (cm/s)', 'vy'],
          ['Angular Vel (rad/s)', 'omega_z']
        ]), 'FIELD')
        .appendField('from');
      this.setOutput(true, 'Number');
      this.setColour('#00897B');
      this.setTooltip('Extract a value from odometry data — use after "set var to getOdometry"');
    }
  },

  generator: function (block) {
    var varCode = Blockly.JavaScript.valueToCode(
      block, 'VAR', Blockly.JavaScript.ORDER_MEMBER) || '{}';
    var field = block.getFieldValue('FIELD');
    var code = '(' + varCode + '.' + field + ')';
    return [code, Blockly.JavaScript.ORDER_MEMBER];
  }
});
