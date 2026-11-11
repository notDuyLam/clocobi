'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { IconCalendar, IconHanger, IconHeart, IconUser } from '@/components/icons';
import { Spinner, Toast } from '@/components/ui';
import { hasToken, refresh, setAuthLostHandler } from '@/lib/api';
import { clearCache } from '@/lib/store';

const NAV = [
  { href: '/wardrobe', label: 'Wardrobe', Icon: IconHanger, match: ['/wardrobe', '/items'] },
  { href: '/occasions', label: 'Occasions', Icon: IconCalendar, match: ['/occasions', '/outfits'] },
  { href: '/liked', label: 'Liked', Icon: IconHeart, match: ['/liked'] },
  { href: '/profile', label: 'Profile', Icon: IconUser, match: ['/profile'] },
];
// Full-screen tasks hide the nav so the save button is the only way forward.
const HIDE_NAV = /^\/items\/(new|[^/]+\/edit)$/;

// Protected area: on page load the access token is restored from the refresh cookie (TDD 6).
export default function AppLayout({ children }: LayoutProps<'/'>) {
  const router = useRouter();
  const pathname = usePathname();
  const [ready, setReady] = useState(hasToken);

  useEffect(() => {
    const toLogin = () => router.replace(`/login?next=${encodeURIComponent(window.location.pathname)}`);
    setAuthLostHandler(() => {
      clearCache();
      toLogin();
    });
    if (!hasToken()) refresh().then((ok) => (ok ? setReady(true) : toLogin()));
  }, [router]);

  if (!ready) {
    return (
      <div className="flex min-h-dvh items-center justify-center text-muted">
        <Spinner />
      </div>
    );
  }

  const showNav = !HIDE_NAV.test(pathname);
  return (
    <>
      <div className={`mx-auto min-h-dvh max-w-3xl ${showNav ? 'pb-nav' : ''}`}>{children}</div>
      {showNav && (
        <nav aria-label="Main" className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-bg/95 backdrop-blur-sm" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
          <div className="mx-auto grid max-w-3xl grid-cols-4">
            {NAV.map(({ href, label, Icon, match }) => {
              const on = match.some((m) => pathname.startsWith(m));
              return (
                <Link key={href} href={href} aria-current={on ? 'page' : undefined} className={`flex min-h-[60px] flex-col items-center justify-center gap-0.5 text-[11px] transition-colors ${on ? 'font-semibold text-fg' : 'text-muted'}`}>
                  <Icon />
                  {label}
                </Link>
              );
            })}
          </div>
        </nav>
      )}
      <Toast />
    </>
  );
}
