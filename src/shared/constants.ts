/**
 * Shared folding limits. Kept in one place so the kinematics, the linked
 * solver and the UI all agree on the same boundary.
 */
export const ANGLE_LIMIT = 175;

/** Relative tolerance used when proving a closed loop of link relations. */
export const LINK_TOL = 1e-6;

/** Normalise -0 to 0 so saved steps and UI read naturally. */
export const zeroSafe = (n: number) => (n === 0 ? 0 : n);
