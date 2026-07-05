import { mkdir, readdir, rm, stat } from 'node:fs/promises';
import { CLIP_EXTS, DIRS, SOUND_EXTS } from './config.ts';

// Filesystem catalogue. No database — clips, sounds and rendered outputs are
// just files on disk under DATA_DIR.

export type FileEntry = { name: string; sizeMb: number };

export const ensureDirs = async (): Promise<void> => {
  await Promise.all(Object.values(DIRS).map((d) => mkdir(d, { recursive: true })));
};

// Keep filenames safe for the shell / URLs.
const sanitize = (name: string): string =>
  name.replace(/[^a-zA-Z0-9._-]/g, '-').replace(/^-+/, '') || `file-${Date.now().toString(36)}`;

const hasExt = (name: string, exts: string[]): boolean =>
  exts.some((e) => name.toLowerCase().endsWith(e));

const listDir = async (dir: string, exts: string[]): Promise<FileEntry[]> => {
  let names: string[];
  try {
    names = await readdir(dir);
  } catch {
    return [];
  }
  const out: FileEntry[] = [];
  for (const name of names.sort()) {
    if (!hasExt(name, exts)) continue;
    let sizeMb = 0;
    try {
      sizeMb = Math.round((await stat(`${dir}/${name}`)).size / 1e6);
    } catch {
      /* ignore */
    }
    out.push({ name, sizeMb });
  }
  return out;
};

export const listClips = () => listDir(DIRS.clips, CLIP_EXTS);
export const listSounds = () => listDir(DIRS.sounds, SOUND_EXTS);
export const listOutputs = () => listDir(DIRS.outputs, ['.mp4']);

// Save an uploaded File, auto-renaming on collision so nothing is overwritten.
export const saveUpload = async (
  kind: 'clips' | 'sounds',
  file: File,
  exts: string[],
): Promise<string> => {
  if (!hasExt(file.name, exts)) throw new Error(`unsupported file type: ${file.name}`);
  const dir = DIRS[kind];
  await mkdir(dir, { recursive: true });
  let name = sanitize(file.name);
  if (await Bun.file(`${dir}/${name}`).exists()) {
    name = name.replace(/(\.[^.]+)$/, `_${Date.now().toString(36)}$1`);
  }
  await Bun.write(`${dir}/${name}`, file);
  return name;
};

export const deleteFile = async (
  kind: 'clips' | 'sounds' | 'outputs',
  name: string,
): Promise<void> => {
  await rm(`${DIRS[kind]}/${sanitize(name)}`, { force: true });
};

// Resolve a media path for streaming, guarding against path traversal.
export const mediaPath = (
  kind: 'clips' | 'sounds' | 'previews' | 'outputs',
  name: string,
): string => `${DIRS[kind]}/${sanitize(name)}`;
