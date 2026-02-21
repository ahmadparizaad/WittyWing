export interface Project {
  id: string;
  name: string;
  url: string;
  description: string;
}

export interface Profile {
  displayName: string;
  role: string;
  short_bio: string;
  projects: Project[];
}

export interface User {
  id: string;
  email: string;
  displayName: string;
}

export interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  serverJwt: string | null;
  refreshToken: string | null;
}

export interface ProfileState {
  profile: Profile | null;
  isLoading: boolean;
  isSaving: boolean;
  error: string | null;
}

export type Page = 'auth' | 'profile-view' | 'profile-edit';

export interface SessionResponse {
  authenticated: boolean;
  user?: User;
}
