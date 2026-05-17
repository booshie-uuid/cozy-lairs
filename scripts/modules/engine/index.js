/******************************************************************************/
/* ENGINE FAÇADE                                                              */
/******************************************************************************/

// External consumers use `import * as Engine from "./engine/index.js"`.
// Submodules import each other directly to avoid circular cycles.

export * from "./emitter.js";
export * from "./errors.js";
