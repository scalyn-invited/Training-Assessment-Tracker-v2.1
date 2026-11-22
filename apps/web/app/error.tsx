'use client';
import { RecoveryFrame } from './components/recovery-frame';
import { Button } from './components/ui/controls';
import { ShellRecovery } from './components/app-shell';
export default function ErrorPage({ retry }: { retry: () => void }) {
  return (
    <RecoveryFrame
      title="This page could not load"
      message="Try loading the page again. Your saved records have not been changed."
    >
      <ShellRecovery />
      <Button variant="primary" onClick={retry}>
        Try again
      </Button>
    </RecoveryFrame>
  );
}
