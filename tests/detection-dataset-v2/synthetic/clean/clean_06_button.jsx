import React from 'react';

export function Button({ variant = 'primary', disabled, children, onClick }) {
  const cls = ['btn', `btn--${variant}`, disabled ? 'is-disabled' : ''].join(' ');
  return (
    <button type="button" className={cls.trim()} disabled={disabled} onClick={onClick}>
      {children}
    </button>
  );
}
