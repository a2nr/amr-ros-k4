/**
 * Block: hmiGetSwitch — Read current switch on/off state.
 *
 * Type: Value block (Boolean output, client-side)
 * Category: HMI
 *
 * Returns true if switch is ON, false if OFF.
 */

BlockRegistry.register({
  name: 'hmiGetSwitch',
  category: 'HMI',
  categoryColor: '#00BCD4',
  color: '#00BCD4',
  tooltip: 'Read the current switch state (on/off)',

  definition: {
    init: function () {
      this.appendDummyInput()
        .appendField('HMI Switch state')
        .appendField(new Blockly.FieldTextInput('Switch1'), 'NAME');
      this.setOutput(true, 'Boolean');
      this.setColour('#00BCD4');
      this.setTooltip('Read the current switch state (on/off)');
    },
  },

  generator: function (block) {
    var name = block.getFieldValue('NAME');
    var code = "HMI.getSwitch('" + name + "')";
    return [code, Blockly.JavaScript.ORDER_FUNCTION_CALL];
  },
});
