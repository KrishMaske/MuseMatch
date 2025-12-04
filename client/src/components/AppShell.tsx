import { Compass, Heart, Home, LogOut, Map, Menu, User, X } from 'lucide-react';
import { useState } from 'react';
import { Link, NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '@/features/auth/AuthProvider';
import { Button } from './ui/button';
import { cn } from '@/lib/utils';

const links = [
  { to: '/home', label: 'Home', icon: Home },
  { to: '/discover', label: 'Discover', icon: Compass },
  { to: '/collections', label: 'Collections', icon: Heart },
  { to: '/visits', label: 'Visits', icon: Map },
  { to: '/profile', label: 'Taste', icon: User },
];

export function AppShell() {
  const [open, setOpen] = useState(false);
  const { signOut, email } = useAuth();
  return (
    <div className="min-h-screen pb-16 md:pb-0">
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      <header className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur">
        <div className="container flex h-16 items-center justify-between">
          <Link to="/home" className="font-display text-2xl">
            Muse<span className="text-primary">Match</span>
          </Link>
          <nav className="hidden items-center gap-1 md:flex" aria-label="Main navigation">
            {links.map(({ to, label, icon: Icon }) => (
              <NavLink
                key={to}
                to={to}
                className={({ isActive }) =>
                  cn(
                    'flex items-center gap-2 rounded-md px-3 py-2 text-sm text-muted-foreground hover:text-foreground',
                    isActive && 'bg-secondary text-foreground',
                  )
                }
              >
                <Icon className="size-4" />
                {label}
              </NavLink>
            ))}
          </nav>
          <div className="hidden items-center gap-3 md:flex">
            {email ? (
              <span className="max-w-[16rem] truncate text-sm text-muted-foreground" title={email}>
                {email}
              </span>
            ) : null}
            <Button variant="ghost" size="sm" onClick={() => void signOut()}>
              <LogOut className="size-4" />
              Sign out
            </Button>
          </div>
          <Button
            className="md:hidden"
            variant="ghost"
            size="icon"
            onClick={() => setOpen(!open)}
            aria-expanded={open}
            aria-label="Toggle navigation"
          >
            {open ? <X /> : <Menu />}
          </Button>
        </div>
        {open ? (
          <nav
            className="container grid gap-1 border-t py-3 md:hidden"
            aria-label="Mobile navigation"
          >
            {links.map(({ to, label, icon: Icon }) => (
              <NavLink
                key={to}
                to={to}
                onClick={() => setOpen(false)}
                className={({ isActive }) =>
                  cn(
                    'flex items-center gap-3 rounded-md px-3 py-3 text-sm',
                    isActive && 'bg-secondary',
                  )
                }
              >
                <Icon className="size-4" />
                {label}
              </NavLink>
            ))}

            <div className="mt-2 border-t pt-3">
              {email ? (
                <p className="px-3 pb-2 text-xs text-muted-foreground">Signed in as {email}</p>
              ) : null}
              <Button
                variant="ghost"
                className="w-full justify-start px-3"
                onClick={() => {
                  setOpen(false);
                  void signOut();
                }}
              >
                <LogOut className="size-4" />
                Sign out
              </Button>
            </div>
          </nav>
        ) : null}
      </header>
      <main id="main-content">
        <Outlet />
      </main>
      <nav
        className="fixed bottom-0 z-40 grid w-full grid-cols-5 border-t bg-background md:hidden"
        aria-label="Bottom navigation"
      >
        {links.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              cn(
                'flex flex-col items-center gap-1 py-2 text-[10px] text-muted-foreground',
                isActive && 'text-primary',
              )
            }
          >
            <Icon className="size-5" />
            {label}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
