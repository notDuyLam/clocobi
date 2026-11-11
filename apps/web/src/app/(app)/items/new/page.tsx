'use client';
/* eslint-disable @next/next/no-img-element -- local blob preview */
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { IconCamera, IconImage, IconSparkle } from '@/components/icons';
import { afterItemChange, EMPTY_VALUES, ItemForm, type ItemValues } from '@/components/items';
import { ErrorBox, Spinner, TopBar } from '@/components/ui';
import { api, ApiError, uploadPhoto } from '@/lib/api';
import { removeBg } from '@/lib/bg';
import { resizePhoto } from '@/lib/image';
import { useQuery } from '@/lib/store';
import { toast } from '@/lib/toast';
import type { ItemAttrs, Meta } from '@/lib/types';

type Analysis = { state: 'running' } | { state: 'done'; values: ItemValues } | { state: 'failed'; message: string };
type Bg = { state: 'running'; label: string; pct: number } | { state: 'done' } | { state: 'failed' };

// Add item flow (CLAUDE.md 8.1, FR-020 to FR-025). Nothing is saved until the user taps Save.
export default function NewItemPage() {
  const router = useRouter();
  const meta = useQuery<Meta>('/meta');
  const [preview, setPreview] = useState<string | null>(null);
  const [photo, setPhoto] = useState<Blob | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [originalId, setOriginalId] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<Analysis>({ state: 'running' });
  const [bg, setBg] = useState<Bg>({ state: 'running', label: 'Preparing', pct: 0 });
  const cleanId = useRef<Promise<string | null>>(Promise.resolve(null));

  useEffect(() => () => {
    if (preview) URL.revokeObjectURL(preview);
  }, [preview]);

  async function onFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setUploadError(null);
    try {
      const resized = await resizePhoto(file);
      setPreview(URL.createObjectURL(resized));
      setPhoto(resized);
      await start(resized);
    } catch {
      setUploadError("This photo can't be read. Try a JPEG or PNG.");
    }
  }

  async function start(resized: Blob) {
    setUploadError(null);
    setOriginalId(null);
    let id: string;
    try {
      id = await uploadPhoto(resized, 'ITEM_ORIGINAL');
    } catch (err) {
      setUploadError((err as ApiError).message);
      return;
    }
    setOriginalId(id);

    // (a) AI analysis and (b) background removal run in parallel; (b) runs whatever (a) does.
    setAnalysis({ state: 'running' });
    api<{ proposed: ItemAttrs }>('/items/analyze', { method: 'POST', body: { originalPublicId: id } })
      .then(({ proposed }) => setAnalysis({ state: 'done', values: { ...EMPTY_VALUES, ...proposed } }))
      .catch((err: ApiError) =>
        setAnalysis({ state: 'failed', message: `Couldn't analyze the photo: ${err.message} Fill in the details, or save it as a draft.` }),
      );

    setBg({ state: 'running', label: 'Preparing', pct: 0 });
    cleanId.current = removeBg(resized, (label, pct) => setBg({ state: 'running', label, pct }))
      .then((clean) => uploadPhoto(clean, 'ITEM_CLEAN'))
      .then((cid) => {
        setBg({ state: 'done' });
        return cid;
      })
      .catch(() => {
        setBg({ state: 'failed' });
        return null;
      });
  }

  async function save(values: ItemValues, status: 'COMPLETE' | 'DRAFT') {
    // Save waits for background removal; a failure saves without a clean image.
    const cleanPublicId = await cleanId.current;
    await api('/items', { method: 'POST', body: { ...values, status, originalPublicId: originalId, cleanPublicId } });
    afterItemChange();
    toast(status === 'DRAFT' ? 'Saved as draft' : 'Item saved');
    router.replace('/wardrobe');
  }

  // Step 1: choose a photo.
  if (!photo) {
    return (
      <main>
        <TopBar title="Add item" back />
        <div className="fade-in flex flex-col gap-3 p-4">
          <p className="text-muted">One garment per photo. A plain background gives the best result.</p>
          <PickTile icon={<IconCamera />} title="Take a photo" hint="Opens the camera" capture onChange={onFile} />
          <PickTile icon={<IconImage />} title="Choose from files" hint="JPEG or PNG" onChange={onFile} />
          {uploadError && <ErrorBox error={new Error(uploadError)} />}
        </div>
      </main>
    );
  }

  const bgText =
    bg.state === 'running' ? `${bg.label}${bg.pct ? ` ${bg.pct}%` : '…'}` : bg.state === 'done' ? 'Background removed' : 'Background removal failed. You can retry from the item later.';

  return (
    <main>
      <TopBar title="New item" back />
      <div className="fade-in flex flex-col gap-4 p-4 pb-0">
        <div className="flex items-center gap-3">
          <img src={preview!} alt="Your photo" className="h-24 w-24 shrink-0 rounded-[10px] bg-surface object-cover" />
          <div className="min-w-0 flex-1 text-sm">
            {uploadError ? (
              <div className="flex flex-col items-start gap-2">
                <span className="text-danger">{uploadError}</span>
                <div className="flex gap-2">
                  <button className="btn btn-sm" onClick={() => start(photo)}>Try again</button>
                  <button className="btn btn-sm btn-sec" onClick={() => { setPhoto(null); setPreview(null); }}>Other photo</button>
                </div>
              </div>
            ) : !originalId ? (
              <span className="flex items-center gap-2 text-muted"><Spinner />Uploading photo…</span>
            ) : (
              <>
                <span className={bg.state === 'failed' ? 'text-warn' : ''}>{bgText}</span>
                {bg.state === 'running' && (
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface">
                    <div className="h-full origin-left bg-accent transition-transform duration-300" style={{ transform: `scaleX(${bg.pct / 100})` }} />
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        {originalId && (analysis.state === 'running' || !meta.data) && (
          <div className="flex flex-col items-center gap-3 py-12 text-muted" role="status">
            <IconSparkle className="animate-pulse" width={28} height={28} />
            <span>Analyzing your photo…</span>
            <span className="text-xs">Usually a few seconds</span>
          </div>
        )}

        {originalId && analysis.state !== 'running' && meta.data && (
          <ItemForm
            meta={meta.data}
            initial={analysis.state === 'done' ? analysis.values : EMPTY_VALUES}
            banner={
              analysis.state === 'done' ? (
                <div className="banner">
                  Filled in by AI. Check and fix anything wrong.
                  {analysis.values.aiNote && <span className="mt-1 block text-muted">{analysis.values.aiNote}</span>}
                </div>
              ) : (
                <div className="banner banner-err" role="alert">{analysis.message}</div>
              )
            }
            submitLabel="Save"
            draftLabel={analysis.state === 'failed' ? 'Save as draft' : undefined}
            busyText={bg.state === 'running' ? 'Finishing background removal…' : 'Saving…'}
            onSubmit={save}
          />
        )}
      </div>
    </main>
  );
}

function PickTile({
  icon,
  title,
  hint,
  capture,
  onChange,
}: {
  icon: React.ReactNode;
  title: string;
  hint: string;
  capture?: boolean;
  onChange: (e: ChangeEvent<HTMLInputElement>) => void;
}) {
  return (
    <label className="card flex min-h-[76px] cursor-pointer items-center gap-4 p-4 transition-transform active:scale-[0.98] has-[:focus-visible]:outline-2">
      <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-surface">{icon}</span>
      <span className="flex flex-col">
        <b>{title}</b>
        <span className="text-sm text-muted">{hint}</span>
      </span>
      <input type="file" accept="image/*" capture={capture ? 'environment' : undefined} className="sr-only" onChange={onChange} />
    </label>
  );
}
