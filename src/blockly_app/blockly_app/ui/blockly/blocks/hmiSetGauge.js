/**
 * Block: hmiSetGauge — Display a gauge bar on the HMI panel.
 *
 * Type: Statement block (client-side, no ROS2 action)
 * Category: HMI
 *
 * Creates or updates a gauge widget in the HMI panel.
 * Shows a horizontal bar with min/max range and current value.
 */

BlockRegistry.register({
  name: 'hmiSetGauge',
  category: 'HMI',
  categoryColor: '#00BCD4',
  color: '#00BCD4',
  tooltip: 'Display a gauge bar with min/max range on the HMI panel',

  definition: {
    init: function () {
      this.appendValueInput('VALUE')
        .appendField('HMI Gauge')
        .appendField(new Blockly.FieldTextInput('Gauge1'), 'NAME')
        .setCheck('Number')
        .appendField('=');
      this.appendDummyInput()
        .appendField('min')
        .appendField(new Blockly.FieldNumber(0), 'MIN')
        .appendField('max')
        .appendField(new Blockly.FieldNumber(100), 'MAX');
      this.setPreviousStatement(true, null);
      this.setNextStatement(true, null);
      this.setColour('#00BCD4');
      this.setTooltip('Display a gauge bar with min/max range on the HMI panel');
    },
  },

  generator: function (block) {
    var name = block.getFieldValue('NAME');
    var min = block.getFieldValue('MIN');
    var max = block.getFieldValue('MAX');
    var value = Blockly.JavaScript.valueToCode(
      block, 'VALUE', Blockly.JavaScript.ORDER_ATOMIC
    ) || '0';
    return (
      "await highlightBlock('" + block.id + "');\n" +
      "HMI.setGauge('" + name + "', Number(" + value + "), " + min + ", " + max + ");\n"
    );
  },
});
