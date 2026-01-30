
export type UserRole = 'host' | 'producer' | 'admin';

export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  avatar?: string;
}

export type EpisodeStatus = 'idea' | 'planned' | 'needs_assets' | 'booked' | 'recorded' | 'editing' | 'for_approval' | 'ready' | 'scheduled' | 'published';

export interface Episode {
  id: string;
  title: string;
  description: string;
  status: EpisodeStatus;
  type: 'interview' | 'solo' | 'panel' | 'field';
  hostId: string;
  createdAt: string;
  updatedAt: string;
}

export interface Guest {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  linkedin?: string;
  instagram?: string;
  notes?: string;
  status: 'idea' | 'contacted' | 'confirmed' | 'scheduled' | 'recorded';
  description?: string;
  relatedEpisodeId?: string;
}

export interface Booking {
  id: string;
  date: string;
  startTime: string;
  endTime: string;
  type: 'audio' | 'video';
  status: 'pending' | 'approved';
  hostId: string;
  episodeId?: string;
  description?: string;
}

export interface Task {
  id: string;
  title: string;
  assigneeId: string;
  status: 'pending' | 'completed';
  category: string;
  dueDate?: string;
  relatedId?: string;
}

export interface AppNotification {
  id: string;
  userId: string;
  message: string;
  read: boolean;
  type: 'info' | 'alert' | 'success';
  createdAt: string;
}

export interface AppState {
  currentUser: User | null;
  episodes: Episode[];
  guests: Guest[];
  bookings: Booking[];
  tasks: Task[];
  notifications: AppNotification[];
}
