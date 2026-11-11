'use client';
import Link from 'next/link';
import { useState } from 'react';
import { IconPlus } from '@/components/icons';
import { OccasionForm } from '@/components/occasion-form';
import { Empty, ErrorBox, TopBar } from '@/components/ui';
import { useQuery } from '@/lib/store';
import type { Occasion } from '@/lib/types';

export default function OccasionsPage() {
  const q = useQuery<{ occasions: Occasion[] }>('/occasions');
  const [adding, setAdding] = useState(false);

  return (
    <main>
      <TopBar
        title="Occasions"
        right={!adding && <button className="btn btn-sm mr-2" onClick={() => setAdding(true)}><IconPlus width={18} height={18} />New</button>}
      />
      <div className="flex flex-col gap-3 p-4">
        {adding && <OccasionForm onDone={() => setAdding(false)} />}
        {q.error ? (
          <ErrorBox error={q.error} onRetry={q.reload} />
        ) : !q.data ? (
          Array.from({ length: 3 }, (_, i) => <div key={i} className="skeleton h-[74px] rounded-[var(--radius)]" />)
        ) : q.data.occasions.length === 0 && !adding ? (
          <Empty>
            <p>Create an occasion, like &quot;Work&quot; or &quot;Weekend brunch&quot;, then generate outfits for it.</p>
            <button className="btn btn-sec" onClick={() => setAdding(true)}>New occasion</button>
          </Empty>
        ) : (
          <ul className="fade-in flex flex-col gap-3">
            {q.data.occasions.map((o) => (
              <li key={o.id}>
                <Link href={`/occasions/${o.id}`} className="card flex items-center gap-3 p-4 transition-transform active:scale-[0.98]">
                  <span className="min-w-0 flex-1">
                    <b className="block truncate">{o.name}</b>
                    <span className="line-clamp-1 text-sm text-muted">{o.description}</span>
                  </span>
                  <span className="badge shrink-0 text-muted">{o.outfitCount} {o.outfitCount === 1 ? 'outfit' : 'outfits'}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}
