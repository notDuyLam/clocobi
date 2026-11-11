'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { getCached, invalidate } from '@/lib/store';
import { itemName, type Outfit } from '@/lib/types';
import { IconHeart } from './icons';
import { itemImage } from './items';
import { Photo } from './ui';

export const afterOutfitChange = () => invalidate('/outfits', '/occasions');

export const outfitTitle = (o: Outfit) =>
  o.items
    .filter((i) => i.item && !i.optional)
    .map((i) => itemName(i.item!))
    .join(' + ') || 'Outfit';

export function seedOutfit(id: string) {
  const lists = [`/outfits?liked=true`];
  const occ = getCached<{ occasions: { id: string }[] }>('/occasions')?.occasions ?? [];
  for (const o of occ) lists.push(`/occasions/${o.id}/outfits`);
  for (const key of lists) {
    const hit = getCached<{ outfits: Outfit[] }>(key)?.outfits.find((o) => o.id === id);
    if (hit) return hit;
  }
}

// FR-061: collage from item photos when the outfit has no generated image.
export function Collage({ outfit, size = 300 }: { outfit: Outfit; size?: number }) {
  const photos = outfit.items.filter((i) => i.item).slice(0, 4);
  return (
    <div className="grid aspect-[3/4] grid-cols-2 gap-0.5 bg-line">
      {photos.map(({ id, item }) => (
        <Photo key={id} src={itemImage(item!)} alt={itemName(item!)} size={size} contain={!!item!.cleanUrl} className={`${photos.length === 3 && id === photos[2].id ? 'col-span-2' : ''} ${photos.length <= 2 ? 'row-span-2' : ''}`} />
      ))}
    </div>
  );
}

export function OutfitCard({ outfit }: { outfit: Outfit }) {
  return (
    <Link href={`/outfits/${outfit.id}`} className="card flex flex-col transition-transform active:scale-[0.98]">
      {outfit.imageUrl ? (
        <Photo src={outfit.imageUrl} alt={outfitTitle(outfit)} size={500} className="aspect-[3/4]" />
      ) : (
        <Collage outfit={outfit} />
      )}
      <div className="flex items-start justify-between gap-2 px-2.5 py-2 text-sm">
        <span className="line-clamp-2">{outfitTitle(outfit)}</span>
        {outfit.liked && <IconHeart filled width={16} height={16} className="mt-0.5 shrink-0" aria-label="Liked" />}
      </div>
      {outfit.isIncomplete && <span className="badge mx-2.5 mb-2.5 self-start text-warn">Incomplete</span>}
    </Link>
  );
}

export function OutfitGrid({ outfits }: { outfits: Outfit[] }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      {outfits.map((o) => <OutfitCard key={o.id} outfit={o} />)}
    </div>
  );
}

// Seconds since a slow AI call started, so a 10 to 30 s wait does not look frozen.
export function useElapsed(running: boolean) {
  const [s, setS] = useState(0);
  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => setS((x) => x + 1), 1000);
    return () => {
      clearInterval(t);
      setS(0);
    };
  }, [running]);
  return s;
}
