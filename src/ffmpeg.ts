import { $ } from 'bun';
import { mkdir, rm, stat } from 'node:fs/promises';
import { DIRS } from './config.ts';

// The whole pipeline, ported from the original rainrest M4 build to run on the
// local machine. Four steps:
//   1. seamless unit  — crossfade the clip's tail into its head so the loop
//      point is invisible, then concat with the middle.
//   2. video track    — stream-loop the unit to the target length (stream copy,
//      no re-encode → fast even for 12h).
//   3. audio track    — stream-loop the sound to the target length with
//      loudness normalisation + gentle fade in/out.
//   4. mux            — combine video + audio into the final mp4.

$.throws(true);

export type BuildResult = { file: string; sizeMb: number; motion?: string };

// Measure how much the clip actually moves (frame-to-frame difference). Handy to
// spot a "frozen" clip where the rain isn't animating. Returns e.g. "0.412".
const measureMotion = async (clipPath: string): Promise<string> => {
  const proc = await $`ffmpeg -hide_banner -i ${clipPath} -vf tblend=all_mode=difference,signalstats,metadata=print:key=lavfi.signalstats.YAVG -f null -`
    .nothrow()
    .quiet();
  const text = proc.stderr.toString();
  const vals = [...text.matchAll(/YAVG=([0-9.]+)/g)].map((m) => Number(m[1]));
  if (vals.length === 0) return '?';
  return (vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(3);
};

export const buildLoop = async (opts: {
  clipPath: string;
  soundPath: string;
  seconds: number;
  outPath: string;
  measure?: boolean;
  onStep?: (s: string) => void;
}): Promise<BuildResult> => {
  const { clipPath, soundPath, seconds, outPath, measure = false, onStep } = opts;
  await mkdir(DIRS.build, { recursive: true });
  const id = `${Date.now().toString(36)}-${Math.floor(performance.now())}`;
  const unit = `${DIRS.build}/unit_${id}.mp4`;
  const vid = `${DIRS.build}/vid_${id}.mp4`;
  const aud = `${DIRS.build}/aud_${id}.m4a`;

  try {
    // Duration → crossfade window (1..10s of the clip, at least 2s).
    const durText = await $`ffprobe -v error -show_entries format=duration -of csv=p=0 ${clipPath}`.text();
    const dur = Number(durText.trim()) || 2;
    const t = Math.max(2, Math.floor(Math.min(dur, 10)));
    const tm1 = t - 1;

    onStep?.('building seamless loop');
    const filter =
      `[0:v]trim=${tm1}:${t},setpts=PTS-STARTPTS[tail];` +
      `[0:v]trim=0:1,setpts=PTS-STARTPTS[head];` +
      `[tail][head]blend=all_expr=A*(1-T)+B*T[xf];` +
      `[0:v]trim=1:${tm1},setpts=PTS-STARTPTS[mid];` +
      `[xf][mid]concat=n=2:v=1[v]`;
    await $`ffmpeg -y -loglevel error -i ${clipPath} -filter_complex ${filter} -map [v] -an -c:v libx264 -pix_fmt yuv420p -r 30 ${unit}`;

    onStep?.('rendering video track');
    await $`ffmpeg -y -loglevel error -stream_loop -1 -i ${unit} -t ${String(seconds)} -an -c:v copy ${vid}`;

    onStep?.('rendering audio track');
    const fade = Math.max(1, seconds - 3);
    const af = `loudnorm=I=-18:TP=-2:LRA=11,afade=t=in:d=2,afade=t=out:st=${fade}:d=3`;
    await $`ffmpeg -y -loglevel error -stream_loop -1 -i ${soundPath} -t ${String(seconds)} -af ${af} -c:a aac -b:a 192k ${aud}`;

    onStep?.('muxing');
    await $`ffmpeg -y -loglevel error -i ${vid} -i ${aud} -map 0:v -map 1:a -c copy -shortest ${outPath}`;

    const motion = measure ? await measureMotion(clipPath) : undefined;
    const sizeMb = Math.round((await stat(outPath)).size / 1e6);
    return { file: outPath, sizeMb, motion };
  } finally {
    await Promise.all([
      rm(unit, { force: true }),
      rm(vid, { force: true }),
      rm(aud, { force: true }),
    ]);
  }
};
