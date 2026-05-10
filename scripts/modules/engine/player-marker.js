/******************************************************************************/
/* PLAYER MARKER                                                              */
/******************************************************************************/

/*
 * Sentinel value used as a `Grid.occupants` value to represent the player
 * (the first-person camera) when in first-person mode. Distinct from any
 * Entity reference, so callers can tell "this cell is the player" from
 * "this cell is some entity" by reference equality with `PLAYER_MARKER`.
 *
 * Lives in `engine/` so both the `FirstPersonCamera` (which writes the
 * marker on cell change) and `world/` consumers (decor placement,
 * chaos teleport) can import it without circular dependencies.
 */

const PLAYER_MARKER = Symbol("PLAYER");

export { PLAYER_MARKER };
