import { useState, type FormEvent } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '@/features/auth/AuthProvider';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Input,
  Label,
} from '@/components/ui/primitives';

export function LandingPage() {
  const { isAuthenticated } = useAuth();
  if (isAuthenticated) return <Navigate to="/home" replace />;
  return (
    <main className="min-h-screen">
      <header className="container flex h-20 items-center justify-between">
        <span className="font-display text-2xl">
          Muse<span className="text-primary">Match</span>
        </span>
        <div className="flex gap-2">
          <Button asChild variant="ghost">
            <Link to="/login">Sign in</Link>
          </Button>
          <Button asChild>
            <Link to="/signup">Begin your profile</Link>
          </Button>
        </div>
      </header>
      <section className="container grid min-h-[calc(100vh-5rem)] items-center gap-12 py-16 lg:grid-cols-[1.1fr_.9fr]">
        <div>
          <p className="eyebrow">Art that meets you where you are</p>
          <h1 className="mt-5 max-w-3xl text-balance text-6xl leading-[.95] sm:text-7xl">
            A museum guide shaped by your curiosity.
          </h1>
          <p className="mt-7 max-w-xl text-lg leading-relaxed text-muted-foreground">
            Discover works across The Met and Art Institute of Chicago, understand why they fit your
            taste, and turn favorites into an unhurried visit.
          </p>
          <Button asChild size="lg" className="mt-9">
            <Link to="/signup">Find your matches</Link>
          </Button>
        </div>
        <div className="relative mx-auto aspect-[4/5] w-full max-w-md overflow-hidden rounded-t-[12rem] bg-primary/10 p-8">
          <div className="flex h-full items-end rounded-t-[10rem] border border-primary/20 bg-gradient-to-b from-secondary to-primary/20 p-8">
            <p className="font-display text-3xl italic">
              “The eye should learn to listen before it looks.”
            </p>
          </div>
        </div>
      </section>
    </main>
  );
}

function AuthForm({ mode }: { mode: 'login' | 'signup' }) {
  const { isAuthenticated, signIn, signUp } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirmation, setConfirmation] = useState(false);
  if (isAuthenticated) return <Navigate to="/home" replace />;
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      if (mode === 'login') {
        await signIn(email, password);
        navigate((location.state as { from?: string } | null)?.from ?? '/home');
      } else {
        const { needsEmailConfirmation } = await signUp(email, password);
        // With auto-confirm enabled the account is live and signed in, so
        // promising an email that will never arrive would strand the person.
        if (needsEmailConfirmation) setConfirmation(true);
        else navigate('/onboarding', { replace: true });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to continue.');
    } finally {
      setBusy(false);
    }
  };
  if (confirmation)
    return (
      <main className="container flex min-h-screen items-center justify-center">
        <Card className="max-w-md">
          <CardHeader>
            <CardTitle>Check your inbox</CardTitle>
            <CardDescription>
              We sent a confirmation link to {email}. Follow it, then sign in to begin your taste
              profile.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild className="w-full">
              <Link to="/login">Go to sign in</Link>
            </Button>
          </CardContent>
        </Card>
      </main>
    );
  return (
    <main className="container flex min-h-screen items-center justify-center py-10">
      <Card className="w-full max-w-md shadow-frame">
        <CardHeader>
          <p className="eyebrow">MuseMatch</p>
          <CardTitle className="text-3xl">
            {mode === 'login' ? 'Welcome back' : 'Make art personal'}
          </CardTitle>
          <CardDescription>
            {mode === 'login'
              ? 'Continue your museum path.'
              : 'Create an account, then tell us what moves you.'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit} className="grid gap-4">
            <div>
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                className="mt-2"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                className="mt-2"
                type="password"
                minLength={6}
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            {error ? (
              <p className="text-sm text-destructive" role="alert">
                {error}
              </p>
            ) : null}
            <Button type="submit" disabled={busy}>
              {busy ? 'Please wait…' : mode === 'login' ? 'Sign in' : 'Create account'}
            </Button>
          </form>
          <p className="mt-6 text-center text-sm text-muted-foreground">
            {mode === 'login' ? 'New here?' : 'Already have an account?'}{' '}
            <Link
              className="text-primary underline-offset-4 hover:underline"
              to={mode === 'login' ? '/signup' : '/login'}
            >
              {mode === 'login' ? 'Create an account' : 'Sign in'}
            </Link>
          </p>
        </CardContent>
      </Card>
    </main>
  );
}
export const LoginPage = () => <AuthForm mode="login" />;
export const SignupPage = () => <AuthForm mode="signup" />;
