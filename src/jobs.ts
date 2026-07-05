// Tiny in-memory job registry. Preview + render run in the background; the UI
// polls GET /api/jobs/:id for the current step and, when done, the result.
// (Single-process, single-machine — no queue needed.)

export type JobStatus = 'running' | 'done' | 'error';

export type Job = {
  id: string;
  kind: 'preview' | 'render';
  status: JobStatus;
  step: string;
  result?: unknown;
  error?: string;
  createdAt: number;
};

const jobs = new Map<string, Job>();

export const createJob = (kind: Job['kind']): Job => {
  const job: Job = {
    id: crypto.randomUUID(),
    kind,
    status: 'running',
    step: 'starting',
    createdAt: Date.now(),
  };
  jobs.set(job.id, job);
  return job;
};

export const getJob = (id: string): Job | undefined => jobs.get(id);

export const setStep = (job: Job, step: string): void => {
  job.step = step;
};

// Run work in the background, funnelling progress into the job. Returns the job
// immediately so the route can hand the id back to the client.
export const runJob = (
  job: Job,
  work: (setStep: (s: string) => void) => Promise<unknown>,
): Job => {
  work((s) => setStep(job, s))
    .then((result) => {
      job.result = result;
      job.status = 'done';
      job.step = 'done';
    })
    .catch((err: unknown) => {
      job.status = 'error';
      job.error = err instanceof Error ? err.message : String(err);
    });
  return job;
};

// Drop jobs older than an hour so the map doesn't grow unbounded.
setInterval(
  () => {
    const cutoff = Date.now() - 60 * 60 * 1000;
    for (const [id, job] of jobs) if (job.createdAt < cutoff) jobs.delete(id);
  },
  10 * 60 * 1000,
).unref?.();
