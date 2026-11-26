'use client';
import { useState, type ReactNode } from 'react';
import { Button, Input } from './controls';
import styles from './form-layout.module.css';
import passwordStyles from './password.module.css';

// Same password fields and show/hide workflow as the legacy Password helper.
export function PasswordField({
  name,
  label,
  creation = false,
  icon,
  inputClassName,
  className,
  iconToggle = false,
}: {
  name: string;
  label: string;
  creation?: boolean;
  icon?: ReactNode;
  inputClassName?: string;
  className?: string;
  iconToggle?: boolean;
}) {
  const [visible, setVisible] = useState(false);
  const field = (
    <Input
      id={name}
      name={name}
      type={visible ? 'text' : 'password'}
      required
      minLength={creation ? 15 : undefined}
      maxLength={72}
      autoComplete={creation ? 'new-password' : 'current-password'}
      aria-describedby={creation ? name + '-help' : undefined}
      style={iconToggle ? { paddingRight: 52 } : undefined}
    />
  );
  return (
    <div className={`${styles.password} ${className ?? ''}`}>
      <label htmlFor={name}>{label}</label>
      {inputClassName || iconToggle ? (
        <div className={`${inputClassName ?? ''} ${iconToggle ? passwordStyles.wrapper : ''}`}>
          {icon}
          {field}
          {iconToggle && (
            <button
              type="button"
              className={passwordStyles.toggle}
              aria-label={`${visible ? 'Hide' : 'Show'} ${label.toLowerCase()}`}
              aria-controls={name}
              onClick={() => setVisible(!visible)}
            >
              <span
                aria-hidden="true"
                className={visible ? passwordStyles.hidden : passwordStyles.visible}
              />
            </button>
          )}
        </div>
      ) : (
        field
      )}
      {!iconToggle && (
        <Button aria-pressed={visible} onClick={() => setVisible(!visible)}>
          {visible ? 'Hide' : 'Show'} {label.toLowerCase()}
        </Button>
      )}
      {creation && (
        <p id={name + '-help'} className={styles.help}>
          Use at least 15 characters and no more than 72 UTF-8 bytes.
        </p>
      )}
    </div>
  );
}
