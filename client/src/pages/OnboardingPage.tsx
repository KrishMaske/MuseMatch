import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import type { QuizAnswers } from '@musematch/shared';
import { useCompleteOnboarding, useQuizQuestions } from '@/api/profile';
import { ErrorState, PageLoading } from '@/components/feedback';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/primitives';
import { cn } from '@/lib/utils';

export function OnboardingPage() {
  const questions = useQuizQuestions();
  const complete = useCompleteOnboarding();
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<QuizAnswers>({});
  const [message, setMessage] = useState('');
  const navigate = useNavigate();
  const [params] = useSearchParams();
  // Block body on purpose: a concise arrow would return whatever scrollTo
  // gives back, and Chrome returns a Promise. React treats a non-undefined
  // return as the cleanup function and crashes calling it on unmount.
  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [step]);
  if (questions.isLoading) return <PageLoading label="Loading the taste quiz" />;
  if (questions.isError)
    return (
      <main className="container py-20">
        <ErrorState error={questions.error} retry={() => void questions.refetch()} />
      </main>
    );
  const list = questions.data ?? [];
  const question = list[step];
  if (!question) return null;
  const selected = answers[question.id] ?? [];
  const min = question.minSelections ?? 1;
  const valid = selected.length >= min;
  const toggle = (value: string) => {
    setMessage('');
    setAnswers((current) => {
      const prior = current[question.id] ?? [];
      if (question.type === 'single') return { ...current, [question.id]: [value] };
      const next = prior.includes(value)
        ? prior.filter((v) => v !== value)
        : prior.length < (question.maxSelections ?? Infinity)
          ? [...prior, value]
          : prior;
      return { ...current, [question.id]: next };
    });
  };
  const next = () => {
    if (!valid) {
      setMessage(`Choose at least ${min} option${min === 1 ? '' : 's'} to continue.`);
      return;
    }
    if (step < list.length - 1) setStep(step + 1);
    else
      complete.mutate(answers, {
        onSuccess: () => navigate('/home', { replace: true }),
        onError: (e) => setMessage(e instanceof Error ? e.message : 'Could not save your profile.'),
      });
  };
  return (
    <main className="container min-h-screen max-w-4xl py-10 sm:py-16">
      <div className="mb-12 flex items-center justify-between">
        <span className="font-display text-xl">
          Muse<span className="text-primary">Match</span>
        </span>
        <span className="text-sm text-muted-foreground">
          {params.get('retake') ? 'Retaking your profile · ' : ''}
          {step + 1} of {list.length}
        </span>
      </div>
      <Progress value={((step + 1) / list.length) * 100} />
      <section className="mx-auto mt-16 max-w-3xl">
        <p className="eyebrow">Your taste, in your words</p>
        <h1 className="mt-4 text-balance text-4xl sm:text-5xl">{question.prompt}</h1>
        {question.helper ? <p className="mt-3 text-muted-foreground">{question.helper}</p> : null}
        <div className="mt-9 grid gap-3 sm:grid-cols-2">
          {question.options.map((option) => {
            const checked = selected.includes(option.value);
            return (
              <button
                key={option.value}
                type="button"
                aria-pressed={checked}
                onClick={() => toggle(option.value)}
                className={cn(
                  'rounded-lg border bg-card p-5 text-left transition hover:border-primary/50',
                  checked && 'border-primary bg-primary/5 ring-1 ring-primary',
                )}
              >
                <span className="font-medium">{option.label}</span>
                {option.description ? (
                  <span className="mt-1 block text-sm text-muted-foreground">
                    {option.description}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
        {message ? (
          <p className="mt-4 text-sm text-destructive" role="alert">
            {message}
          </p>
        ) : null}
        <div className="mt-10 flex justify-between">
          <Button
            variant="ghost"
            disabled={step === 0 || complete.isPending}
            onClick={() => setStep(step - 1)}
          >
            Back
          </Button>
          <Button size="lg" disabled={complete.isPending} onClick={next}>
            {step === list.length - 1
              ? complete.isPending
                ? 'Building your profile…'
                : 'See my matches'
              : 'Next'}
          </Button>
        </div>
      </section>
    </main>
  );
}
