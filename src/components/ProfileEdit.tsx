import { useState, useEffect, useCallback } from 'react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { useProfileStore } from '../store';
import { ProjectRow } from './ProjectRow';
import type { Page, Project } from '../types';

interface ProfileEditProps {
  onNavigate: (page: Page) => void;
  onStatusMessage: (message: string, type: 'success' | 'error' | 'info') => void;
}

// Validation helpers
function isValidUrl(url: string): boolean {
  if (!url) return true; // allow empty
  try {
    const u = new URL(url);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

function validateProject(project: Project): string[] {
  const errors: string[] = [];
  if (!project.name.trim() && (project.url.trim() || project.description.trim())) {
    errors.push('Project name is required.');
  }
  if (project.url && !isValidUrl(project.url)) {
    errors.push('Project URL is not valid (must be http(s)).');
  }
  if (project.description.length > 280) {
    errors.push('Description must be 280 characters or less.');
  }
  return errors;
}

export function ProfileEdit({ onNavigate, onStatusMessage }: ProfileEditProps) {
  const {
    profile,
    isLoading,
    isSaving,
    loadProfile,
    saveProfile,
    updateField,
    addProject,
    updateProject,
    removeProject,
    reorderProjects,
    clearProjects,
  } = useProfileStore();

  const [projectErrors, setProjectErrors] = useState<Record<string, string[]>>({});
  const [localDisplayName, setLocalDisplayName] = useState('');
  const [localRole, setLocalRole] = useState('');
  const [localBio, setLocalBio] = useState('');

  // Sync local state with profile
  useEffect(() => {
    if (profile) {
      setLocalDisplayName(profile.displayName);
      setLocalRole(profile.role);
      setLocalBio(profile.short_bio);
    }
  }, [profile]);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id && profile?.projects) {
      const oldIndex = profile.projects.findIndex((p) => p.id === active.id);
      const newIndex = profile.projects.findIndex((p) => p.id === over.id);
      const newProjects = arrayMove(profile.projects, oldIndex, newIndex);
      reorderProjects(newProjects);
    }
  };

  const validateAllProjects = useCallback(() => {
    if (!profile?.projects) return true;
    const errors: Record<string, string[]> = {};
    let hasErrors = false;

    profile.projects.forEach((project) => {
      const projectErrs = validateProject(project);
      if (projectErrs.length > 0) {
        errors[project.id] = projectErrs;
        hasErrors = true;
      }
    });

    setProjectErrors(errors);
    return !hasErrors;
  }, [profile?.projects]);

  const handleSave = async () => {
    // Update store with local state first
    updateField('displayName', localDisplayName.trim());
    updateField('role', localRole.trim());
    updateField('short_bio', localBio.trim());

    if (!validateAllProjects()) {
      onStatusMessage('Please fix project validation errors before saving.', 'error');
      return;
    }

    const success = await saveProfile({
      displayName: localDisplayName.trim(),
      role: localRole.trim(),
      short_bio: localBio.trim(),
      projects: profile?.projects || [],
    });

    if (success) {
      onStatusMessage('Profile saved.', 'success');
      onNavigate('profile-view');
    } else {
      onStatusMessage('Failed to save profile.', 'error');
    }
  };

  const handleLoad = async () => {
    await loadProfile();
    onStatusMessage('Profile loaded.', 'success');
  };

  const handleBack = () => {
    onNavigate('profile-view');
  };

  const handleAddProject = () => {
    addProject();
  };

  const handleClearProjects = () => {
    clearProjects();
    setProjectErrors({});
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
      <div className="flex justify-start gap-2 mb-2">
        <button
          onClick={handleBack}
          className="btn-secondary bg-white/[0.03] border border-white/[0.04] text-text px-2.5 py-1.5 rounded text-sm cursor-pointer hover:bg-white/[0.06] transition-colors"
        >
          Back
        </button>
      </div>

      <h3 className="my-2 text-sm font-semibold">Edit Profile</h3>

      <label className="block mb-1.5 font-semibold text-muted text-xs">Display name:</label>
      <input
        type="text"
        value={localDisplayName}
        onChange={(e) => setLocalDisplayName(e.target.value)}
        placeholder="Full name or handle"
        className="w-[calc(100%-18px)] px-3 py-2.5 mb-3 border border-white/5 rounded-lg bg-white/[0.02] text-text outline-none focus:shadow-input-focus focus:-translate-y-px transition-all"
      />

      <label className="block mb-1.5 font-semibold text-muted text-xs">Role:</label>
      <input
        type="text"
        value={localRole}
        onChange={(e) => setLocalRole(e.target.value)}
        placeholder="e.g., Developer, Designer"
        className="w-[calc(100%-18px)] px-3 py-2.5 mb-3 border border-white/5 rounded-lg bg-white/[0.02] text-text outline-none focus:shadow-input-focus focus:-translate-y-px transition-all"
      />

      <label className="block mb-1.5 font-semibold text-muted text-xs">Short bio:</label>
      <textarea
        value={localBio}
        onChange={(e) => setLocalBio(e.target.value)}
        placeholder="1–2 sentence personal bio"
        rows={3}
        className="w-full px-2 py-2 mb-3 rounded border border-white/5 bg-white/[0.02] text-text box-border outline-none focus:shadow-input-focus transition-all"
      />

      <label className="block mb-1.5 font-semibold text-muted text-xs">Projects:</label>
      <div className="flex flex-col gap-2 mb-1.5">
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext
            items={profile?.projects?.map((p) => p.id) || []}
            strategy={verticalListSortingStrategy}
          >
            {profile?.projects?.map((project) => (
              <ProjectRow
                key={project.id}
                project={project}
                onUpdate={updateProject}
                onRemove={removeProject}
                errors={projectErrors[project.id]}
              />
            ))}
          </SortableContext>
        </DndContext>
      </div>

      <div className="flex gap-2 mb-1.5">
        <button
          onClick={handleAddProject}
          className="flex-1 btn-secondary bg-white/[0.03] border border-white/[0.04] text-text px-3 py-2 rounded-[10px] font-semibold text-[13px] cursor-pointer shadow-btn hover:bg-white/[0.06] hover:-translate-y-0.5 transition-all"
        >
          Add project
        </button>
        <button
          onClick={handleClearProjects}
          className="flex-1 btn-tertiary bg-transparent text-muted px-3 py-2 rounded-[10px] font-semibold text-[13px] cursor-pointer border-none hover:text-text transition-colors"
        >
          Clear all
        </button>
      </div>

      <div className="flex gap-2 mt-2.5">
        <button
          onClick={handleLoad}
          disabled={isLoading}
          className="flex-1 btn-secondary bg-white/[0.03] border border-white/[0.04] text-text px-3 py-2 rounded-[10px] font-semibold text-[13px] cursor-pointer shadow-btn hover:bg-white/[0.06] hover:-translate-y-0.5 transition-all disabled:bg-gray-400 disabled:cursor-not-allowed"
        >
          Load Profile
        </button>
        <button
          onClick={handleSave}
          disabled={isSaving}
          className="flex-1 btn-primary bg-gradient-primary px-3 py-2 rounded-[10px] text-white font-semibold text-[13px] border-none cursor-pointer shadow-btn-primary hover:shadow-btn-primary-hover hover:-translate-y-0.5 transition-all disabled:bg-gray-400 disabled:cursor-not-allowed"
        >
          {isSaving ? 'Saving...' : 'Save Profile'}
        </button>
      </div>
    </section>
  );
}
