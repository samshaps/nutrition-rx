import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import './AppBar.css';

export interface AppBarProps {
  /** Right-aligned actions (buttons, links). Rendered after the storage note. */
  actions?: ReactNode;
}

/**
 * Shared top bar: wordmark + "all data stays in this browser" note + optional actions.
 * Matches the `.nrx-topbar` block in mocks/mock-roster.html.
 */
export function AppBar({ actions }: AppBarProps) {
  return (
    <header className="nrx-topbar">
      <div className="nrx-topbar-inner">
        <Link to="/" className="nrx-wordmark">
          <span className="nrx-mark" aria-hidden="true">
            <svg
              width="14"
              height="14"
              viewBox="0 0 14 14"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M3 12V2h3.2a2.4 2.4 0 0 1 0 4.8H3" />
              <path d="M6 6.8 10 12" />
              <path d="M10.2 7 13 9.9" />
              <path d="M13 7l-2.8 2.9" />
            </svg>
          </span>
          Nutrition Rx
        </Link>

        <span className="nrx-storage-note">
          <svg
            width="12"
            height="12"
            viewBox="0 0 12 12"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.3"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <rect x="2" y="5.2" width="8" height="5.3" rx="1" />
            <path d="M4 5.2V3.6a2 2 0 0 1 4 0v1.6" />
          </svg>
          All data stays in this browser
        </span>

        {actions ? <div className="nrx-topbar-actions">{actions}</div> : null}
      </div>
    </header>
  );
}

export default AppBar;
