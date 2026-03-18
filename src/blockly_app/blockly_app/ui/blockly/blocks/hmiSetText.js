/**
 * Block: hmiSetText — Display a text string on the HMI panel.
 *
 * Type: Statement block (client-side, no ROS2 action)
 * Category: HMI
 *
 * Creates or updates a text display widget in the HMI panel.
 * Accepts any expression — String() conversion handles all types.
 */

BlockRegistry.register({
  name: 'hmiSetText',
  category: 'HMI',
  categoryColor: '#00BCD4',
  color: '#00BCD4',
  tooltip: 'Display a text string on the HMI panel',

  definition: {
    init: function () {
      this.appendValueInput('TEXT')
        .appendField('HMI Text')
        .appendField(new Blockly.FieldTextInput('Status'), 'NAME')
        .appendField('=');
      this.setPreviousStatement(true, null);
      this.setNextStatement(true, null);
      this.setColour('#00BCD4');
      this.setTooltip('Display a text string on the HMI panel');
    },
  },

  generator: function (block) {
    var name = block.getFieldValue('NAME');
    var text = Blockly.JavaScript.valueToCode(
      block, 'TEXT', Blockly.JavaScript.ORDER_ATOMIC
    ) || "''";
    return (
      "await highlightBlock('" + block.id + "');\n" +
      "HMI.setText('" + name + "', String(" + text + "));\n"
    );
  },
});
