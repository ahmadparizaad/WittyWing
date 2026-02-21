import { useEffect } from 'react';
import { useProfileStore } from '../store';
import type { Page } from '../types';

interface ProfileViewProps {
  onNavigate: (page: Page) => void;
  onStatusMessage: (message: string, type: 'success' | 'error' | 'info') => void;
}

export function ProfileView({ onNavigate, onStatusMessage }: ProfileViewProps) {
  const { profile, isLoading, loadProfile } = useProfileStore();

  useEffect(() => {
    loadProfile();
  }, [loadProfile]);

  const handleReload = async () => {
    await loadProfile();
    onStatusMessage('Profile reloaded.', 'success');
  };

  const handleEdit = () => {
    onNavigate('profile-edit');
  };

  const renderProjects = () => {
    if (!profile?.projects || profile.projects.length === 0) {
      return <span>—</span>;
    }

    return profile.projects.map((project, index) => (
      <div key={project.id || index}>
        {project.url ? (
          <>
            <a
              href={project.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-muted underline hover:text-accent-3 transition-colors"
            >
              {project.name || project.url}
            </a>
            {project.description && <span> — {project.description}</span>}
          </>
        ) : (
          <span>
            {project.name}
            {project.description && ` — ${project.description}`}
          </span>
        )}
      </div>
    ));
  };

  if (isLoading) {
    return (
      <section className="popup-page">
        <div className="text-muted text-sm">Loading profile...</div>
      </section>
    );
  }

  return (
    <section className="popup-page">
      <h3 className="my-2 text-sm font-semibold">Profile</h3>

      <div className="my-2">
        <div className="font-bold text-[13px]">Name</div>
        <div className="text-muted text-[13px]">{profile?.displayName || '—'}</div>
      </div>

      <div className="my-2">
        <div className="font-bold text-[13px]">Role</div>
        <div className="text-muted text-[13px]">{profile?.role || '—'}</div>
      </div>

      <div className="my-2">
        <div className="font-bold text-[13px]">Bio</div>
        <div className="text-muted text-[13px]">{profile?.short_bio || '—'}</div>
      </div>

      <div className="my-2">
        <div className="font-bold text-[13px]">Projects</div>
        <div className="text-muted text-[13px]">{renderProjects()}</div>
      </div>

      <div className="flex gap-2 mt-2">
        <button
          onClick={handleEdit}
          className="flex-1 btn-primary bg-gradient-primary px-3 py-2 rounded-[10px] text-white font-semibold text-[13px] border-none cursor-pointer shadow-btn-primary hover:shadow-btn-primary-hover hover:-translate-y-0.5 transition-all"
        >
          Edit Profile
        </button>
        <button
          onClick={handleReload}
          className="flex-1 btn-secondary bg-white/[0.03] border border-white/[0.04] text-text px-3 py-2 rounded-[10px] font-semibold text-[13px] cursor-pointer shadow-btn hover:bg-white/[0.06] hover:-translate-y-0.5 transition-all"
        >
          Reload
        </button>
      </div>
    </section>
  );
}
