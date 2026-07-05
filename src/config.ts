// All configuration in one place. Everything runs on a single machine — data
// lives on the local filesystem under DATA_DIR.
export const PORT = Number(process.env.PORT ?? 3800);

// Where clips / sounds / previews / outputs are stored. In Docker this is a
// mounted volume so your library + renders survive container restarts.
export const DATA_DIR = process.env.DATA_DIR ?? `${process.cwd()}/data`;

// The subfolders under DATA_DIR.
export const DIRS = {
  clips: `${DATA_DIR}/clips`,
  sounds: `${DATA_DIR}/sounds`,
  previews: `${DATA_DIR}/previews`,
  outputs: `${DATA_DIR}/outputs`,
  build: `${DATA_DIR}/_build`,
} as const;

// Accepted upload types.
export const CLIP_EXTS = ['.mp4', '.mov', '.webm', '.m4v'];
export const SOUND_EXTS = ['.mp3', '.wav', '.m4a', '.aac', '.ogg'];

// The render-length buttons shown in the UI (hours).
export const HOUR_PRESETS = [1, 4, 8, 10, 12];

// The seamless preview length, in seconds.
export const PREVIEW_SECONDS = 90;
