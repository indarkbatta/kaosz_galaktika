/** One coordinate system for previews, editors, and server-saved grid points. */
export const WORLD_MAP_SIZE = 800;
export const WORLD_GRID_STEP = 5;
export const WORLD_GRID_MIN = 10;
export const WORLD_GRID_MAX = 90;
export const snapWorldCoordinate = (value: number): number =>
  Math.max(WORLD_GRID_MIN,Math.min(WORLD_GRID_MAX,Math.round(value/WORLD_GRID_STEP)*WORLD_GRID_STEP));
