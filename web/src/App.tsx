import { useEffect, useRef, useState } from 'react';
import {
  type AppConfig,
  type FileEntry,
  type JobResult,
  getConfig,
  listClips,
  listOutputs,
  listSounds,
  pollJob,
  remove,
  startPreview,
  startRender,
  upload,
} from './api.ts';

export function App() {
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [clips, setClips] = useState<FileEntry[]>([]);
  const [sounds, setSounds] = useState<FileEntry[]>([]);
  const [outputs, setOutputs] = useState<FileEntry[]>([]);

  const [clip, setClip] = useState<string | null>(null);
  const [sound, setSound] = useState<string | null>(null);

  const [preview, setPreview] = useState<JobResult | null>(null);
  const [previewStep, setPreviewStep] = useState<string | null>(null);
  const [renderStep, setRenderStep] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refreshClips = () => listClips().then(setClips);
  const refreshSounds = () => listSounds().then(setSounds);
  const refreshOutputs = () => listOutputs().then(setOutputs);

  useEffect(() => {
    getConfig().then(setConfig);
    refreshClips();
    refreshSounds();
    refreshOutputs();
  }, []);

  const onPreview = async () => {
    if (!clip || !sound) return;
    setError(null);
    setPreview(null);
    setPreviewStep('starting');
    try {
      const { jobId } = await startPreview(clip, sound);
      const result = await pollJob(jobId, setPreviewStep);
      setPreview(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'preview failed');
    } finally {
      setPreviewStep(null);
    }
  };

  const onRender = async (hours: number) => {
    if (!clip || !sound) return;
    setError(null);
    setRenderStep(`starting ${hours}h render`);
    try {
      const { jobId } = await startRender(clip, sound, hours);
      await pollJob(jobId, setRenderStep);
      await refreshOutputs();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'render failed');
    } finally {
      setRenderStep(null);
    }
  };

  const busy = previewStep !== null || renderStep !== null;

  return (
    <div className="app">
      <header>
        <h1>🌧️ Rainloop</h1>
        <p>Upload a clip and a sound, preview the seamless loop, render it out to hours of ambience.</p>
      </header>

      {error && <div className="error">⚠ {error}</div>}

      <div className="grid">
        <ClipPanel
          clips={clips}
          selected={clip}
          onSelect={setClip}
          onUpload={async (f) => {
            const r = await upload('clips', f);
            if (r.error) setError(r.error);
            await refreshClips();
          }}
          onDelete={async (name) => {
            await remove('clips', name);
            if (clip === name) setClip(null);
            await refreshClips();
          }}
          accept={config?.clipExts.join(',') ?? 'video/*'}
        />

        <SoundPanel
          sounds={sounds}
          selected={sound}
          onSelect={setSound}
          onUpload={async (f) => {
            const r = await upload('sounds', f);
            if (r.error) setError(r.error);
            await refreshSounds();
          }}
          onDelete={async (name) => {
            await remove('sounds', name);
            if (sound === name) setSound(null);
            await refreshSounds();
          }}
          accept={config?.soundExts.join(',') ?? 'audio/*'}
        />
      </div>

      <section className="panel generate">
        <h2>Generate</h2>
        <div className="pick">
          <span className={clip ? 'chip on' : 'chip'}>{clip ?? 'no clip selected'}</span>
          <span className="plus">+</span>
          <span className={sound ? 'chip on' : 'chip'}>{sound ?? 'no sound selected'}</span>
        </div>

        <button className="primary" disabled={!clip || !sound || busy} onClick={onPreview}>
          {previewStep ? `Generating… ${previewStep}` : 'Generate 90-second preview'}
        </button>

        {preview && (
          <div className="preview">
            <video src={preview.url} controls loop playsInline />
            {preview.motion && preview.motion !== '?' && (
              <p className="motion">
                motion: {preview.motion}{' '}
                {Number(preview.motion) < 0.2 ? '(⚠ low — clip may be nearly static)' : '(looks animated)'}
              </p>
            )}

            <h3>Render full length</h3>
            <p className="hint">Loops this 90s seamlessly out to the chosen length.</p>
            <div className="hours">
              {(config?.hourPresets ?? []).map((h) => (
                <button key={h} disabled={busy} onClick={() => onRender(h)}>
                  {h}h
                </button>
              ))}
            </div>
            {renderStep && <p className="step">Rendering… {renderStep}</p>}
          </div>
        )}
      </section>

      <OutputPanel
        outputs={outputs}
        onDelete={async (name) => {
          await remove('outputs', name);
          await refreshOutputs();
        }}
      />
    </div>
  );
}

