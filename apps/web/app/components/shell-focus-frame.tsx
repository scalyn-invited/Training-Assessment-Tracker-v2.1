'use client';
import { Component, createRef, type HTMLAttributes } from 'react';

/** Keep the shell's DOM shape, but recover focus when a gate removes its owner. */
export class ShellFocusFrame extends Component<HTMLAttributes<HTMLDivElement>> {
  private root = createRef<HTMLDivElement>();

  getSnapshotBeforeUpdate() {
    // Unlike an effect, this runs before React removes the focused control.
    const active = document.activeElement;
    return active instanceof HTMLElement && this.root.current?.contains(active) ? active : null;
  }

  componentDidUpdate(
    _previousProps: HTMLAttributes<HTMLDivElement>,
    _previousState: unknown,
    previousFocus: HTMLElement | null,
  ) {
    if (previousFocus && !previousFocus.isConnected && document.activeElement === document.body) {
      // Never restore an old identity/control, or override focus chosen by a
      // dialog, recovery screen, router or user. Main remains usable while its
      // pending content becomes a destination or actionable recovery.
      this.root.current?.querySelector<HTMLElement>('main#main[tabindex="-1"]')?.focus({
        preventScroll: true,
      });
    }
  }

  render() {
    return <div {...this.props} ref={this.root} />;
  }
}
