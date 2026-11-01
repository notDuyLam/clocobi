'use client';
/* eslint-disable @next/next/no-img-element -- spike shows local blob URLs */

// Spike S3 (TDD open item 11): background removal quality, speed, model size,
// Cloudinary CORS and COOP/COEP. Temporary: delete this folder after the spike.
import { useState } from 'react';
import { resizePhoto } from '@/lib/image';

type Model = 'isnet_fp16' | 'isnet_quint8';
type Device = 'cpu' | 'gpu';

export default function BgRemovalSpike() {
  const [model, setModel] = useState<Model>('isnet_fp16');
  const [device, setDevice] = useState<Device>('cpu');
  const [url, setUrl] = useState('');
  const [before, setBefore] = useState<string | null>(null);
  const [after, setAfter] = useState<string | null>(null);
  const [progress, setProgress] = useState('');
  const [log, setLog] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  const add = (line: string) => setLog((l) => [...l, line]);

  async function run(source: Blob, label: string) {
    setBusy(true);
    setAfter(null);
    try {
      const t0 = performance.now();
      const photo = await resizePhoto(source);
      const size = await createImageBitmap(photo);
      add(
        `${label}: resized to ${size.width}x${size.height}, ${kb(photo.size)} (${ms(t0)})`,
      );
      setBefore(URL.createObjectURL(photo));

      const { removeBackground } = await import('@imgly/background-removal');
      const t1 = performance.now();
      const clean = await removeBackground(photo, {
        model,
        device,
        progress: (key, current, total) =>
          setProgress(`${key} ${Math.round((current / total) * 100)}%`),
      });
      const out = await createImageBitmap(clean);
      add(
        `${model}/${device}: ${out.width}x${out.height} ${clean.type}, ${kb(clean.size)} in ${ms(t1)}`,
      );
      setAfter(URL.createObjectURL(clean));
    } catch (e) {
      add(`FAILED: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setProgress('');
      setBusy(false);
    }
  }

  async function fromUrl() {
    try {
      // Same request the "retry clean image" flow makes: a CORS fetch of the Cloudinary URL.
      const res = await fetch(url);
      add(
        `CORS fetch OK: HTTP ${res.status}, ACAO=${res.headers.get('access-control-allow-origin')}`,
      );
      await run(await res.blob(), 'URL');
    } catch (e) {
      add(`CORS fetch FAILED: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-4 p-4 text-sm">
      <h1 className="text-xl font-semibold">Background removal spike</h1>
      <p suppressHydrationWarning>
        crossOriginIsolated:{' '}
        <b>{String(typeof window !== 'undefined' && crossOriginIsolated)}</b> ·
        cores:{' '}
        {typeof navigator !== 'undefined' ? navigator.hardwareConcurrency : '?'}
      </p>

      <div className="flex flex-wrap gap-4">
        <label>
          Model{' '}
          <select
            value={model}
            onChange={(e) => setModel(e.target.value as Model)}
            className="border"
          >
            <option value="isnet_fp16">medium, isnet_fp16 (~80 MB)</option>
            <option value="isnet_quint8">small, isnet_quint8 (~40 MB)</option>
          </select>
        </label>
        <label>
          Device{' '}
          <select
            value={device}
            onChange={(e) => setDevice(e.target.value as Device)}
            className="border"
          >
            <option value="cpu">cpu</option>
            <option value="gpu">gpu</option>
          </select>
        </label>
      </div>

      <label className="flex flex-col gap-1">
        Photo (camera or file)
        <input
          type="file"
          accept="image/*"
          disabled={busy}
          onChange={(e) =>
            e.target.files?.[0] && run(e.target.files[0], 'File')
          }
        />
      </label>

      <div className="flex gap-2">
        <input
          className="flex-1 border px-2 py-1"
          placeholder="Cloudinary image URL (CORS check)"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
        />
        <button
          className="border px-3"
          disabled={busy || !url}
          onClick={fromUrl}
        >
          Load
        </button>
      </div>

      {busy && <p>Working… {progress}</p>}

      <div className="grid grid-cols-2 gap-2">
        {before && (
          <img src={before} alt="Resized original" className="w-full" />
        )}
        {after && (
          // Checkerboard shows the transparent areas.
          <img
            src={after}
            alt="Background removed"
            className="w-full bg-[repeating-conic-gradient(#ccc_0_25%,#fff_0_50%)] bg-[length:16px_16px]"
          />
        )}
      </div>

      <pre className="whitespace-pre-wrap border p-2">
        {log.join('\n') || 'No runs yet.'}
      </pre>
    </main>
  );
}

const kb = (bytes: number) => `${Math.round(bytes / 1024)} KB`;
const ms = (start: number) => `${Math.round(performance.now() - start)} ms`;
