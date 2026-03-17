
BlockRegistry.register({
  name: 'odometryRead',
  category: 'Robot',
  categoryColor: '#5b80a5',
  color: '#00897B',
  tooltip: 'Read robot odometry — position (cm), velocity (cm/s), or heading (rad)',

  definition: {
    init: function () {
      this.appendDummyInput()
        .appendField('Odometry Read source:')
        .appendField(new Blockly.FieldDropdown([
          ['Encoder', 'encoder']
        ]), 'SOURCE')
        .appendField('field:')
        .appendField(new Blockly.FieldDropdown([
          ['X (cm)', 'x'],
          ['Y (cm)', 'y'],
          ['Heading (rad)', 'heading'],
          ['Vel X (cm/s)', 'vx'],
          ['Vel Y (cm/s)', 'vy'],
          ['Angular Vel (rad/s)', 'omega_z']
        ]), 'FIELD');
      this.setOutput(true, 'Number');
      this.setColour('#00897B');
      this.setTooltip('Read robot odometry — position (cm), velocity (cm/s), or heading (rad)');
    }
  },

  generator: function (block) {
    var source = block.getFieldValue('SOURCE');
    var field = block.getFieldValue('FIELD');
    var code =
      'parseFloat((await executeAction(\'odometry_read\', { source: \'' + source + '\', field: \'' + field + '\' })).message)';
    return [code, Blockly.JavaScript.ORDER_AWAIT];
  }
});
