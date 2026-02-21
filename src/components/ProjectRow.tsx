import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { DragIcon, CloseIcon } from './icons';
import type { Project } from '../types';

interface ProjectRowProps {
  project: Project;
  onUpdate: (id: string, updates: Partial<Project>) => void;
  onRemove: (id: string) => void;
  errors?: string[];
}

export function ProjectRow({ project, onUpdate, onRemove, errors = [] }: ProjectRowProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: project.id,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const hasError = errors.length > 0;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`project-row card bg-[rgba(7,10,20,0.65)] rounded-xl p-2.5 shadow-card backdrop-blur-sm grid grid-cols-[1fr_auto] gap-2 items-start ${
        hasError ? 'border border-danger' : ''
      }`}
    >
      <div className="project-main grid grid-cols-[1fr_1.4fr_2fr] gap-2 w-full">
        <div className="project-field">
          <label className="block text-xs text-muted mb-1">Project name</label>
          <input
            type="text"
            value={project.name}
            onChange={(e) => onUpdate(project.id, { name: e.target.value })}
            placeholder="Project name"
            className="w-full px-2.5 py-2 rounded-lg bg-white/[0.02] border border-white/5 text-text text-sm placeholder:text-white/35 outline-none focus:shadow-input-focus focus:-translate-y-px transition-all"
          />
        </div>
        <div className="project-field">
          <label className="block text-xs text-muted mb-1">URL (optional)</label>
          <input
            type="text"
            value={project.url}
            onChange={(e) => onUpdate(project.id, { url: e.target.value })}
            placeholder="https://example.com"
            className="w-full px-2.5 py-2 rounded-lg bg-white/[0.02] border border-white/5 text-text text-sm placeholder:text-white/35 outline-none focus:shadow-input-focus focus:-translate-y-px transition-all"
          />
        </div>
        <div className="project-field">
          <label className="block text-xs text-muted mb-1">Description</label>
          <input
            type="text"
            value={project.description}
            onChange={(e) => onUpdate(project.id, { description: e.target.value })}
            placeholder="Short description (optional)"
            className="w-full px-2.5 py-2 rounded-lg bg-white/[0.02] border border-white/5 text-text text-sm placeholder:text-white/35 outline-none focus:shadow-input-focus focus:-translate-y-px transition-all"
          />
        </div>
      </div>

      <div className="project-actions flex flex-col gap-1.5 items-center">
        <button
          className="btn-tertiary p-1.5 min-w-[36px] h-[34px] bg-transparent text-muted hover:text-accent-3 cursor-grab transition-colors border-none"
          title="Drag to reorder"
          aria-label="Drag to reorder"
          {...attributes}
          {...listeners}
        >
          <DragIcon size={18} />
        </button>
        <button
          className="btn-tertiary p-1.5 min-w-[36px] h-[34px] bg-transparent text-muted hover:text-danger cursor-pointer transition-colors border-none"
          title="Remove"
          aria-label="Remove project"
          onClick={() => onRemove(project.id)}
        >
          <CloseIcon size={18} />
        </button>
      </div>

      {hasError && (
        <div className="col-span-full text-danger text-xs mt-2" aria-live="polite">
          {errors.join(' ')}
        </div>
      )}
    </div>
  );
}
