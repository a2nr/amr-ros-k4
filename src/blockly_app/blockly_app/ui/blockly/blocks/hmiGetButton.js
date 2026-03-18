/**
 * Block: hmiGetButton — Read button press state (latch-until-read).
 *
 * Type: Value block (Boolean output, client-side)
 * Category: HMI
 *
 * Returns true once per press, then auto-resets to false.
 * Use inside the HMI program loop to detect button clicks.
 */

BlockRegistry.register({
  name: 'hmiGetButton',
  category: 'HMI',
  categoryColor: '#00BCD4',
  color: '#00BCD4',
  tooltip: 'Returns true once when button is pressed (latch-until-read)',

  definition: {
    init: function () {
      this.appendDummyInput()
        .appendField('HMI Button pressed?')
        .appendField(new Blockly.FieldTextInput('Btn1'), 'NAME');
      this.setOutput(true, 'Boolean');
      this.setColour('#00BCD4');
      this.setTooltip('Returns true once when button is pressed (latch-until-read)');
    },
  },

  generator: function (block) {
    var name = block.getFieldValue('NAME');
    var code = "HMI.getButton('" + name + "')";
    return [code, Blockly.JavaScript.ORDER_FUNCTION_CALL];
  },
});
