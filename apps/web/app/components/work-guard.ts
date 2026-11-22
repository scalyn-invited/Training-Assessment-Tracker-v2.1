// Page-memory only: never persist private drafts in browser storage.
export type WorkState = { dirty: boolean; pending?: boolean; uncertain?: boolean };
type Source = () => WorkState;
const queryEvent = 'tat:query-work';
export function workState(): WorkState {
  const state: WorkState = { dirty: false, pending: false, uncertain: false };
  window.dispatchEvent(new CustomEvent(queryEvent, { detail: state }));
  return state;
}
export function registerWorkGuard(source: Source) {
  let leaving = false;
  const committed = () => {
    leaving = true;
  };
  const restored = () => {
    leaving = false;
  };
  let reset: ReturnType<typeof setTimeout> | undefined;
  const permitNavigation = () => {
    window.dispatchEvent(new Event('tat:leave-committed'));
    reset = setTimeout(() => window.dispatchEvent(new Event('tat:leave-reset')), 1000);
  };
  const link = (event: MouseEvent) => {
    const anchor = (event.target as Element).closest?.('a');
    if (
      leaving ||
      event.defaultPrevented ||
      event.button !== 0 ||
      event.ctrlKey ||
      event.metaKey ||
      event.shiftKey ||
      event.altKey ||
      !anchor ||
      anchor.target === '_blank' ||
      anchor.hasAttribute('download') ||
      anchor.pathname.startsWith('/api/') ||
      anchor.getAttribute('href')?.startsWith('#')
    )
      return;
    if (!confirmWorkLeave()) {
      event.preventDefault();
      event.stopImmediatePropagation();
    } else permitNavigation();
  };
  // Cancel history traversal before Next receives popstate and unmounts the editor.
  const navigation = (window as Window & { navigation?: EventTarget }).navigation;
  const navigate = (event: Event) => {
    const next = event as Event & {
      navigationType: string;
      destination: { sameDocument: boolean };
    };
    if (
      leaving ||
      event.defaultPrevented ||
      !event.cancelable ||
      next.navigationType !== 'traverse' ||
      !next.destination.sameDocument
    )
      return;
    if (!confirmWorkLeave()) event.preventDefault();
    else permitNavigation();
  };
  const query = (event: Event) => {
    const target = (event as CustomEvent<WorkState>).detail;
    const value = source();
    target.dirty ||= value.dirty;
    target.pending ||= value.pending;
    target.uncertain ||= value.uncertain;
  };
  const unload = (event: BeforeUnloadEvent) => {
    const value = source();
    if (!leaving && (value.dirty || value.pending || value.uncertain)) {
      event.preventDefault();
      event.returnValue = '';
    }
  };
  window.addEventListener(queryEvent, query);
  window.addEventListener('tat:leave-committed', committed);
  window.addEventListener('pageshow', restored);
  window.addEventListener('tat:leave-reset', restored);
  document.addEventListener('click', link, true);
  navigation?.addEventListener('navigate', navigate);
  window.addEventListener('beforeunload', unload);
  return () => {
    window.removeEventListener(queryEvent, query);
    window.removeEventListener('tat:leave-committed', committed);
    window.removeEventListener('pageshow', restored);
    window.removeEventListener('tat:leave-reset', restored);
    document.removeEventListener('click', link, true);
    navigation?.removeEventListener('navigate', navigate);
    clearTimeout(reset);
    window.removeEventListener('beforeunload', unload);
  };
}
export function confirmWorkLeave() {
  const state = workState();
  if (state.pending || state.uncertain) {
    window.alert(
      'An operation is pending or its outcome is unknown. Resolve its status before leaving or changing context.',
    );
    return false;
  }
  return (
    !state.dirty ||
    window.confirm('You have unsaved changes. Leave and discard these changes? Cancel to stay.')
  );
}
export function leaveAfterConfirmedMutation(url: string) {
  window.dispatchEvent(new Event('tat:leave-committed'));
  window.location.assign(url);
}
