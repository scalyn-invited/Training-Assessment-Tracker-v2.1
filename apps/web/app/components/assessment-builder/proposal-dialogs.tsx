'use client';
import { createRef, useLayoutEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { Dialog } from '../ui/dialog';
import { Button } from '../ui/controls';
import styles from './proposal-dialogs.module.css';

type Entry = {
  id: string;
  title: string;
  host: HTMLElement;
  trigger: HTMLButtonElement;
  help: string;
};

/** React owns only dialog chrome; the existing controllers retain their DOM/state. */
export function mountProposalDialogs(builder: HTMLElement, entries: Entry[]) {
  const container = document.createElement('div');
  builder.append(container);
  const root = createRoot(container);
  let disposed = false;
  const dialogs = entries.map((entry) => ({ ...entry, ref: createRef<HTMLDialogElement>() }));
  function close(entry: (typeof dialogs)[number], returnFocus = true) {
    entry.ref.current?.close();
    if (returnFocus && entry.trigger.isConnected && entry.trigger.getClientRects().length)
      entry.trigger.focus();
  }
  const suspend = () => dialogs.forEach((entry) => close(entry, false));
  const listeners = dialogs.map((entry) => {
    entry.trigger.disabled = true;
    const open = () => {
      if (disposed || !builder.isConnected || !entry.ref.current) return;
      suspend();
      entry.ref.current.showModal();
      entry.ref.current.querySelector<HTMLElement>('h2')?.focus({ preventScroll: true });
    };
    entry.trigger.addEventListener('click', open);
    return () => entry.trigger.removeEventListener('click', open);
  });
  builder.addEventListener('assessment-builder:detach', suspend);
  function Dialogs() {
    useLayoutEffect(() => {
      dialogs.forEach((entry) => {
        entry.trigger.disabled = false;
      });
    }, []);
    return dialogs.map((entry) => (
      <Dialog
        key={entry.id}
        dialogRef={entry.ref}
        titleId={`${entry.id}-title`}
        aria-describedby={`${entry.id}-description ${entry.id}-help`}
        className={styles.modal}
        onCancel={(event) => {
          event.preventDefault();
          close(entry);
        }}
      >
        <header className={styles.header}>
          <h2 id={`${entry.id}-title`} tabIndex={-1}>
            {entry.title}
          </h2>
          <Button type="button" variant="secondary" onClick={() => close(entry)}>
            Close
          </Button>
        </header>
        <div className={styles.body} data-proposal-dialog-body>
          <p id={`${entry.id}-description`}>
            Review proposals before adding them. Nothing is saved or published automatically.
          </p>
          <div
            ref={(element) => {
              if (element) element.append(entry.host);
            }}
          />
        </div>
        <footer className={styles.footer}>
          <p id={`${entry.id}-help`}>{entry.help}</p>
        </footer>
      </Dialog>
    ));
  }
  root.render(<Dialogs />);
  return {
    dispose() {
      disposed = true;
      suspend();
      listeners.forEach((remove) => remove());
      builder.removeEventListener('assessment-builder:detach', suspend);
      // Builder cleanup may run inside React's own commit; unmount this island after it.
      queueMicrotask(() => {
        root.unmount();
        container.remove();
      });
    },
  };
}
