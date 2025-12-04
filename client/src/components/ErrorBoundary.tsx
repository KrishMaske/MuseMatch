import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Button } from './ui/button';

export class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  override state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  override componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('MuseMatch render error', error, info);
  }
  override render() {
    if (this.state.failed)
      return (
        <main className="container flex min-h-screen items-center justify-center">
          <div className="max-w-md text-center">
            <p className="eyebrow">MuseMatch</p>
            <h1 className="mt-3 text-4xl">The exhibition hit a snag.</h1>
            <p className="mt-4 text-muted-foreground">Reload the page to return to the gallery.</p>
            <Button className="mt-6" onClick={() => window.location.reload()}>
              Reload
            </Button>
          </div>
        </main>
      );
    return this.props.children;
  }
}
