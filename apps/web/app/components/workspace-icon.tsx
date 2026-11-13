import type { ReactNode } from 'react';
function shape(name: string): ReactNode {
  switch (name) {
    case 'building':
      return (
        <>
          <rect x="5" y="3" width="14" height="18" rx="2" />
          <path d="M9 7h1m4 0h1M9 11h1m4 0h1M10 21v-6h4v6" />
        </>
      );
    case 'shield':
      return (
        <>
          <path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6l8-3Z" />
          <path d="m8 12 3 3 5-6" />
        </>
      );
    case 'palette':
      return (
        <>
          <path d="M12 3a9 9 0 1 0 0 18h1a2 2 0 0 0 1.4-3.4 1.5 1.5 0 0 1 1.1-2.6H18a3 3 0 0 0 3-3 9 9 0 0 0-9-9Z" />
          <circle cx="7.5" cy="10" r=".75" />
          <circle cx="10" cy="6.5" r=".75" />
          <circle cx="14.5" cy="7" r=".75" />
          <circle cx="17.5" cy="10.5" r=".75" />
        </>
      );
    case 'clipboard':
      return (
        <>
          <rect x="5" y="5" width="14" height="16" rx="2" />
          <rect x="9" y="3" width="6" height="4" rx="1" />
          <path d="M9 12h6M9 16h6" />
        </>
      );
    case 'home':
      return (
        <>
          <path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1Z" />
        </>
      );
    case 'book':
      return (
        <>
          <path d="M12 5v16M3 4h5a4 4 0 0 1 4 2 4 4 0 0 1 4-2h5v15h-5a4 4 0 0 0-4 2 4 4 0 0 0-4-2H3Z" />
        </>
      );
    case 'check':
      return (
        <>
          <path d="m8 12 3 3 5-6" />
          <rect x="4" y="3" width="16" height="18" rx="3" />
        </>
      );
    case 'users':
      return (
        <>
          <circle cx="9" cy="8" r="3" />
          <path d="M3 21v-3a6 6 0 0 1 12 0v3M16 5a3 3 0 0 1 0 6M18 15a5 5 0 0 1 3 5" />
        </>
      );
    case 'bell':
      return (
        <>
          <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4" />
        </>
      );
    case 'settings':
      return (
        <>
          <path d="m12 3 2 3 4-1 1 4 3 3-3 2-1 4-4-1-2 4-2-4-4 1-1-4-3-2 3-3 1-4 4 1Z" />
          <circle cx="12" cy="12" r="3" />
        </>
      );
    case 'spark':
      return (
        <>
          <path d="m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5ZM20 2v4M18 4h4" />
        </>
      );
    case 'arrow':
      return (
        <>
          <path d="M5 12h14m-5-5 5 5-5 5" />
        </>
      );
    case 'external':
      return (
        <>
          <path d="M14 3h7v7m0-7L10 14M10 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-5" />
        </>
      );
    case 'logout':
      return (
        <>
          <path d="M10 4H4v16h6M9 12h12m-4-4 4 4-4 4" />
        </>
      );
    case 'moon':
      return (
        <>
          <path d="M20.5 13a8.5 8.5 0 0 1-9.5-9.5A8.5 8.5 0 1 0 20.5 13Z" />
        </>
      );
    case 'menu':
      return (
        <>
          <path d="M4 6h16M4 12h16M4 18h16" />
        </>
      );
    case 'close':
      return (
        <>
          <path d="m6 6 12 12M6 18 18 6" />
        </>
      );
    case 'chart':
      return (
        <>
          <path d="M4 3v18h17M8 16v-5M13 16V7M18 16v-8" />
        </>
      );
    default:
      return (
        <>
          <rect x="3" y="3" width="7" height="7" rx="1.5" />
          <rect x="14" y="3" width="7" height="7" rx="1.5" />
          <rect x="3" y="14" width="7" height="7" rx="1.5" />
          <rect x="14" y="14" width="7" height="7" rx="1.5" />
        </>
      );
  }
}
export function Icon({ name }: { name: string }) {
  return (
    <svg
      className="icon"
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.65"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {shape(name)}
    </svg>
  );
}
