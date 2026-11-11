'use client';
import { useState } from 'react';
import { ItemGrid } from '@/components/items';
import { OutfitGrid } from '@/components/outfits';
import { Empty, ErrorBox, GridSkeleton, TopBar } from '@/components/ui';
import { useQuery } from '@/lib/store';
import type { Item, Outfit } from '@/lib/types';

const memory = new Map<'tab', 'items' | 'outfits'>();

// FR-032 and FR-056. Liked items include drafts, marked with a "Draft" badge.
export default function LikedPage() {
  const [tab, setTabState] = useState(() => memory.get('tab') ?? 'items');
  const items = useQuery<{ items: Item[] }>('/items?liked=true');
  const outfits = useQuery<{ outfits: Outfit[] }>('/outfits?liked=true');
  const setTab = (t: typeof tab) => {
    memory.set('tab', t);
    setTabState(t);
  };
  const q = tab === 'items' ? items : outfits;
  const n = (x?: unknown[]) => (x ? ` · ${x.length}` : '');

  return (
    <main>
      <TopBar title="Liked" />
      <div className="p-4">
        <div className="mb-4 grid grid-cols-2 overflow-hidden rounded-[10px] border border-line text-sm" role="tablist">
          {(['items', 'outfits'] as const).map((t) => (
            <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)} className={`min-h-[42px] transition-colors ${tab === t ? 'bg-accent text-[var(--on-accent)]' : ''}`}>
              {t === 'items' ? `Items${n(items.data?.items)}` : `Outfits${n(outfits.data?.outfits)}`}
            </button>
          ))}
        </div>
        {q.error ? (
          <ErrorBox error={q.error} onRetry={q.reload} />
        ) : tab === 'items' ? (
          !items.data ? <GridSkeleton /> : items.data.items.length ? <ItemGrid items={items.data.items} /> : <Empty><p>Tap the heart on an item to see it here.</p></Empty>
        ) : !outfits.data ? (
          <GridSkeleton count={4} ratio="aspect-[3/4]" />
        ) : outfits.data.outfits.length ? (
          <OutfitGrid outfits={outfits.data.outfits} />
        ) : (
          <Empty><p>Tap the heart on an outfit to see it here.</p></Empty>
        )}
      </div>
    </main>
  );
}
