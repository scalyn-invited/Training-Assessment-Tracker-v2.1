'use client';
import { Textarea, Button, Panel, Feedback } from './ui/controls';
import styles from './ui/form-layout.module.css';
import { DirectoryTable } from './ui/directory';
import { Dialog } from './ui/dialog';

import { useCallback, useEffect, useRef, useState, useId, type FormEvent } from 'react';
import { api } from './auth-ui';
export type PromotionPersonData = {
  user_id: string;
  name: string;
  email: string;
  active: boolean;
  origin: string;
  sync_policy: string;
  is_synthetic: boolean;
  external_person_id: string | null;
  export_training_history: boolean;
};
export function PromotionPerson({
  person,
  client,
  csrf,
  onSaved,
}: {
  person: PromotionPersonData;
  client: string;
  csrf: string;
  onSaved: (message: string) => void;
}) {
  const reasonId = useId();
  const [reason, setReason] = useState(''),
    [review, setReview] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [key] = useState(() => crypto.randomUUID());
  const history =
    person.sync_policy === 'linked' &&
    Boolean(person.external_person_id) &&
    !person.export_training_history;
  if (
    person.is_synthetic ||
    (!history && !person.active) ||
    (person.sync_policy !== 'local_only' && !history)
  )
    return null;
  if (!history && person.origin !== 'manual') return null;
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    if (!review) {
      setReview(true);
      return;
    }
    setBusy(true);
    setError('');
    try {
      await api('/promotions/' + (history ? 'history' : 'prepare'), {
        csrf,
        clientId: client,
        userId: person.user_id,
        key,
        reason,
      });
      onSaved(
        history
          ? 'Historical training export authorized.'
          : 'Promotion prepared. Review its status in the promotion ledger.',
      );
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : 'The promotion could not be saved. Your reason is retained; try again.',
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <details>
      <summary>{history ? 'Authorize historical export' : 'Prepare promotion to Cerebru'}</summary>
      <p>
        {history
          ? 'This makes training approved before linking available through permission-scoped primary-platform retrieval.'
          : 'Prepare a request for this verified member. No primary-platform service is configured; preparation stays local.'}
      </p>
      <form onSubmit={submit} aria-busy={busy}>
        <Feedback error={error} />
        <label htmlFor={reasonId}>Promotion reason</label>
        <Textarea
          id={reasonId}
          value={reason}
          onChange={(e) => {
            setReason(e.target.value);
            setReview(false);
          }}
          required
          minLength={8}
          maxLength={2000}
        />
        {review && (
          <div role="region" aria-label="Confirm promotion action">
            <h4>
              {history ? 'Export historical training?' : 'Prepare this member for promotion?'}
            </h4>
            <p>
              {person.name} ({person.email})
            </p>
            <p>
              {history
                ? 'Current permissions still apply. This authorization includes approved training from before the member was linked.'
                : 'This pins the member and verified identity. Sending the request is a separate action; historical export remains disabled.'}
            </p>
            <Button
              type="button"
              variant="secondary"
              disabled={busy}
              onClick={() => setReview(false)}
            >
              Cancel promotion review
            </Button>
          </div>
        )}
        <Button type="submit" variant={review ? 'danger' : 'secondary'} disabled={busy}>
          {busy
            ? 'Saving promotion…'
            : review
              ? history
                ? 'Confirm historical export'
                : 'Confirm preparation'
              : 'Review promotion action'}
        </Button>
      </form>
    </details>
  );
}
type Item = {
  id: string;
  user_id: string;
  name: string;
  status: string;
  idempotency_key: string;
  external_person_id: string | null;
  export_training_history: boolean;
};
type Data = { items: Item[]; page: number; total: number; configured: boolean };
const labels: Record<string, string> = {
  prepared: 'Prepared locally',
  queued: 'Queued',
  reconcile_queued: 'Reconciliation queued',
  sending: 'Awaiting acknowledgement',
  ambiguous: 'Outcome uncertain',
  duplicate_review: 'Duplicate review required',
  linked: 'Linked',
};
export function PromotionLedger({ client, csrf }: { client: string; csrf: string }) {
  const [data, setData] = useState<Data | null>(null),
    [page, setPage] = useState(1),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(''),
    [success, setSuccess] = useState(''),
    [item, setItem] = useState<Item | null>(null),
    [reason, setReason] = useState(''),
    [busy, setBusy] = useState(false),
    [actionError, setActionError] = useState('');
  const reviewReasonId = useId();
  const sequence = useRef(0);
  const dialog = useRef<HTMLDialogElement>(null),
    alive = useRef(true);
  const load = useCallback(async () => {
    const request = ++sequence.current;
    setLoading(true);
    try {
      const result = await api<Data>(
        '/promotions?' + new URLSearchParams({ clientId: client, page: String(page) }),
      );
      if (alive.current && sequence.current === request) {
        setData(result);
        setError('');
      }
    } catch (e) {
      if (alive.current && sequence.current === request)
        setError(
          e instanceof Error
            ? e.message
            : 'The promotion ledger could not load. Refresh to try again.',
        );
    } finally {
      if (alive.current && sequence.current === request) setLoading(false);
    }
  }, [client, page]);
  useEffect(() => {
    alive.current = true;
    void load();
    return () => {
      alive.current = false;
      sequence.current++;
    };
  }, [load]);
  useEffect(() => {
    if (!data?.items.some((row) => ['queued', 'reconcile_queued', 'sending'].includes(row.status)))
      return;
    const timer = setInterval(() => {
      if (!busy) void load();
    }, 3000);
    return () => clearInterval(timer);
  }, [data, busy, load]);
  useEffect(() => {
    if (item) dialog.current?.showModal();
  }, [item]);
  function close() {
    if (busy) return;
    dialog.current?.close();
    setItem(null);
    setActionError('');
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!item || busy) return;
    setBusy(true);
    setActionError('');
    try {
      await api('/promotions/' + item.id + '/dispatch', {
        csrf,
        clientId: client,
        reconcile: item.status === 'ambiguous',
        reason,
      });
      dialog.current?.close();
      setItem(null);
      setSuccess(
        item.status === 'ambiguous'
          ? 'Reconciliation queued with the original request key.'
          : 'Prepared request queued. Refresh to review the outcome.',
      );
      await load();
    } catch (e) {
      setActionError(
        e instanceof Error
          ? e.message
          : 'The promotion action could not be queued. Your reason is retained; try again.',
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <Panel className={styles.panel} aria-label="Promotion ledger">
      <h2>Promotion ledger</h2>
      <p>
        No primary-platform service is configured. Prepared requests remain local and excluded from
        external retrieval.
      </p>
      <Feedback error={error} success={success} />
      <Button type="submit" variant="secondary" disabled={loading} onClick={() => void load()}>
        {loading ? 'Refreshing promotions…' : 'Refresh promotions'}
      </Button>
      {!data && loading && <p role="status">Loading promotion requests…</p>}
      {data && (
        <>
          <p className="directory-count" role="status">
            {data.total} promotion requests
          </p>
          <div
            className={styles.tableWrap}
            role="region"
            aria-label="Promotion requests"
            tabIndex={0}
          >
            <DirectoryTable stacked className={styles.table}>
              <caption className="sr-only">Promotion requests</caption>
              <thead>
                <tr>
                  <th scope="col">Person</th>
                  <th scope="col">Status</th>
                  <th scope="col">Reference</th>
                  <th scope="col">Action</th>
                </tr>
              </thead>
              <tbody>
                {data.items.length ? (
                  data.items.map((row) => (
                    <tr key={row.id}>
                      <td data-label="Person">
                        <strong>{row.name}</strong>
                      </td>
                      <td data-label="Status">
                        {labels[row.status] ?? row.status}
                        {row.status === 'duplicate_review' && (
                          <p>Review the existing primary person mapping before proceeding.</p>
                        )}
                        {row.status === 'ambiguous' && (
                          <p>Reconcile this key before any new request.</p>
                        )}
                      </td>
                      <td data-label="Reference">
                        <code style={{ overflowWrap: 'anywhere' }}>{row.idempotency_key}</code>
                      </td>
                      <td data-label="Action">
                        {['prepared', 'ambiguous'].includes(row.status) ? (
                          <Button
                            type="submit"
                            variant="secondary"
                            onClick={() => {
                              setItem(row);
                              setReason('');
                              setActionError('');
                            }}
                          >
                            Review request
                          </Button>
                        ) : row.status === 'linked' ? (
                          row.export_training_history ? (
                            'History export authorized'
                          ) : (
                            'Historical export disabled'
                          )
                        ) : (
                          'No action available'
                        )}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={4}>
                      No promotions yet. Open an eligible real member in the directory to prepare a
                      request.
                    </td>
                  </tr>
                )}
              </tbody>
            </DirectoryTable>
          </div>
          <div className={styles.actions}>
            <Button
              type="submit"
              variant="secondary"
              disabled={loading || data.page <= 1}
              onClick={() => setPage(data.page - 1)}
            >
              Previous promotions
            </Button>
            <span>
              Page {data.page} of {Math.max(1, Math.ceil(data.total / 20))}
            </span>
            <Button
              type="submit"
              variant="secondary"
              disabled={loading || data.page * 20 >= data.total}
              onClick={() => setPage(data.page + 1)}
            >
              Next promotions
            </Button>
          </div>
        </>
      )}
      <Dialog
        titleId="promotion-review-heading"
        dialogRef={dialog}
        className={styles.dialog}
        aria-label="Review promotion"
        onCancel={(event) => {
          if (busy) event.preventDefault();
          else close();
        }}
      >
        {item && (
          <>
            <h3 id="promotion-review-heading">
              {item.status === 'ambiguous'
                ? 'Reconcile original request?'
                : 'Send prepared request?'}
            </h3>
            <p>{item.name}</p>
            <p>
              {item.status === 'ambiguous'
                ? 'Look up the original request key. This does not create a second person.'
                : 'The configured adapter must acknowledge the exact identity before this member is linked. Historical training stays excluded.'}
            </p>
            <p>No primary-platform adapter is configured.</p>
            <Feedback error={actionError} />
            <form onSubmit={submit} aria-busy={busy}>
              <label htmlFor={reviewReasonId}>Review reason</label>
              <Textarea
                id={reviewReasonId}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                required
                minLength={8}
                maxLength={2000}
              />
              <div className={styles.actions}>
                <Button type="button" variant="secondary" disabled={busy} onClick={close} autoFocus>
                  Cancel request review
                </Button>
                <Button type="submit" variant="danger" disabled={busy}>
                  {busy
                    ? 'Queueing request…'
                    : item.status === 'ambiguous'
                      ? 'Reconcile original key'
                      : 'Send prepared request'}
                </Button>
              </div>
            </form>
          </>
        )}
      </Dialog>
    </Panel>
  );
}
