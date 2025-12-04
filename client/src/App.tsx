import { Navigate, Outlet, Route, Routes, useLocation, useSearchParams } from 'react-router-dom';
import { lazy, Suspense } from 'react';
import { useAuth } from '@/features/auth/AuthProvider';
import { useProfile } from '@/api/profile';
import { AppShell } from '@/components/AppShell';
import { PageLoading, ErrorState } from '@/components/feedback';
const LandingPage = lazy(() => import('@/pages/auth').then((m) => ({ default: m.LandingPage })));
const LoginPage = lazy(() => import('@/pages/auth').then((m) => ({ default: m.LoginPage })));
const SignupPage = lazy(() => import('@/pages/auth').then((m) => ({ default: m.SignupPage })));
const OnboardingPage = lazy(() =>
  import('@/pages/OnboardingPage').then((m) => ({ default: m.OnboardingPage })),
);
const HomePage = lazy(() => import('@/pages/HomePage').then((m) => ({ default: m.HomePage })));
const DiscoverPage = lazy(() =>
  import('@/pages/DiscoverPage').then((m) => ({ default: m.DiscoverPage })),
);
const ArtworkDetailPage = lazy(() =>
  import('@/pages/ArtworkDetailPage').then((m) => ({ default: m.ArtworkDetailPage })),
);
const CollectionsPage = lazy(() =>
  import('@/pages/CollectionsPages').then((m) => ({ default: m.CollectionsPage })),
);
const CollectionDetailPage = lazy(() =>
  import('@/pages/CollectionsPages').then((m) => ({ default: m.CollectionDetailPage })),
);
const VisitsPage = lazy(() =>
  import('@/pages/VisitsPages').then((m) => ({ default: m.VisitsPage })),
);
const NewVisitPage = lazy(() =>
  import('@/pages/VisitsPages').then((m) => ({ default: m.NewVisitPage })),
);
const VisitDetailPage = lazy(() =>
  import('@/pages/VisitsPages').then((m) => ({ default: m.VisitDetailPage })),
);
const ProfilePage = lazy(() =>
  import('@/pages/ProfilePage').then((m) => ({ default: m.ProfilePage })),
);

function RequireAuth() {
  const auth = useAuth();
  const location = useLocation();
  if (auth.loading) return <PageLoading label="Restoring your session" />;
  if (!auth.isAuthenticated)
    return <Navigate to="/login" state={{ from: location.pathname + location.search }} replace />;
  return <Outlet />;
}
function RequireOnboarding() {
  const p = useProfile();
  if (p.isLoading) return <PageLoading label="Loading your profile" />;
  if (p.isError)
    return (
      <main className="container py-16">
        <ErrorState error={p.error} retry={() => void p.refetch()} />
      </main>
    );
  if (!p.data?.onboardingCompleted) return <Navigate to="/onboarding" replace />;
  return <AppShell />;
}
function OnboardingGate() {
  const p = useProfile();
  const [params] = useSearchParams();
  if (p.isLoading) return <PageLoading label="Loading your profile" />;
  if (p.isError)
    return (
      <main className="container py-16">
        <ErrorState error={p.error} retry={() => void p.refetch()} />
      </main>
    );
  if (p.data?.onboardingCompleted && params.get('retake') !== '1')
    return <Navigate to="/home" replace />;
  return <OnboardingPage />;
}

export function App() {
  return (
    <Suspense fallback={<PageLoading />}>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/signup" element={<SignupPage />} />
        <Route element={<RequireAuth />}>
          <Route path="/onboarding" element={<OnboardingGate />} />
          <Route element={<RequireOnboarding />}>
            <Route path="/home" element={<HomePage />} />
            <Route path="/discover" element={<DiscoverPage />} />
            <Route path="/artworks/:id" element={<ArtworkDetailPage />} />
            <Route path="/collections" element={<CollectionsPage />} />
            <Route path="/collections/:id" element={<CollectionDetailPage />} />
            <Route path="/visits" element={<VisitsPage />} />
            <Route path="/visits/new" element={<NewVisitPage />} />
            <Route path="/visits/:id" element={<VisitDetailPage />} />
            <Route path="/profile" element={<ProfilePage />} />
          </Route>
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
}
