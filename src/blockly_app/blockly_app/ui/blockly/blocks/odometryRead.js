
BlockRegistry.register({
  name: 'odometryRead',
  category: 'Robot',
  categoryColor: '#5b80a5',
  color: '#00897B',
  tooltip: 'Fetch all odometry data from source — use with "set variable" block, then extract with getValueOdometry',

  definition: {
    init: function () {
      this.appendDummyInput()
        .appendField('getOdometry')
        .appendField(new Blockly.FieldDropdown([
          ['Encoder', 'encoder']
        ]), 'SOURCE');
      this.setOutput(true, null);
      this.setColour('#00897B');
      this.setTooltip('Fetch all odometry data (x, y, heading, vx, vy, omega_z) from source');
    }
  },

  generator: function (block) {
    var source = block.getFieldValue('SOURCE');
    var code =
      'JSON.parse((await executeAction(\'odometry_read\', { source: \'' + source + '\' })).message)';
    return [code, Blockly.JavaScript.ORDER_AWAIT];
  }
});
