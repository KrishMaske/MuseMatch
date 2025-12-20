import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import {
  useProfile,
  useTasteDashboard,
  useUpdatePreferences,
  useUpdateProfile,
} from '@/api/profile';
import { ErrorState, PageLoading } from '@/components/feedback';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Input,
  Label,
  Progress,
} from '@/components/ui/primitives';
import { toast } from '@/stores/toastStore';

export function ProfilePage() {
  const profile = useProfile();
  const dashboard = useTasteDashboard();
  const update = useUpdateProfile();
  const preferences = useUpdatePreferences();
  const [name, setName] = useState('');
  useEffect(() => {
    setName(profile.data?.displayName ?? '');
  }, [profile.data?.displayName]);
  if (profile.isLoading || dashboard.isLoading) return <PageLoading />;
  if (profile.isError || dashboard.isError || !profile.data || !dashboard.data)
    return (
      <main className="container py-16">
        <ErrorState
          error={profile.error ?? dashboard.error}
          retry={() => {
            void profile.refetch();
            void dashboard.refetch();
          }}
        />
      </main>
    );
  const d = dashboard.data;
  const save = (e: FormEvent) => {
    e.preventDefault();
    update.mutate({ displayName: name }, { onSuccess: () => toast.success('Profile updated') });
  };
  return (
    <div className="container py-10">
      <div className="grid gap-8 lg:grid-cols-[.75fr_1.25fr]">
        <section>
          <p className="eyebrow">Your art personality</p>
          <h1 className="mt-3 text-4xl sm:text-5xl">{d.personality.title}</h1>
          <p className="mt-5 leading-relaxed text-muted-foreground">{d.personality.summary}</p>
          <div className="mt-5 flex flex-wrap gap-2">
            {d.personality.traits.map((t) => (
              <span key={t} className="rounded-full bg-secondary px-3 py-1 text-sm">
                {t}
              </span>
            ))}
          </div>
          <Card className="mt-8">
            <CardHeader>
              <CardTitle>Profile</CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={save} className="grid gap-3">
                <Label htmlFor="display-name">Display name</Label>
                <Input
                  id="display-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="What should we call you?"
                />
                <Button type="submit" disabled={update.isPending}>
                  Save name
                </Button>
              </form>
            </CardContent>
          </Card>
        </section>
        <section className="grid gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Your taste map</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-6 sm:grid-cols-2">
              {[
                ['Mediums', d.mediums],
                ['Eras', d.eras],
                ['Themes', d.themes],
                ['Styles', d.styles],
              ].map(([title, rows]) => (
                <div key={title as string}>
                  <h3 className="text-base">{title as string}</h3>
                  <div className="mt-3 grid gap-2">
                    {(rows as Array<{ key: string; label: string; weight: number }>)
                      .slice(0, 4)
                      .map((r) => (
                        <div key={r.key}>
                          <div className="mb-1 flex justify-between text-xs">
                            <span>{r.label}</span>
                            <span>{Math.round(r.weight * 100)}%</span>
                          </div>
                          <Progress value={r.weight * 100} />
                        </div>
                      ))}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Discovery balance</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex justify-between text-sm">
                <span>Familiar</span>
                <span>Adventurous</span>
              </div>
              <input
                className="mt-3 w-full accent-[hsl(var(--primary))]"
                aria-label="Exploration preference"
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={d.explorationScore}
                onChange={(e) =>
                  preferences.mutate(
                    { explorationScore: Number(e.target.value) },
                    { onSuccess: () => toast.success('Discovery balance updated') },
                  )
                }
              />
              <p className="mt-3 text-sm text-muted-foreground">
                Move right for more unexpected recommendations.
              </p>
            </CardContent>
          </Card>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            {Object.entries(d.activity).map(([label, value]) => (
              <Card key={label} className="p-4 text-center">
                <strong className="font-display text-2xl">{value}</strong>
                <span className="mt-1 block text-[11px] capitalize text-muted-foreground">
                  {label.replace(/([A-Z])/g, ' $1')}
                </span>
              </Card>
            ))}
          </div>
          <Button asChild variant="outline">
            <Link to="/onboarding?retake=1">Retake the taste quiz</Link>
          </Button>
        </section>
      </div>
    </div>
  );
}
