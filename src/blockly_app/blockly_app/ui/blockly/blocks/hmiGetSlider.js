/**
 * Block: hmiGetSlider — Read current slider value.
 *
 * Type: Value block (Number output, client-side)
 * Category: HMI
 *
 * Returns the current slider position (set by user drag or setSlider).
 */

BlockRegistry.register({
  name: 'hmiGetSlider',
  category: 'HMI',
  categoryColor: '#00BCD4',
  color: '#00BCD4',
  tooltip: 'Read the current slider value',

  definition: {
    init: function () {
      this.appendDummyInput()
        .appendField('HMI Slider value')
        .appendField(new Blockly.FieldTextInput('Slider1'), 'NAME');
      this.setOutput(true, 'Number');
      this.setColour('#00BCD4');
      this.setTooltip('Read the current slider value');
    },
  },

  generator: function (block) {
    var name = block.getFieldValue('NAME');
    var code = "HMI.getSlider('" + name + "')";
    return [code, Blockly.JavaScript.ORDER_FUNCTION_CALL];
  },
});
