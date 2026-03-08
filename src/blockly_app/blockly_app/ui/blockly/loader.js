/**
 * Block Loader — Dynamically loads block files from the manifest.
 *
 * Reads the BLOCK_FILES array (defined in blocks/manifest.js) and
 * loads each block file sequentially via dynamic <script> injection.
 *
 * Depends on: BLOCK_FILES (manifest.js)
 */

/**
 * Load a JavaScript file by creating a <script> element.
 *
 * @param {string} src - Path to the script file
 * @returns {Promise<void>} Resolves when the script is loaded
 */
function loadScript(src) {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src;
    s.onload = resolve;
    s.onerror = () => reject(new Error('Failed to load: ' + src));
    document.head.appendChild(s);
  });
}

/**
 * Load all block files listed in the BLOCK_FILES manifest.
 * Files are loaded sequentially to maintain consistent registration order.
 *
 * @returns {Promise<void>} Resolves when all blocks are loaded
 */
async function loadAllBlocks() {
  for (const file of BLOCK_FILES) {
    await loadScript('blockly/blocks/' + file);
  }
}
