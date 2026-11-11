'use client';
import { useParams, useRouter } from 'next/navigation';
import { afterItemChange, ItemForm, seedItem } from '@/components/items';
import { ErrorBox, Photo, Spinner, TopBar } from '@/components/ui';
import { api } from '@/lib/api';
import { setCached, useQuery } from '@/lib/store';
import { toast } from '@/lib/toast';
import { itemName, type Item, type Meta } from '@/lib/types';

// Edit an item, or complete a draft (a status change; the item keeps its id and photo, DB D6).
export default function EditItemPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const key = `/items/${id}`;
  const q = useQuery<Item>(key, () => seedItem(id));
  const meta = useQuery<Meta>('/meta');
  const item = q.data;
  const draft = item?.status === 'DRAFT';

  return (
    <main>
      <TopBar title={draft ? 'Complete draft' : 'Edit item'} back />
      <div className="fade-in flex flex-col gap-4 p-4 pb-0">
        {q.error || meta.error ? (
          <ErrorBox error={(q.error ?? meta.error)!} onRetry={() => { q.reload(); meta.reload(); }} />
        ) : !item || !meta.data ? (
          <div className="flex justify-center py-10 text-muted"><Spinner /></div>
        ) : (
          <>
            <Photo src={item.cleanUrl ?? item.originalUrl} alt={itemName(item)} size={300} contain={!!item.cleanUrl} className="h-28 w-28 rounded-[10px]" />
            <ItemForm
              meta={meta.data}
              initial={item}
              submitLabel={draft ? 'Save as complete' : 'Save changes'}
              draftLabel={draft ? 'Keep as draft' : undefined}
              onSubmit={async (v, status) => {
                const saved = await api<Item>(key, {
                  method: 'PATCH',
                  body: { ...v, ...(draft && status === 'COMPLETE' ? { status } : {}) },
                });
                setCached(key, () => saved);
                afterItemChange();
                toast(draft && status === 'COMPLETE' ? 'Item completed' : 'Changes saved');
                router.back();
              }}
            />
          </>
        )}
      </div>
    </main>
  );
}
