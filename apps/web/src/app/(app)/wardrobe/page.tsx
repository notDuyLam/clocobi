'use client';
import Link from 'next/link';
import { useState } from 'react';
import { IconPlus } from '@/components/icons';
import { ItemGrid } from '@/components/items';
import { Empty, ErrorBox, GridSkeleton, TopBar } from '@/components/ui';
import { useQuery } from '@/lib/store';
import { CATEGORY_LABEL, type Category, type Item } from '@/lib/types';

type Tab = Category | 'DRAFT';
const TABS = Object.keys(CATEGORY_LABEL) as Category[];
// Kept across navigations, so coming back from an item keeps the tab.
const memory = new Map<'tab', Tab>();

export default function WardrobePage() {
  const [tab, setTabState] = useState<Tab>(() => memory.get('tab') ?? 'TOP');
  const setTab = (t: Tab) => {
    memory.set('tab', t);
    setTabState(t);
  };
  // One request per list; tabs filter in memory, so switching is instant.
  // Counts come from the same list (COMPLETE only), so they always match what is shown.
  const complete = useQuery<{ items: Item[] }>('/items');
  const drafts = useQuery<{ items: Item[] }>('/items?status=DRAFT');
  const q = tab === 'DRAFT' ? drafts : complete;
  const shown = tab === 'DRAFT' ? drafts.data?.items : complete.data?.items.filter((i) => i.category === tab);
  const count = (t: Tab) =>
    t === 'DRAFT' ? drafts.data?.items.length : complete.data?.items.filter((i) => i.category === t).length;

  return (
    <main>
      <TopBar
        title="Wardrobe"
        right={
          <Link href="/items/new" className="btn btn-sm mr-2"><IconPlus width={18} height={18} />Add item</Link>
        }
      />
      <div className="scrollbar-none flex gap-2 overflow-x-auto px-4 pt-3 pb-1" role="tablist" aria-label="Categories">
        {[...TABS, 'DRAFT' as const].map((t) => (
          <button key={t} role="tab" aria-selected={tab === t} className="chip" onClick={() => setTab(t)}>
            {t === 'DRAFT' ? 'Drafts' : CATEGORY_LABEL[t]}
            {count(t) !== undefined && <span className="ml-1.5 opacity-70">{count(t)}</span>}
          </button>
        ))}
      </div>
      <div className="p-4">
        {tab === 'DRAFT' && (
          <p className="banner mb-3">Drafts are photos without full details. They are never used in outfits. Tap one to complete it.</p>
        )}
        {q.error ? (
          <ErrorBox error={q.error} onRetry={q.reload} />
        ) : !shown ? (
          <GridSkeleton />
        ) : shown.length === 0 ? (
          <Empty>
            <p>{tab === 'DRAFT' ? 'No drafts.' : `No ${CATEGORY_LABEL[tab].toLowerCase()} yet.`}</p>
            {tab !== 'DRAFT' && <Link href="/items/new" className="btn btn-sec">Add item</Link>}
          </Empty>
        ) : (
          <ItemGrid key={tab} items={shown} />
        )}
      </div>
    </main>
  );
}
