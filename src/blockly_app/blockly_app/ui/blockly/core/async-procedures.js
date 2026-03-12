/**
 * Async Procedures — Override Blockly's built-in procedure generators
 * for async/await support, and provide main-block-aware code generation.
 *
 * Since our custom blocks use `await executeAction()`, any user-defined
 * function that contains those blocks must be declared as `async function`
 * and called with `await`.
 *
 * Also provides `generateCode(ws)` which replaces `workspaceToCode()` —
 * when a main_program block exists, only function definitions + main body
 * are included (orphan blocks are ignored).
 *
 * Depends on: Blockly (vendor), javascript (vendor), BlockRegistry (registry.js)
 */

(function () {
  'use strict';

  const gen = javascript.javascriptGenerator;

  // ─── Save original generators ──────────────────────────────────────────────
  const origDefReturn = gen.forBlock['procedures_defreturn'];
  const origCallReturn = gen.forBlock['procedures_callreturn'];
  // Note: procedures_defnoreturn === procedures_defreturn in Blockly vendor
  // Note: procedures_callnoreturn delegates to callreturn dynamically

  // ─── Override: procedures_defreturn & procedures_defnoreturn ────────────────
  // Makes generated function definitions async.
  // Original generates: function funcName(args) { ... }
  // Override produces:  async function funcName(args) { ... }
  function asyncDefReturn(block, generator) {
    // Let original populate definitions_
    const result = origDefReturn.call(this, block, generator);

    // Patch the definition: function → async function
    // scrub_() may prepend comments (e.g. "// Describe this function...\n"),
    // so we match by exact function name instead of start-of-string
    const funcName = generator.getProcedureName(block.getFieldValue('NAME'));
    const key = '%' + funcName;
    if (generator.definitions_[key]) {
      generator.definitions_[key] = generator.definitions_[key]
        .replace('function ' + funcName, 'async function ' + funcName);
    }

    return result; // always null for def blocks
  }

  gen.forBlock['procedures_defreturn'] = asyncDefReturn;
  gen.forBlock['procedures_defnoreturn'] = asyncDefReturn;

  // ─── Override: procedures_callreturn ────────────────────────────────────────
  // Original returns: [funcName(args), ORDER.FUNCTION_CALL]
  // Override wraps in async IIFE with highlightBlock + call depth tracking.
  // The IIFE is needed because this is a value expression (returns a value),
  // but we need to await highlightBlock() and track call depth as statements.
  gen.forBlock['procedures_callreturn'] = function (block, generator) {
    const [code, _order] = origCallReturn.call(this, block, generator);
    const id = block.id;
    // enterFunction() BEFORE highlightBlock() so that Step Over from the
    // parent block (which embeds this value expression) sees callDepth > stepStartDepth
    // and skips this highlight entirely. Step Into still pauses because it ignores depth.
    return [
      "(await (async function() { enterFunction(); await highlightBlock('" + id + "'); " +
        'try { return await ' + code + '; } ' +
        'finally { exitFunction(); } ' +
        '})())',
      javascript.Order.AWAIT,
    ];
  };

  // ─── Override: procedures_callnoreturn ──────────────────────────────────────
  // Original delegates to callreturn[0] + ";\n"
  // Override adds await highlightBlock() for debug + call depth tracking
  gen.forBlock['procedures_callnoreturn'] = function (block, generator) {
    // Use original callreturn (pre-override) to get clean funcName(args)
    const [code, _order] = origCallReturn.call(this, block, generator);
    return (
      "await highlightBlock('" + block.id + "');\n" +
      'enterFunction();\n' +
      'try { await ' + code + '; } finally { exitFunction(); }\n'
    );
  };

  // ─── generateCode(ws) ─────────────────────────────────────────────────────
  /**
   * Generate executable code from the workspace.
   *
   * If a main_program block exists:
   *   - Only function definitions + main block body are included
   *   - Orphan top-level blocks are ignored
   * If no main_program block:
   *   - Falls back to standard workspaceToCode() behavior (backward compatible)
   *
   * @param {Blockly.Workspace} ws
   * @returns {string} Generated JavaScript code
   */
  window.generateCode = function (ws) {
    const mainBlocks = ws.getBlocksByType('main_program');

    if (mainBlocks.length === 0) {
      // No main block — backward compatible
      return gen.workspaceToCode(ws);
    }

    // Main block exists — selective code generation
    gen.init(ws);

    // 1. Process all procedure definition blocks to populate definitions_
    const topBlocks = ws.getTopBlocks(true);
    for (const block of topBlocks) {
      if (
        block.type === 'procedures_defnoreturn' ||
        block.type === 'procedures_defreturn'
      ) {
        gen.blockToCode(block);
      }
    }

    // 2. Process the main block body
    let mainCode = gen.blockToCode(mainBlocks[0]);
    if (Array.isArray(mainCode)) {
      mainCode = mainCode[0];
    }

    // 3. Assemble: definitions (async functions) + main body code
    let code = gen.finish(mainCode);

    // Clean up whitespace
    code = code.replace(/^\s+\n/, '');
    code = code.replace(/\n\s+$/, '\n');
    code = code.replace(/[ \t]+\n/g, '\n');

    return code;
  };
})();
