'use client';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useState } from 'react';
import { IconClose, IconHeart, IconSparkle, IconTrash } from '@/components/icons';
import { itemImage } from '@/components/items';
import { afterOutfitChange, Collage, outfitTitle, seedOutfit, useElapsed } from '@/components/outfits';
import { Confirm, ErrorBox, Photo, TopBar } from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import { setCached, useQuery } from '@/lib/store';
import { toast } from '@/lib/toast';
import { SLOT_LABEL, itemName, type Outfit } from '@/lib/types';

export default function OutfitPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const key = `/outfits/${id}`;
  const q = useQuery<Outfit>(key, () => seedOutfit(id));
  const [imaging, setImaging] = useState(false);
  const [imgError, setImgError] = useState<ApiError | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [pop, setPop] = useState(0);
  const elapsed = useElapsed(imaging);
  const o = q.data;

  const save = (saved: Outfit) => {
    setCached(key, () => saved);
    afterOutfitChange();
  };

  async function toggleLike() {
    if (!o) return;
    const liked = !o.liked;
    setPop((n) => n + 1);
    setCached<Outfit>(key, (x) => x && { ...x, liked });
    try {
      save(await api<Outfit>(key, { method: 'PATCH', body: { liked } }));
    } catch (e) {
      setCached<Outfit>(key, (x) => x && { ...x, liked: !liked });
      toast((e as ApiError).message);
    }
  }

  // FR-057: optional items only; the image is not regenerated.
  async function removeItem(outfitItemId: string) {
    const before = o;
    setCached<Outfit>(key, (x) => x && { ...x, items: x.items.filter((i) => i.id !== outfitItemId) });
    try {
      save(await api<Outfit>(`${key}/items/${outfitItemId}`, { method: 'DELETE' }));
      toast('Removed from outfit');
    } catch (e) {
      setCached(key, () => before);
      toast((e as ApiError).message);
    }
  }

  // Feature 18 (FR-060). Not idempotent (uses the daily image allowance): manual retry only.
  async function generateImage() {
    setImaging(true);
    setImgError(null);
    try {
      save(await api<Outfit>(`${key}/image`, { method: 'POST' }));
      toast('Image ready');
    } catch (e) {
      setImgError(e as ApiError);
    } finally {
      setImaging(false);
    }
  }

  async function remove() {
    setDeleting(true);
    try {
      await api(key, { method: 'DELETE' });
      afterOutfitChange();
      toast('Outfit deleted');
      router.back();
    } catch (e) {
      toast((e as ApiError).message);
      setDeleting(false);
      setConfirm(false);
    }
  }

  if (!o) {
    return (
      <main>
        <TopBar title="Outfit" back />
        <div className="p-4">
          {q.error ? <ErrorBox error={q.error} onRetry={q.error.status === 404 ? undefined : q.reload} /> : <div className="skeleton aspect-[3/4] rounded-[var(--radius)]" />}
        </div>
      </main>
    );
  }

  return (
    <main>
      <TopBar
        title={o.occasionName}
        back
        right={
          <button className="icon-btn" aria-label={o.liked ? 'Unlike' : 'Like'} aria-pressed={o.liked} onClick={toggleLike}>
            <IconHeart key={pop} filled={o.liked} className={pop ? 'heart-pop' : ''} />
          </button>
        }
      />
      <div className="fade-in flex flex-col gap-3 p-4">
        {o.isIncomplete && (
          <div className="banner banner-err" role="status">Incomplete: a required item was deleted. {o.imageUrl ? 'The image is kept, but' : 'No'} new image can be made.</div>
        )}
        <div className="relative overflow-hidden rounded-[var(--radius)] border border-line sm:mx-auto sm:w-96">
          {o.imageUrl ? (
            <Photo key={o.imageUrl} src={o.imageUrl} alt={outfitTitle(o)} size={800} eager className="aspect-[3/4]" />
          ) : (
            <Collage outfit={o} size={500} />
          )}
          {imaging && (
            <div className="backdrop absolute inset-0 flex flex-col items-center justify-center gap-3 bg-bg/80 text-center" role="status">
              <IconSparkle className="animate-pulse" width={32} height={32} />
              <span>Creating image… {elapsed}s</span>
              <span className="text-xs text-muted">Usually 10 to 20 seconds</span>
            </div>
          )}
        </div>
        {!o.imageUrl && <p className="text-center text-xs text-muted">Collage of your item photos.</p>}
        {imgError && <ErrorBox error={imgError} onRetry={generateImage} />}
        {!o.isIncomplete && (
          <button className="btn btn-sec" onClick={generateImage} disabled={imaging}>
            <IconSparkle width={20} height={20} />
            {o.imageUrl ? 'Regenerate image' : 'Generate image'}
          </button>
        )}

        <h2 className="label mt-3">Styling tips</h2>
        <p className="leading-relaxed">{o.stylingTips}</p>

        <h2 className="label mt-3">Items</h2>
        <ul className="flex flex-col gap-2">
          {o.items.map((oi) => (
            <li key={oi.id} className={`card flex items-center gap-3 p-2 ${!oi.item ? 'border-dashed' : ''}`}>
              {oi.item ? (
                <Link href={`/items/${oi.item.id}`} className="flex min-w-0 flex-1 items-center gap-3">
                  <Photo src={itemImage(oi.item)} alt="" size={150} contain={!!oi.item.cleanUrl} className="h-14 w-14 shrink-0 rounded-lg" />
                  <span className="min-w-0">
                    <span className="block text-xs text-muted">
                      {SLOT_LABEL[oi.slot]}
                      {oi.optional && <span className="badge ml-2">optional</span>}
                    </span>
                    <span className="block truncate">{itemName(oi.item)}</span>
                  </span>
                </Link>
              ) : (
                <div className="flex min-w-0 flex-1 items-center gap-3">
                  <span className="h-14 w-14 shrink-0 rounded-lg bg-surface" />
                  <span className="text-sm text-warn">Missing {SLOT_LABEL[oi.slot].toLowerCase()}: the item was deleted.</span>
                </div>
              )}
              {oi.optional && (
                <button className="icon-btn shrink-0" aria-label={`Remove ${SLOT_LABEL[oi.slot].toLowerCase()} from outfit`} onClick={() => removeItem(oi.id)}>
                  <IconClose width={20} height={20} />
                </button>
              )}
            </li>
          ))}
        </ul>
        <button className="btn btn-danger mt-4" onClick={() => setConfirm(true)}><IconTrash width={18} height={18} />Delete outfit</button>
      </div>
      {confirm && (
        <Confirm title="Delete this outfit?" confirmLabel="Delete" danger busy={deleting} onConfirm={remove} onCancel={() => setConfirm(false)} />
      )}
    </main>
  );
}
