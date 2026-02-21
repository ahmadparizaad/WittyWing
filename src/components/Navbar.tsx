import { LockIcon, UserIcon, HelpIcon } from './icons';
import type { Page } from '../types';

interface NavbarProps {
  currentPage: Page;
  onNavigate: (page: Page) => void;
  onHelp: () => void;
}

export function Navbar({ currentPage, onNavigate, onHelp }: NavbarProps) {
  const isActive = (page: Page | Page[]) => {
    if (Array.isArray(page)) {
      return page.includes(currentPage);
    }
    return currentPage === page;
  };

  return (
    <nav className="flex justify-between items-center mb-2.5 gap-1.5">
      <div className="flex items-center gap-1.5">
        <button
          onClick={() => onNavigate('auth')}
          className={`nav-button flex items-center gap-2 px-2 py-1.5 text-[13px] bg-transparent border-none cursor-pointer transition-colors ${
            isActive('auth')
              ? 'bg-accent-3/15 rounded-md font-bold text-accent-3'
              : 'text-muted hover:text-text'
          }`}
        >
          <LockIcon className={isActive('auth') ? 'text-accent-3' : 'text-muted'} />
          <span>Auth</span>
        </button>
        <button
          onClick={() => onNavigate('profile-view')}
          className={`nav-button flex items-center gap-2 px-2 py-1.5 text-[13px] bg-transparent border-none cursor-pointer transition-colors ${
            isActive(['profile-view', 'profile-edit'])
              ? 'bg-accent-3/15 rounded-md font-bold text-accent-3'
              : 'text-muted hover:text-text'
          }`}
        >
          <UserIcon
            className={isActive(['profile-view', 'profile-edit']) ? 'text-accent-3' : 'text-muted'}
          />
          <span>Profile</span>
        </button>
      </div>
      <div>
        <button
          onClick={onHelp}
          className="nav-button flex items-center gap-2 px-2 py-1.5 text-[13px] bg-transparent border-none cursor-pointer text-muted hover:text-text transition-colors"
        >
          <HelpIcon className="text-muted" />
          <span>Help</span>
        </button>
      </div>
    </nav>
  );
}
