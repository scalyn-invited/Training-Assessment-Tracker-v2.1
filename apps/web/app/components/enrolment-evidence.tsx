'use client';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { api } from './auth-ui';
import { Button, Panel, Badge, Input, Select, Feedback } from './ui/controls';
import layout from './ui/form-layout.module.css';
import styles from './ui/training-record.module.css';
type File = { id: string; name: string; bytes: number; status: string; purpose: string };
export function EnrolmentEvidence({
  id,
  client,
  csrf,
  canUpload,
  canManage,
}: {
  id: string;
  client: string;
  csrf: string;
  canUpload: boolean;
  canManage: boolean;
}) {
  const [files, setFiles] = useState<File[] | null>(null),
    [error, setError] = useState(''),
    [message, setMessage] = useState(''),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(false);
  const current = useRef(0);
  async function refresh() {
    const request = ++current.current;
    setLoading(true);
    setError('');
    try {
      const result = await api<{ files: File[] }>(`/enrolments/${id}/files?clientId=${client}`);
      if (request === current.current) setFiles(result.files);
    } catch (e) {
      if (request === current.current) {
        setFiles(null);
        setError((e as Error).message);
      }
    } finally {
      if (request === current.current) setLoading(false);
    }
  }
  useEffect(() => {
    void refresh();
    return () => {
      current.current++;
    };
  }, [id, client]);
  async function upload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const form = event.currentTarget,
      body = new FormData(form);
    body.set('csrf', csrf);
    body.set('clientId', client);
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const response = await fetch(`/api/enrolments/${id}/files`, {
          method: 'POST',
          body,
          signal: AbortSignal.timeout(30000),
        }),
        result = await response.json();
      if (!response.ok) throw new Error(result.message || 'The evidence could not be uploaded.');
      form.reset();
      setMessage(
        'Upload stored privately in quarantine. Downloads and extraction remain blocked until scanning succeeds.',
      );
      await refresh();
    } catch (e) {
      setError((e as Error).message + ' Refresh the evidence list before uploading again.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <Panel className={layout.panel} aria-label="Private evidence">
      <h2>Private evidence</h2>
      <p>
        Downloads require current enrolment access. Sensitive assessments require an additional
        permission.
      </p>
      <Feedback error={error} success={message} />
      {!files && loading && <p role="status">Loading private evidence...</p>}
      {files && (
        <ul className={styles.files}>
          {!files.length && <li>No evidence visible in your scope.</li>}
          {files.map((file) => (
            <li key={file.id}>
              <div>
                <strong>{file.name}</strong>
                <small>
                  {(file.bytes / 1024).toFixed(1)} KB / {file.status}
                </small>
              </div>
              {file.status === 'clean' ? (
                <a href={'/api/files/' + file.id}>Download {file.name}</a>
              ) : (
                <Badge>{file.status === 'rejected' ? 'Rejected' : 'Quarantined'}</Badge>
              )}
              {file.purpose === 'assessment' && canManage && (
                <Link href={`/enrolments/${id}/documents/${file.id}`}>
                  Extract and review {file.name}
                </Link>
              )}
            </li>
          ))}
        </ul>
      )}
      <Button disabled={busy || loading} onClick={() => void refresh()}>
        {loading ? 'Refreshing evidence...' : 'Refresh evidence'}
      </Button>
      {canUpload && (
        <form onSubmit={upload} aria-busy={busy}>
          <h3>Upload for quarantine</h3>
          <p>
            PDF, PNG, JPEG, TXT or inspected DOCX, up to 20 MiB. Files stay blocked until a
            configured scanner approves them.
          </p>
          <label>
            File purpose
            <Select name="purpose" aria-label="File purpose" disabled={busy}>
              <option value="assessment">Sensitive assessment for coordinator review</option>
              <option value="evidence">My submitted work or supporting evidence</option>
            </Select>
          </label>
          <label>
            Evidence file
            <Input
              className={styles.upload}
              name="evidence"
              type="file"
              accept=".pdf,.png,.jpg,.jpeg,.txt,.docx"
              required
              disabled={busy}
            />
          </label>
          <Button type="submit" disabled={busy}>
            {busy ? 'Storing evidence...' : 'Store privately'}
          </Button>
        </form>
      )}
    </Panel>
  );
}
