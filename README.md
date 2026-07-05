# 🌧️ Rainloop

Self-hosted **ambient loop generator**. Upload a short video clip (a few seconds
of rain on a window, a fireplace, waves…) and a sound, and Rainloop stitches them
into a **seamless loop** and renders it out to **hours** of sleep/ambient video —
the kind of long-form loop you'd put on for sleeping, studying, or a stream.

Everything runs on **one machine**. No cloud, no accounts, no external services.

![clip + sound → seamless preview → N-hour render](https://placehold.co/900x120/161f2e/8a99ad?text=upload+clip+%2B+sound+%E2%86%92+90s+preview+%E2%86%92+render+N+hours)

## What it does

1. **Upload clips** — short videos. Preview them in the browser.
2. **Upload sounds** — loopable audio (rain, white noise, music…). Preview them.
3. **Pick one of each → generate a 90-second preview.** The clip's tail is
   crossfaded into its head so the loop point is invisible; the sound is
   loudness-normalised and gently faded.
4. **Render** the loop out to a preset length (1 / 4 / 8 / 10 / 12 hours) and
   download the finished `.mp4`.

## Quick start (Docker)

```bash
git clone <your-fork-url> rainloop
cd rainloop
docker compose up -d --build
```

Open **http://localhost:3800**. Your library and renders are stored in `./data`
on the host (mounted into the container), so they survive rebuilds.

> Renders can be large — an 8-hour 1080p file is several GB. Make sure the disk
> holding `./data` has room.

## How the loop is made (ffmpeg)

The whole pipeline is four ffmpeg steps (`src/ffmpeg.ts`):

1. **Seamless unit** — `trim` the clip's tail + head, `blend` them into a 1s
   crossfade, `concat` with the middle → a clip that loops with no visible seam.
2. **Video track** — `-stream_loop` the unit to the target length with
   `-c:v copy` (no re-encode, so even 12h is fast).
3. **Audio track** — `-stream_loop` the sound to length with `loudnorm` + fade
   in/out.
4. **Mux** — combine into the final `.mp4`.

## Configuration

Environment variables (all optional):

| Variable   | Default        | Meaning                                  |
| ---------- | -------------- | ---------------------------------------- |
| `PORT`     | `3800`         | HTTP port                                |
| `DATA_DIR` | `./data`       | Where clips/sounds/outputs are stored    |

Render-length buttons and accepted file types are in `src/config.ts`.

## Development (without Docker)

Requires [Bun](https://bun.sh) and `ffmpeg` on your PATH.

```bash
bun install
bun run dev:web   # Vite dev server (UI) on :5173, proxies API to :3800
bun run dev       # backend on :3800, in another terminal
```

For a production-style run: `bun run build:web && bun run start`.

## Tech

Bun + `Bun.serve` backend (zero runtime deps), React + Vite frontend, ffmpeg for
the media work. In-memory job queue with progress polling.

## License

MIT — see [LICENSE](LICENSE).
