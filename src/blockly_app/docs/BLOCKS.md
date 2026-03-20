# Creating Custom Blocks — Documentation Index

This directory documents how to create, configure, and extend Blockly blocks
for the AMR ROS2 K4 visual programming interface.

## Contents

| File | What it covers |
|------|----------------|
| [01-quickstart.md](01-quickstart.md) | End-to-end walkthrough: create JS block file, register Python handler, write integration test, verify with CLI. Includes the full data-flow diagram and a step-by-step checklist. |
| [02-block-api-ref.md](02-block-api-ref.md) | Complete API reference: `BlockRegistry.register()` fields, `definition.init` input rows, connection/shape methods, style methods, field type table, naming conventions, `executeAction()` / `highlightBlock()` runtime API. |
| [03-templates.md](03-templates.md) | Copy-paste starting points for all block shapes: Template A (statement/ROS2), B (output/sensor), C (value input sockets), D (container/loop), E (client-side statement), F (HMI widget). |
| [04-examples.md](04-examples.md) | Annotated real-project examples (`digitalOut`, `digitalIn`, `delay`) and a master table of all current block categories and their execution models. |

## Quick Decision Guide

- **Adding your first block?** → Start with [01-quickstart.md](01-quickstart.md)
- **Need a copy-paste template?** → Go to [03-templates.md](03-templates.md)
- **Looking up a specific API (field types, connection methods)?** → [02-block-api-ref.md](02-block-api-ref.md)
- **Want to see how an existing block is built?** → [04-examples.md](04-examples.md)

## Two Execution Models

All blocks fall into one of two categories:

| Model | Execution | Python handler needed? |
|-------|-----------|----------------------|
| **ROS2 action block** | `await executeAction()` → network round-trip to executor | Yes — `@handler("name")` in `handlers/<file>.py` |
| **Client-side block** | Direct JS call (`consoleLog()`, `HMI.set*()`) | No |
