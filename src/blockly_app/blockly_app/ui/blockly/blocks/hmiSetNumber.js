/**
 * Block: hmiSetNumber — Display a numeric value on the HMI panel.
 *
 * Type: Statement block (client-side, no ROS2 action)
 * Category: HMI
 *
 * Creates or updates a numeric display widget in the HMI panel.
 * Shows the value with an optional unit label (e.g., "cm", "rad/s").
 */

BlockRegistry.register({
  name: 'hmiSetNumber',
  category: 'HMI',
  categoryColor: '#00BCD4',
  color: '#00BCD4',
  tooltip: 'Display a numeric value with unit on the HMI panel',

  definition: {
    init: function () {
      this.appendValueInput('VALUE')
        .appendField('HMI Number')
        .appendField(new Blockly.FieldTextInput('Value1'), 'NAME')
        .appendField('unit')
        .appendField(new Blockly.FieldTextInput(''), 'UNIT')
        .setCheck('Number')
        .appendField('=');
      this.setPreviousStatement(true, null);
      this.setNextStatement(true, null);
      this.setColour('#00BCD4');
      this.setTooltip('Display a numeric value with unit on the HMI panel');
    },
  },

  generator: function (block) {
    var name = block.getFieldValue('NAME');
    var unit = block.getFieldValue('UNIT');
    var value = Blockly.JavaScript.valueToCode(
      block, 'VALUE', Blockly.JavaScript.ORDER_ATOMIC
    ) || '0';
    return (
      "await highlightBlock('" + block.id + "');\n" +
      "HMI.setNumber('" + name + "', Number(" + value + "), '" + unit + "');\n"
    );
  },
});
