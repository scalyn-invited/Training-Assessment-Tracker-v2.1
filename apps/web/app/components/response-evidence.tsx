'use client';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { api } from './auth-ui';
import { Button, Input, Panel, Feedback } from './ui/controls';
import { registerWorkGuard } from './work-guard';
import layout from './ui/form-layout.module.css';
import styles from './ui/learning-lesson.module.css';
import recordStyles from './ui/training-record.module.css';
type FileRow = { id: string; name: string; status: string; bytes: number };
export function ResponseEvidence({
  enrolment,
  client,
  csrf,
  selected,
  onChange,
  disabled,
}: {
  enrolment: string;
  client: string;
  csrf: string;
  selected: string[];
  onChange: (ids: string[]) => void;
  disabled: boolean;
}) {
  const [files, setFiles] = useState<FileRow[] | null>(null),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState('');
  const [chosen, setChosen] = useState(false);
  const pending = useRef(false);
  useEffect(() => {
    return registerWorkGuard(() => ({ dirty: chosen, pending: pending.current }));
  }, [chosen]);
  async function refresh() {
    setError('');
    try {
      const data = await api<{ files: FileRow[] }>(
        '/enrolments/' + enrolment + '/files?clientId=' + client,
      );
      setFiles(data.files);
    } catch (e) {
      setError((e as Error).message);
    }
  }
  useEffect(() => {
    void refresh();
  }, [enrolment, client]);
  async function upload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending.current) return;
    const form = event.currentTarget,
      body = new FormData(form);
    body.set('csrf', csrf);
    body.set('clientId', client);
    body.set('purpose', 'evidence');
    pending.current = true;
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const res = await fetch('/api/enrolments/' + enrolment + '/files', {
          method: 'POST',
          body,
          signal: AbortSignal.timeout(30000),
        }),
        data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Upload failed.');
      form.reset();
      setChosen(false);
      setMessage('File uploaded. It must pass scanning before you can attach it.');
      await refresh();
    } catch (e) {
      setError((e as Error).message + ' Refresh the list before uploading again.');
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }
  return (
    <Panel className={`${layout.panel} ${styles.panel}`}>
      <h2>Supporting evidence</h2>
      <p>
        Attach up to five clean files. PDF, DOCX, TXT, PNG or JPEG; up to 20 MiB each. Files
        awaiting scanning cannot be attached.
      </p>
      <Feedback error={error} success={message} />
      {!files && !error && <p role="status">Loading evidence...</p>}
      {files?.length === 0 && <p>No supporting files uploaded yet.</p>}
      {files?.map((file) => (
        <div key={file.id} className={styles.file}>
          <label className={styles.choice}>
            <Input
              type="checkbox"
              checked={selected.includes(file.id)}
              disabled={
                disabled ||
                (file.status !== 'clean' && !selected.includes(file.id)) ||
                (!selected.includes(file.id) && selected.length >= 5)
              }
              onChange={(e) =>
                onChange(
                  e.target.checked
                    ? [...selected, file.id]
                    : selected.filter((id) => id !== file.id),
                )
              }
            />
            {file.name} - {file.status}
          </label>
          {file.status === 'clean' && <a href={'/api/files/' + file.id}>Download {file.name}</a>}
        </div>
      ))}
      <Button type="button" onClick={() => void refresh()}>
        Refresh evidence
      </Button>
      <form onSubmit={upload}>
        <label>
          Upload supporting evidence
          <input
            name="evidence"
            type="file"
            accept=".pdf,.docx,.txt,.png,.jpg,.jpeg"
            required
            disabled={busy || disabled}
            className={recordStyles.upload}
            onChange={(e) => setChosen(!!e.target.files?.length)}
          />
        </label>
        <Button type="submit" disabled={busy || disabled} aria-busy={busy}>
          {busy ? 'Uploading evidence...' : 'Upload evidence'}
        </Button>
      </form>
    </Panel>
  );
}
