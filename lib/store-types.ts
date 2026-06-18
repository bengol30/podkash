import { episodes, people, tasks, messages, platforms, productionSessions } from './data';

export type DriveFolderStatus = {
  fileCount: number;
  hasFiles: boolean;
  checkedAt?: string;
  files?: Array<{ id?: string; name: string; mimeType?: string; url?: string }>;
};

export type Episode = typeof episodes[number] & {
  brief?: string;
  contentPlan?: string;
  coordinationNote?: string;
  assetsNote?: string;
  ownerHostId?: string;
  ownerName?: string;
  driveFolderUrl?: string;
  fullVideoUrl?: string;
  youtubeUrl?: string;
  spotifyUrl?: string;
  shortsDriveFolderUrl?: string;
  driveMarketingFolderUrl?: string;
  fullVideoFolderUrl?: string;
  fullAudioFolderUrl?: string;
  driveAssetsSyncedAt?: string;
  driveAssetStatus?: {
    marketing?: DriveFolderStatus;
    fullVideo?: DriveFolderStatus;
    fullAudio?: DriveFolderStatus;
  };
};
export type Person = typeof people[number] & { email?: string; city?: string; source?: string };
export type Task = typeof tasks[number];
export type Message = typeof messages[number];
export type Platform = typeof platforms[number];
export type Session = typeof productionSessions[number] & { startAt?: string; endAt?: string };
export type ApplicationType = 'guest' | 'host';
export type Application = {
  id: string;
  type: ApplicationType;
  createdAt: string;
  name: string;
  phone: string;
  email: string;
  city?: string;
  age?: string;
  displayName?: string;
  links?: string;
  episodeId?: number | null;
  noEpisode?: boolean;
  data: Record<string, string>;
};

// Shared studio bookings (one global pool — single studio, conflict-checked, admin-approved).
export type Booking = {
  id: string;
  ownerHostId: string; // 'default' = admin
  ownerName: string;
  episodeId?: number | null;
  episodeTitle: string;
  studio: string;
  startAt: string; // ISO
  endAt: string;   // ISO
  status: 'pending' | 'confirmed';
  createdAt: string;
};

export type Store = {
  episodes: Episode[];
  people: Person[];
  tasks: Task[];
  messages: Message[];
  platforms: Platform[];
  sessions: Session[];
  applications: Application[];
};

export const seedStore: Store = {
  episodes,
  people,
  tasks,
  messages,
  platforms,
  sessions: productionSessions,
  applications: [],
};
