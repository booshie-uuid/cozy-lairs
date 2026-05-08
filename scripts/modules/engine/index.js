/******************************************************************************/
/* ENGINE FAÇADE                                                              */
/******************************************************************************/

/*
 * Public engine façade. Submodules import each other directly; this exists
 * only for external consumers (`import * as Engine from "./engine/index.js"`).
 */

export * from "./emitter.js";
export * from "./errors.js";