function Uploader({ accept, onUpload, label }: { accept: string; onUpload: (f: File) => Promise<void>; label: string }) {
  const ref = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  return (
    <>
      <input
        ref={ref}
        type="file"
        accept={accept}
        hidden
        onChange={async (e) => {
          const f = e.target.files?.[0];
          if (!f) return;
          setBusy(true);
          await onUpload(f);
          setBusy(false);
          if (ref.current) ref.current.value = '';
        }}
      />
      <button className="upload" disabled={busy} onClick={() => ref.current?.click()}>
        {busy ? 'Uploading…' : label}
      </button>
    </>
  );
}

function ClipPanel(props: {
  clips: FileEntry[];
  selected: string | null;
  onSelect: (n: string) => void;
  onUpload: (f: File) => Promise<void>;
  onDelete: (n: string) => Promise<void>;
  accept: string;
}) {
  return (
    <section className="panel">
      <div className="panel-head">
        <h2>Clips ({props.clips.length})</h2>
        <Uploader accept={props.accept} onUpload={props.onUpload} label="+ Upload clip" />
      </div>
      <div className="clip-grid">
        {props.clips.map((c) => (
          <div key={c.name} className={props.selected === c.name ? 'card sel' : 'card'}>
            <video src={`/media/clips/${encodeURIComponent(c.name)}`} muted loop playsInline
              onClick={() => props.onSelect(c.name)} />
            <div className="row">
              <button className="pick-btn" onClick={() => props.onSelect(c.name)}>
                {props.selected === c.name ? '✓ selected' : 'select'}
              </button>
              <button className="del" onClick={() => props.onDelete(c.name)}>✕</button>
            </div>
            <span className="fname" title={c.name}>{c.name}</span>
          </div>
        ))}
        {props.clips.length === 0 && <p className="empty">No clips yet — upload a short video.</p>}
      </div>
    </section>
  );
}

function SoundPanel(props: {
  sounds: FileEntry[];
  selected: string | null;
  onSelect: (n: string) => void;
  onUpload: (f: File) => Promise<void>;
  onDelete: (n: string) => Promise<void>;
  accept: string;
}) {
  return (
    <section className="panel">
      <div className="panel-head">
        <h2>Sounds ({props.sounds.length})</h2>
        <Uploader accept={props.accept} onUpload={props.onUpload} label="+ Upload sound" />
      </div>
      <div className="sound-list">
        {props.sounds.map((s) => (
          <div key={s.name} className={props.selected === s.name ? 'srow sel' : 'srow'}>
            <button className="pick-btn" onClick={() => props.onSelect(s.name)}>
              {props.selected === s.name ? '✓' : '○'}
            </button>
            <span className="fname" title={s.name}>{s.name}</span>
            <audio src={`/media/sounds/${encodeURIComponent(s.name)}`} controls preload="none" />
            <button className="del" onClick={() => props.onDelete(s.name)}>✕</button>
          </div>
        ))}
        {props.sounds.length === 0 && <p className="empty">No sounds yet — upload a loopable audio track.</p>}
      </div>
    </section>
  );
}

function OutputPanel(props: { outputs: FileEntry[]; onDelete: (n: string) => Promise<void> }) {
  if (props.outputs.length === 0) return null;
  return (
    <section className="panel">
      <h2>Rendered outputs ({props.outputs.length})</h2>
      <div className="sound-list">
        {props.outputs.map((o) => (
          <div key={o.name} className="srow">
            <span className="fname" title={o.name}>{o.name}</span>
            <span className="size">{o.sizeMb} MB</span>
            <a className="dl" href={`/media/outputs/${encodeURIComponent(o.name)}`} download>
              ⬇ download
            </a>
            <button className="del" onClick={() => props.onDelete(o.name)}>✕</button>
          </div>
        ))}
      </div>
    </section>
  );
}
