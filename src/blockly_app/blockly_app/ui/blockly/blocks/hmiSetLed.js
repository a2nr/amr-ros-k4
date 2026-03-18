/**
 * Block: hmiSetLed — Set an LED indicator on the HMI panel.
 *
 * Type: Statement block (client-side, no ROS2 action)
 * Category: HMI
 *
 * Creates or updates an LED widget in the HMI panel.
 * The LED shows on/off state with a configurable color.
 */

BlockRegistry.register({
  name: 'hmiSetLed',
  category: 'HMI',
  categoryColor: '#00BCD4',
  color: '#00BCD4',
  tooltip: 'Set an LED indicator on/off in the HMI panel',

  definition: {
    init: function () {
      this.appendValueInput('STATE')
        .appendField('HMI LED')
        .appendField(new Blockly.FieldTextInput('LED1'), 'NAME')
        .appendField('color')
        .appendField(new Blockly.FieldDropdown([
          ['green', '#4caf50'],
          ['red', '#f44336'],
          ['yellow', '#ffeb3b'],
          ['blue', '#2196f3'],
          ['orange', '#ff9800'],
          ['white', '#ffffff'],
        ]), 'COLOR')
        .setCheck('Boolean')
        .appendField('state:');
      this.setPreviousStatement(true, null);
      this.setNextStatement(true, null);
      this.setColour('#00BCD4');
      this.setTooltip('Set an LED indicator on/off in the HMI panel');
    },
  },

  generator: function (block) {
    var name = block.getFieldValue('NAME');
    var color = block.getFieldValue('COLOR');
    var state = Blockly.JavaScript.valueToCode(
      block, 'STATE', Blockly.JavaScript.ORDER_ATOMIC
    ) || 'false';
    return (
      "await highlightBlock('" + block.id + "');\n" +
      "HMI.setLED('" + name + "', Boolean(" + state + "), '" + color + "');\n"
    );
  },
});
