// Thin fetch wrappers around the backend API.

export type FileEntry = { name: string; sizeMb: number };
export type AppConfig = { hourPresets: number[]; clipExts: string[]; soundExts: string[] };
export type JobResult = { name: string; url: string; motion?: string; sizeMb?: number };
export type Job = {
  id: string;
  status: 'running' | 'done' | 'error';
  step: string;
  result?: JobResult;
  error?: string;
};

const jget = <T>(url: string): Promise<T> => fetch(url).then((r) => r.json() as Promise<T>);
const jpost = <T>(url: string, body: unknown): Promise<T> =>
  fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  }).then((r) => r.json() as Promise<T>);

export const getConfig = () => jget<AppConfig>('/api/config');
export const listClips = () => jget<FileEntry[]>('/api/clips');
export const listSounds = () => jget<FileEntry[]>('/api/sounds');
export const listOutputs = () => jget<FileEntry[]>('/api/outputs');

export const upload = (kind: 'clips' | 'sounds', file: File): Promise<{ name?: string; error?: string }> => {
  const form = new FormData();
  form.append('file', file);
  return fetch(`/api/${kind}`, { method: 'POST', body: form }).then((r) => r.json());
};

export const remove = (kind: 'clips' | 'sounds' | 'outputs', name: string) =>
  fetch(`/api/${kind}/${encodeURIComponent(name)}`, { method: 'DELETE' }).then((r) => r.json());

export const startPreview = (clip: string, sound: string) =>
  jpost<{ jobId: string }>('/api/preview', { clip, sound });
export const startRender = (clip: string, sound: string, hours: number) =>
  jpost<{ jobId: string }>('/api/render', { clip, sound, hours });

// Poll a job until it finishes, reporting each step.
export const pollJob = async (jobId: string, onStep: (s: string) => void): Promise<JobResult> => {
  for (;;) {
    const job = await jget<Job>(`/api/jobs/${jobId}`);
    onStep(job.step);
    if (job.status === 'done' && job.result) return job.result;
    if (job.status === 'error') throw new Error(job.error ?? 'job failed');
    await new Promise((r) => setTimeout(r, 1500));
  }
};
