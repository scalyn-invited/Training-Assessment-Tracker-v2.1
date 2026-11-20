'use client';
import { useEffect, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { api } from './auth-ui';
import { Button, Input, Feedback } from './ui/controls';
import styles from './ui/onboarding.module.css';
import recordStyles from './ui/training-record.module.css';
type Row = { id: string; name: string; status: string; purpose: string };
export function OnboardingFiles({
  id,
  client,
  csrf,
  editable,
}: {
  id: string;
  client: string;
  csrf: string;
  editable: boolean;
}) {
  const [files, setFiles] = useState<Row[] | null>(null),
    [error, setError] = useState(''),
    [message, setMessage] = useState(''),
    [busy, setBusy] = useState(false);
  async function refresh() {
    setError('');
    try {
      const data = await api<{ files: Row[] }>(`/enrolments/${id}/files?clientId=${client}`);
      setFiles(data.files.filter((f) => f.purpose === 'assessment'));
    } catch (e) {
      setError((e as Error).message);
    }
  }
  useEffect(() => {
    void refresh();
  }, [id, client]);
  async function upload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const form = event.currentTarget,
      body = new FormData(form);
    body.set('csrf', csrf);
    body.set('clientId', client);
    body.set('purpose', 'assessment');
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
      if (!response.ok) throw new Error(result.message || 'The assessment upload failed.');
      form.reset();
      setMessage('Assessment uploaded to quarantine. Scanning must succeed before extraction.');
      await refresh();
    } catch (e) {
      setError((e as Error).message + ' Refresh the list before uploading again.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className={styles.files} aria-label="Private assessment documents">
      <h2>Private assessment documents</h2>
      <p>
        Upload a PDF, DOCX, TXT, PNG or JPEG up to 20 MiB. Extraction produces an unconfirmed draft;
        review it against the original.
      </p>
      <Feedback error={error} success={message} />
      {!files && !error && <p role="status">Loading private assessments…</p>}
      {files?.length === 0 && (
        <p>No assessment documents uploaded. You can also enter findings manually above.</p>
      )}
      {files?.map((file) => (
        <p key={file.id}>
          <Link href={`/enrolments/${id}/documents/${file.id}`}>Review {file.name}</Link> · Scan:{' '}
          {file.status}
        </p>
      ))}
      <Button type="button" disabled={busy} onClick={() => void refresh()}>
        Refresh assessment files
      </Button>
      {editable && (
        <form onSubmit={upload}>
          <label>
            Upload private assessment
            <Input
              className={recordStyles.upload}
              name="evidence"
              type="file"
              required
              accept=".pdf,.docx,.txt,.png,.jpg,.jpeg"
              disabled={busy}
            />
          </label>
          <Button type="submit" disabled={busy} aria-busy={busy}>
            {busy ? 'Uploading assessment…' : 'Upload assessment'}
          </Button>
        </form>
      )}
    </section>
  );
}
