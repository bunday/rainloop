import { CLIP_EXTS, DIRS, HOUR_PRESETS, PORT, PREVIEW_SECONDS, SOUND_EXTS } from './config.ts';
import { buildLoop } from './ffmpeg.ts';
import { createJob, getJob, runJob } from './jobs.ts';
import {
  deleteFile,
  listClips,
  listOutputs,
  listSounds,
  mediaPath,
  saveUpload,
} from './storage.ts';

const WEB_DIR = `${import.meta.dir}/../web/dist`;
const json = (data: unknown, status = 200): Response =>
  new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } });
const err = (message: string, status = 400): Response => json({ error: message }, status);

const stripExt = (name: string): string => name.replace(/\.[^.]+$/, '');

// ---- media streaming (Bun.file honours Range requests → video scrubbing) ----
const serveMedia = async (kind: string, name: string): Promise<Response> => {
  if (!(kind in DIRS) || kind === 'build') return err('not found', 404);
  const file = Bun.file(mediaPath(kind as 'clips' | 'sounds' | 'previews' | 'outputs', name));
  if (!(await file.exists())) return err('not found', 404);
  return new Response(file);
};

// ---- static SPA ----
const serveStatic = async (pathname: string): Promise<Response> => {
  const rel = pathname === '/' ? '/index.html' : pathname;
  const file = Bun.file(`${WEB_DIR}${rel}`);
  if (await file.exists()) return new Response(file);
  // SPA fallback
  const index = Bun.file(`${WEB_DIR}/index.html`);
  if (await index.exists()) return new Response(index);
  return new Response('web not built — run `bun run build:web`', { status: 404 });
};

const handleApi = async (req: Request, url: URL): Promise<Response> => {
  const { pathname } = url;
  const method = req.method;

  if (pathname === '/api/config' && method === 'GET')
    return json({ hourPresets: HOUR_PRESETS, clipExts: CLIP_EXTS, soundExts: SOUND_EXTS });

  // ---- catalogue ----
  if (pathname === '/api/clips' && method === 'GET') return json(await listClips());
  if (pathname === '/api/sounds' && method === 'GET') return json(await listSounds());
  if (pathname === '/api/outputs' && method === 'GET') return json(await listOutputs());

  if ((pathname === '/api/clips' || pathname === '/api/sounds') && method === 'POST') {
    const kind = pathname === '/api/clips' ? 'clips' : 'sounds';
    const form = await req.formData();
    const file = form.get('file');
    if (!(file instanceof File)) return err('no file uploaded');
    try {
      const name = await saveUpload(kind, file, kind === 'clips' ? CLIP_EXTS : SOUND_EXTS);
      return json({ name });
    } catch (e) {
      return err(e instanceof Error ? e.message : 'upload failed');
    }
  }

  const del = pathname.match(/^\/api\/(clips|sounds|outputs)\/(.+)$/);
  if (del && method === 'DELETE') {
    await deleteFile(del[1] as 'clips' | 'sounds' | 'outputs', decodeURIComponent(del[2]));
    return json({ ok: true });
  }

  // ---- generate 90s preview ----
  if (pathname === '/api/preview' && method === 'POST') {
    const { clip, sound } = (await req.json()) as { clip?: string; sound?: string };
    if (!clip || !sound) return err('clip and sound are required');
    const outName = `preview-${Date.now().toString(36)}.mp4`;
    const job = createJob('preview');
    runJob(job, async (setStep) => {
      const res = await buildLoop({
        clipPath: mediaPath('clips', clip),
        soundPath: mediaPath('sounds', sound),
        seconds: PREVIEW_SECONDS,
        outPath: `${DIRS.previews}/${outName}`,
        measure: true,
        onStep: setStep,
      });
      return { name: outName, url: `/media/previews/${outName}`, motion: res.motion };
    });
    return json({ jobId: job.id });
  }

  // ---- render N hours ----
  if (pathname === '/api/render' && method === 'POST') {
    const { clip, sound, hours } = (await req.json()) as {
      clip?: string;
      sound?: string;
      hours?: number;
    };
    if (!clip || !sound || !hours) return err('clip, sound and hours are required');
    if (!HOUR_PRESETS.includes(hours)) return err('invalid hours');
    const outName = `${stripExt(clip)}-${stripExt(sound)}-${hours}h.mp4`
      .replace(/[^a-zA-Z0-9._-]/g, '-');
    const job = createJob('render');
    runJob(job, async (setStep) => {
      const res = await buildLoop({
        clipPath: mediaPath('clips', clip),
        soundPath: mediaPath('sounds', sound),
        seconds: Math.round(hours * 3600),
        outPath: `${DIRS.outputs}/${outName}`,
        onStep: setStep,
      });
      return { name: outName, url: `/media/outputs/${outName}`, sizeMb: res.sizeMb };
    });
    return json({ jobId: job.id });
  }

  // ---- job status ----
  const jobMatch = pathname.match(/^\/api\/jobs\/(.+)$/);
  if (jobMatch && method === 'GET') {
    const job = getJob(jobMatch[1]);
    if (!job) return err('job not found', 404);
    return json({ id: job.id, status: job.status, step: job.step, result: job.result, error: job.error });
  }

  return err('not found', 404);
};

export const startServer = (): void => {
  Bun.serve({
    port: PORT,
    idleTimeout: 255, // long renders keep a request open only for uploads; jobs are async
    async fetch(req) {
      const url = new URL(req.url);
      try {
        if (url.pathname.startsWith('/api/')) return await handleApi(req, url);
        const media = url.pathname.match(/^\/media\/([^/]+)\/(.+)$/);
        if (media) return await serveMedia(media[1], decodeURIComponent(media[2]));
        return await serveStatic(url.pathname);
      } catch (e) {
        return err(e instanceof Error ? e.message : 'server error', 500);
      }
    },
  });
  console.log(`rainloop → http://localhost:${PORT}  (data: ${DIRS.clips.replace(/\/clips$/, '')})`);
};
