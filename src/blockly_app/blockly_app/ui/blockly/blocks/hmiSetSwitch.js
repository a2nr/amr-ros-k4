/**
 * Block: hmiSetSwitch — Create a toggle switch on the HMI panel.
 *
 * Type: Statement block (client-side, no ROS2 action)
 * Category: HMI
 *
 * Creates or updates a toggle switch widget.
 * Use hmiGetSwitch to read the current on/off state.
 */

BlockRegistry.register({
  name: 'hmiSetSwitch',
  category: 'HMI',
  categoryColor: '#00BCD4',
  color: '#00BCD4',
  tooltip: 'Create a toggle switch on the HMI panel',

  definition: {
    init: function () {
      this.appendValueInput('STATE')
        .appendField('HMI Switch')
        .appendField(new Blockly.FieldTextInput('Switch1'), 'NAME')
        .setCheck('Boolean')
        .appendField('state:');
      this.setPreviousStatement(true, null);
      this.setNextStatement(true, null);
      this.setColour('#00BCD4');
      this.setTooltip('Create a toggle switch on the HMI panel');
    },
  },

  generator: function (block) {
    var name = block.getFieldValue('NAME');
    var state = Blockly.JavaScript.valueToCode(
      block, 'STATE', Blockly.JavaScript.ORDER_ATOMIC
    ) || 'false';
    return (
      "await highlightBlock('" + block.id + "');\n" +
      "HMI.setSwitch('" + name + "', Boolean(" + state + "));\n"
    );
  },
});
