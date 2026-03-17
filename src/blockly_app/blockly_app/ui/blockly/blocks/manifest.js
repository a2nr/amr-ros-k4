/**
 * Block Manifest — List of all custom block files to auto-load.
 *
 * When adding a new block, add its filename here.
 * The loader will dynamically load each file in order.
 *
 * Each file must call BlockRegistry.register() to register itself.
 */

// eslint-disable-next-line no-unused-vars
const BLOCK_FILES = [
  'mainProgram.js',
  'digitalOut.js',
  'digitalIn.js',
  'delay.js',
  'pwmWrite.js',
  'encoderRead.js',
  'odometryRead.js',
];
