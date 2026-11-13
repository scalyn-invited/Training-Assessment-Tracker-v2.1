'use client';
import { useEffect, useState, type FormEvent } from 'react';
import { api, Feedback } from './auth-ui';
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
    const form = event.currentTarget,
      body = new FormData(form);
    body.set('csrf', csrf);
    body.set('clientId', client);
    body.set('purpose', 'evidence');
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
      setMessage('File uploaded. It must pass scanning before you can attach it.');
      await refresh();
    } catch (e) {
      setError((e as Error).message + ' Refresh the list before uploading again.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="panel">
      <h2>Supporting evidence</h2>
      <p>
        Attach up to five clean files. PDF, DOCX, TXT, PNG or JPEG; up to 20 MiB each. Files
        awaiting scanning cannot be attached.
      </p>
      <Feedback error={error} success={message} />
      {!files && !error && <p role="status">Loading evidence...</p>}
      {files?.length === 0 && <p>No supporting files uploaded yet.</p>}
      {files?.map((file) => (
        <div key={file.id}>
          <label>
            <input
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
      <button type="button" className="secondary" onClick={() => void refresh()}>
        Refresh evidence
      </button>
      <form onSubmit={upload}>
        <label>
          Upload supporting evidence
          <input
            name="evidence"
            type="file"
            accept=".pdf,.docx,.txt,.png,.jpg,.jpeg"
            required
            disabled={busy || disabled}
          />
        </label>
        <button className="secondary" disabled={busy || disabled} aria-busy={busy}>
          {busy ? 'Uploading evidence...' : 'Upload evidence'}
        </button>
      </form>
    </section>
  );
}
