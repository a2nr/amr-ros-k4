/**
 * Block: hmiSetButton — Create a clickable button on the HMI panel.
 *
 * Type: Statement block (client-side, no ROS2 action)
 * Category: HMI
 *
 * Creates or updates a button widget in the HMI panel.
 * Use hmiGetButton to read press state (latch-until-read).
 */

BlockRegistry.register({
  name: 'hmiSetButton',
  category: 'HMI',
  categoryColor: '#00BCD4',
  color: '#00BCD4',
  tooltip: 'Create a clickable button on the HMI panel',

  definition: {
    init: function () {
      this.appendDummyInput()
        .appendField('HMI Button')
        .appendField(new Blockly.FieldTextInput('Btn1'), 'NAME')
        .appendField('label')
        .appendField(new Blockly.FieldTextInput('Press'), 'LABEL')
        .appendField('color')
        .appendField(new Blockly.FieldDropdown([
          ['blue', '#2196f3'],
          ['green', '#4caf50'],
          ['red', '#f44336'],
          ['orange', '#ff9800'],
          ['gray', '#607d8b'],
        ]), 'COLOR');
      this.setPreviousStatement(true, null);
      this.setNextStatement(true, null);
      this.setColour('#00BCD4');
      this.setTooltip('Create a clickable button on the HMI panel');
    },
  },

  generator: function (block) {
    var name = block.getFieldValue('NAME');
    var label = block.getFieldValue('LABEL');
    var color = block.getFieldValue('COLOR');
    return (
      "await highlightBlock('" + block.id + "');\n" +
      "HMI.setButton('" + name + "', '" + label + "', '" + color + "');\n"
    );
  },
});
