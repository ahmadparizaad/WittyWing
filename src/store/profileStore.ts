import { create } from 'zustand';
import axios from 'axios';
import { SERVER_URL as API_URL } from '../config';
import type { Profile, Project, ProfileState } from '../types';

// Helper to get auth headers
async function getAuthHeaders(): Promise<Record<string, string>> {
  const result = await chrome.storage.local.get(['serverJwt']) as { serverJwt?: string };
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (result.serverJwt) {
    headers['Authorization'] = `Bearer ${result.serverJwt}`;
  }
  return headers;
}

// Generate unique ID for projects
export function generateProjectId(): string {
  return `pr_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
}

// Create empty project
export function createEmptyProject(): Project {
  return {
    id: generateProjectId(),
    name: '',
    url: '',
    description: '',
  };
}

interface ProfileStore extends ProfileState {
  loadProfile: () => Promise<void>;
  saveProfile: (updates: Partial<Profile>) => Promise<boolean>;
  setProfile: (profile: Profile) => void;
  updateField: <K extends keyof Profile>(field: K, value: Profile[K]) => void;
  addProject: () => void;
  updateProject: (id: string, updates: Partial<Project>) => void;
  removeProject: (id: string) => void;
  reorderProjects: (projects: Project[]) => void;
  clearProjects: () => void;
  clearError: () => void;
}

export const useProfileStore = create<ProfileStore>((set, get) => ({
  profile: null,
  isLoading: false,
  isSaving: false,
  error: null,

  loadProfile: async () => {
    set({ isLoading: true, error: null });
    try {
      const headers = await getAuthHeaders();
      const response = await axios.get(`${API_URL}/api/profile`, {
        headers,
        withCredentials: true,
      });
      
      const profileData = response.data.profile;
      if (!profileData) throw new Error('No profile data received');

      // Ensure projects have IDs
      const projects = (profileData.projects || []).map((p: Omit<Project, 'id'> & { id?: string }) => ({
        ...p,
        id: p.id || generateProjectId(),
      }));

      // Be explicit about boolean coercion
      const autoGenerate = !!profileData.autoGenerate;
      
      // Save to local storage for content script
      await chrome.storage.local.set({ autoGenerate });

      set({
        profile: {
          displayName: profileData.displayName || '',
          role: profileData.role || '',
          short_bio: profileData.short_bio || '',
          projects,
          autoGenerate,
        },
        isLoading: false,
      });
    } catch (error) {
      console.error('Failed to load profile:', error);
      set({
        error: 'Failed to load profile',
        isLoading: false,
      });
    }
  },

  saveProfile: async (updates: Partial<Profile>) => {
    set({ isSaving: true, error: null });
    try {
      const headers = await getAuthHeaders();
      const currentProfile = get().profile;
      
      // Construct clean payload
      const payload = {
        displayName: updates.displayName !== undefined ? updates.displayName : (currentProfile?.displayName || ''),
        role: updates.role !== undefined ? updates.role : (currentProfile?.role || ''),
        short_bio: updates.short_bio !== undefined ? updates.short_bio : (currentProfile?.short_bio || ''),
        autoGenerate: updates.autoGenerate !== undefined ? updates.autoGenerate : (currentProfile?.autoGenerate || false),
        projects: (updates.projects || currentProfile?.projects || []).map((p) => ({
          name: p.name,
          url: p.url,
          description: p.description,
        })),
      };

      const response = await axios.post(`${API_URL}/api/profile`, payload, {
        headers,
        withCredentials: true,
      });
      
      const profileData = response.data.profile;
      if (!profileData) throw new Error('Failed to update profile: No data returned');

      const projects = (profileData.projects || []).map((p: Omit<Project, 'id'> & { id?: string }) => ({
        ...p,
        id: p.id || generateProjectId(),
      }));

      const autoGenerate = !!profileData.autoGenerate;
      
      // Sync storage
      await chrome.storage.local.set({ autoGenerate });

      set({
        profile: {
          displayName: profileData.displayName || '',
          role: profileData.role || '',
          short_bio: profileData.short_bio || '',
          projects,
          autoGenerate,
        },
        isSaving: false,
      });
      return true;
    } catch (error) {
      console.error('Failed to save profile:', error);
      set({
        error: 'Failed to save profile',
        isSaving: false,
      });
      return false;
    }
  },

  setProfile: (profile: Profile) => {
    set({ profile });
  },

  updateField: <K extends keyof Profile>(field: K, value: Profile[K]) => {
    const currentProfile = get().profile;
    if (currentProfile) {
      set({
        profile: { ...currentProfile, [field]: value },
      });
    }
  },

  addProject: () => {
    const currentProfile = get().profile;
    if (currentProfile) {
      set({
        profile: {
          ...currentProfile,
          projects: [...currentProfile.projects, createEmptyProject()],
        },
      });
    }
  },

  updateProject: (id: string, updates: Partial<Project>) => {
    const currentProfile = get().profile;
    if (currentProfile) {
      set({
        profile: {
          ...currentProfile,
          projects: currentProfile.projects.map((p) => (p.id === id ? { ...p, ...updates } : p)),
        },
      });
    }
  },

  removeProject: (id: string) => {
    const currentProfile = get().profile;
    if (currentProfile) {
      set({
        profile: {
          ...currentProfile,
          projects: currentProfile.projects.filter((p) => p.id !== id),
        },
      });
    }
  },

  reorderProjects: (projects: Project[]) => {
    const currentProfile = get().profile;
    if (currentProfile) {
      set({
        profile: {
          ...currentProfile,
          projects,
        },
      });
    }
  },

  clearProjects: () => {
    const currentProfile = get().profile;
    if (currentProfile) {
      set({
        profile: {
          ...currentProfile,
          projects: [],
        },
      });
    }
  },

  clearError: () => {
    set({ error: null });
  },
}));
