'use client';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useState } from 'react';
import { IconEdit, IconHeart, IconTrash } from '@/components/icons';
import { afterItemChange, Attr, categoryLabel, seedItem } from '@/components/items';
import { Confirm, ErrorBox, Photo, Spinner, TopBar } from '@/components/ui';
import { api, ApiError, uploadPhoto } from '@/lib/api';
import { removeBg } from '@/lib/bg';
import { setCached, useQuery } from '@/lib/store';
import { toast } from '@/lib/toast';
import { itemName, type Item } from '@/lib/types';

export default function ItemPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const key = `/items/${id}`;
  const q = useQuery<Item>(key, () => seedItem(id));
  const [view, setView] = useState<'clean' | 'original'>('clean');
  const [confirm, setConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [bg, setBg] = useState<string | null>(null);
  const [bgError, setBgError] = useState<string | null>(null);
  const [pop, setPop] = useState(0);
  const item = q.data;

  async function patch(body: Partial<Item> & { cleanPublicId?: string }) {
    const saved = await api<Item>(key, { method: 'PATCH', body });
    setCached(key, () => saved);
    afterItemChange();
    return saved;
  }

  async function toggleLike() {
    if (!item) return;
    const liked = !item.liked;
    setPop((n) => n + 1);
    setCached<Item>(key, (o) => o && { ...o, liked });
    try {
      await patch({ liked });
    } catch (e) {
      setCached<Item>(key, (o) => o && { ...o, liked: !liked });
      toast((e as ApiError).message);
    }
  }

  // "Retry background removal" (FR-024): CORS fetch of the original, remove, upload, PATCH.
  async function retryClean() {
    if (!item) return;
    setBgError(null);
    setBg('Starting…');
    try {
      const res = await fetch(item.originalUrl);
      if (!res.ok) throw new Error();
      const clean = await removeBg(await res.blob(), (label, p) => setBg(`${label}… ${p}%`));
      setBg('Uploading…');
      await patch({ cleanPublicId: await uploadPhoto(clean, 'ITEM_CLEAN') });
      toast('Background removed');
      setView('clean');
    } catch (e) {
      setBgError(e instanceof ApiError ? e.message : 'Background removal failed. Try again later.');
    } finally {
      setBg(null);
    }
  }

  async function remove() {
    setDeleting(true);
    try {
      await api(key, { method: 'DELETE' });
      afterItemChange();
      toast('Item deleted');
      router.back();
    } catch (e) {
      toast((e as ApiError).message);
      setDeleting(false);
      setConfirm(false);
    }
  }

  if (!item) {
    return (
      <main>
        <TopBar title="Item" back />
        <div className="p-4">
          {q.error ? <ErrorBox error={q.error} onRetry={q.error.status === 404 ? undefined : q.reload} /> : <div className="skeleton aspect-square rounded-[var(--radius)]" />}
        </div>
      </main>
    );
  }

  const draft = item.status === 'DRAFT';
  const src = view === 'clean' && item.cleanUrl ? item.cleanUrl : item.originalUrl;
  return (
    <main>
      <TopBar
        title={draft ? 'Draft item' : itemName(item)}
        back
        right={
          <button className="icon-btn" aria-label={item.liked ? 'Unlike' : 'Like'} aria-pressed={item.liked} onClick={toggleLike}>
            <IconHeart key={pop} filled={item.liked} className={pop ? 'heart-pop' : ''} />
          </button>
        }
      />
      <div className="fade-in flex flex-col gap-3 p-4">
        <Photo key={src} src={src} alt={itemName(item)} size={900} contain={src === item.cleanUrl} eager className="aspect-square rounded-[var(--radius)]" />
        {item.cleanUrl ? (
          <div className="grid grid-cols-2 overflow-hidden rounded-[10px] border border-line text-sm">
            {(['clean', 'original'] as const).map((v) => (
              <button key={v} aria-pressed={view === v} onClick={() => setView(v)} className={`min-h-[40px] transition-colors ${view === v ? 'bg-accent text-[var(--on-accent)]' : ''}`}>
                {v === 'clean' ? 'Clean' : 'Original'}
              </button>
            ))}
          </div>
        ) : (
          <div className="banner flex items-center justify-between gap-3">
            <span>{bg ?? 'No clean image yet.'}</span>
            <button className="btn btn-sm btn-sec shrink-0" onClick={retryClean} disabled={!!bg}>
              {bg ? <Spinner /> : 'Remove background'}
            </button>
          </div>
        )}
        {bgError && <ErrorBox error={new Error(bgError)} />}
        {draft && (
          <Link href={`/items/${item.id}/edit`} className="btn">Complete this draft</Link>
        )}
        <div className="mt-2">
          <Attr label="Category" value={categoryLabel(item.category)} />
          <Attr label="Type" value={item.subcategory} />
          <Attr label="Colors" value={[item.primaryColor, item.secondaryColor].filter(Boolean).join(', ')} />
          <Attr label="Pattern" value={item.pattern} />
          <Attr label="Fabric" value={item.fabric} />
          <Attr label="Fit" value={item.fit} />
          <Attr label="Formality" value={item.formality} />
          <Attr label="Seasons" value={item.seasons.join(', ')} />
          <Attr label="Size" value={item.size} />
          <Attr label="Brand" value={item.brand} />
        </div>
        {item.notes && <p className="whitespace-pre-line">{item.notes}</p>}
        {item.aiNote && <p className="banner"><b>AI note:</b> {item.aiNote}</p>}
        <div className="mt-2 grid grid-cols-2 gap-3">
          {!draft && <Link href={`/items/${item.id}/edit`} className="btn btn-sec"><IconEdit width={18} height={18} />Edit</Link>}
          <button className={`btn btn-danger ${draft ? 'col-span-2' : ''}`} onClick={() => setConfirm(true)}><IconTrash width={18} height={18} />Delete</button>
        </div>
      </div>
      {confirm && (
        <Confirm
          title="Delete this item?"
          body="Outfits that use it will show it as missing."
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
