'use client';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useState } from 'react';
import { ColorMood, NO_MOOD, type Mood } from '@/components/color-mood';
import { IconEdit, IconSparkle, IconTrash } from '@/components/icons';
import { OccasionForm } from '@/components/occasion-form';
import { OutfitGrid, useElapsed } from '@/components/outfits';
import { Confirm, Empty, ErrorBox, GridSkeleton, TopBar } from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import { invalidate, setCached, useQuery } from '@/lib/store';
import { toast } from '@/lib/toast';
import type { Meta, Notice, Occasion, Outfit } from '@/lib/types';

// Remembered for this session only, per occasion (the API never stores it).
const moods = new Map<string, Mood>();

export default function OccasionPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const occasions = useQuery<{ occasions: Occasion[] }>('/occasions');
  const outfitsKey = `/occasions/${id}/outfits`;
  const outfits = useQuery<{ outfits: Outfit[] }>(outfitsKey);
  const meta = useQuery<Meta>('/meta');
  const [mood, setMoodState] = useState<Mood>(moods.get(id) ?? NO_MOOD);
  const [generating, setGenerating] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [genError, setGenError] = useState<ApiError | null>(null);
  const [editing, setEditing] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const elapsed = useElapsed(generating);
  const occasion = occasions.data?.occasions.find((o) => o.id === id);

  const setMood = (m: Mood) => {
    moods.set(id, m);
    setMoodState(m);
  };

  // Not idempotent (uses AI quota), so no automatic retry.
  async function generate() {
    setGenerating(true);
    setNotice(null);
    setGenError(null);
    try {
      const r = await api<{ outfits: Outfit[]; notice: Notice | null }>(`${outfitsKey}/generate`, { method: 'POST', body: mood });
      setCached<{ outfits: Outfit[] }>(outfitsKey, (o) => ({ outfits: [...r.outfits, ...(o?.outfits ?? [])] }));
      setCached<{ occasions: Occasion[] }>('/occasions', (o) =>
        o && { occasions: o.occasions.map((x) => (x.id === id ? { ...x, outfitCount: x.outfitCount + r.outfits.length } : x)) },
      );
      setNotice(r.notice?.message ?? null);
      if (r.outfits.length) toast(`${r.outfits.length} new ${r.outfits.length === 1 ? 'outfit' : 'outfits'}`);
    } catch (e) {
      setGenError(e as ApiError);
    } finally {
      setGenerating(false);
    }
  }

  async function remove() {
    setDeleting(true);
    try {
      await api(`/occasions/${id}`, { method: 'DELETE' });
      invalidate('/occasions', '/outfits');
      toast('Occasion deleted');
      router.replace('/occasions');
    } catch (e) {
      toast((e as ApiError).message);
      setDeleting(false);
      setConfirm(false);
    }
  }

  if (!occasion) {
    return (
      <main>
        <TopBar title="Occasion" back="/occasions" />
        <div className="p-4">
          {occasions.error ? (
            <ErrorBox error={occasions.error} onRetry={occasions.reload} />
          ) : occasions.data ? (
            <ErrorBox error={new Error('This occasion no longer exists.')} />
          ) : (
            <div className="skeleton h-24 rounded-[var(--radius)]" />
          )}
        </div>
      </main>
    );
  }

  const list = outfits.data?.outfits;
  return (
    <main>
      <TopBar
        title={occasion.name}
        back="/occasions"
        right={
          <>
            <button className="icon-btn" aria-label="Edit occasion" onClick={() => setEditing(true)}><IconEdit /></button>
            <button className="icon-btn" aria-label="Delete occasion" onClick={() => setConfirm(true)}><IconTrash /></button>
          </>
        }
      />
      <div className="fade-in flex flex-col gap-3 p-4">
        {editing ? <OccasionForm occasion={occasion} onDone={() => setEditing(false)} /> : <p className="text-muted">{occasion.description}</p>}
        {meta.data && <ColorMood meta={meta.data} mood={mood} onChange={setMood} />}
        <button className="btn" onClick={generate} disabled={generating}>
          {generating ? (
            <><IconSparkle className="animate-pulse" width={20} height={20} />Picking outfits… {elapsed}s</>
          ) : (
            <><IconSparkle width={20} height={20} />Generate outfits</>
          )}
        </button>
        {generating && <p className="text-center text-xs text-muted">This can take up to 30 seconds.</p>}
        {notice && <div className="banner fade-in" role="status">{notice}</div>}
        {genError && <GenerateError error={genError} onRetry={generate} />}

        <h2 className="label mt-3">Outfits{list ? ` · ${list.length}` : ''}</h2>
        {outfits.error ? (
          <ErrorBox error={outfits.error} onRetry={outfits.reload} />
        ) : !list ? (
          <GridSkeleton count={4} ratio="aspect-[3/4]" />
        ) : list.length === 0 ? (
          <Empty><p>No outfits yet. Press Generate.</p></Empty>
        ) : (
          <OutfitGrid outfits={list} />
        )}
      </div>
      {confirm && (
        <Confirm
          title={`Delete “${occasion.name}”?`}
          body={occasion.outfitCount ? `Its ${occasion.outfitCount} ${occasion.outfitCount === 1 ? 'outfit' : 'outfits'} will be deleted too. This can't be undone.` : "This can't be undone."}
          confirmLabel="Delete"
          danger
          busy={deleting}
          onConfirm={remove}
          onCancel={() => setConfirm(false)}
        />
      )}
    </main>
  );
}

function GenerateError({ error, onRetry }: { error: ApiError; onRetry: () => void }) {
  if (error.code === 'PROFILE_REQUIRED') {
    return (
      <div className="banner banner-err fade-in flex items-center justify-between gap-3" role="alert">
        <span>{error.message}</span>
        <Link href="/profile" className="btn btn-sm btn-sec shrink-0">Open profile</Link>
      </div>
    );
  }
  if (error.code === 'MISSING_SLOTS') {
    return (
      <div className="banner banner-err fade-in flex items-center justify-between gap-3" role="alert">
        <span>{error.message}</span>
        <Link href="/items/new" className="btn btn-sm btn-sec shrink-0">Add item</Link>
      </div>
    );
  }
  return <ErrorBox error={error} onRetry={onRetry} />;
}
