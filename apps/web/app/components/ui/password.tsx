'use client';
import { useState } from 'react';
import { Button, Input } from './controls';
import styles from './form-layout.module.css';

// Same password fields and show/hide workflow as the legacy Password helper.
export function PasswordField({
  name,
  label,
  creation = false,
}: {
  name: string;
  label: string;
  creation?: boolean;
}) {
  const [visible, setVisible] = useState(false);
  return (
    <div className={styles.password}>
      <label htmlFor={name}>{label}</label>
      <Input
        id={name}
        name={name}
        type={visible ? 'text' : 'password'}
        required
        minLength={creation ? 15 : undefined}
        maxLength={72}
        autoComplete={creation ? 'new-password' : 'current-password'}
        aria-describedby={creation ? name + '-help' : undefined}
      />
      <Button aria-pressed={visible} onClick={() => setVisible(!visible)}>
        {visible ? 'Hide' : 'Show'} {label.toLowerCase()}
      </Button>
      {creation && (
        <p id={name + '-help'} className={styles.help}>
          Use at least 15 characters and no more than 72 UTF-8 bytes.
        </p>
      )}
    </div>
  );
}
