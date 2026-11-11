// Browser background removal (TDD 4.4). The library and its model load only when first used.
// Model choice is pending spike S3 (TDD open item 11): medium is the documented default.
const MODEL = 'isnet_fp16' as const;

export type BgProgress = (label: string, percent: number) => void;

export async function removeBg(photo: Blob, onProgress?: BgProgress): Promise<Blob> {
  const { removeBackground } = await import('@imgly/background-removal');
  const progress = (key: string, current: number, total: number) =>
    onProgress?.(
      key.startsWith('fetch') ? 'Downloading model (first time only)' : 'Removing background',
      total ? Math.round((current / total) * 100) : 0,
    );
  const run = (proxyToWorker: boolean) =>
    removeBackground(photo, {
      model: MODEL,
      proxyToWorker,
      progress,
      output: { format: 'image/png' },
    });
  try {
    // In a worker the page stays responsive while the model runs.
    return await run(true);
  } catch {
    return run(false);
  }
}
