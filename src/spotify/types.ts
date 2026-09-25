export type SpotifyImage = {
  url: string;
  width: number | null;
  height: number | null;
};

export type SimplifiedArtist = {
  name: string;
};

export type SpotifyTrack = {
  id: string | null;
  uri: string;
  name: string;
  duration_ms: number;
  artists: SimplifiedArtist[];
  album: {
    name: string;
    images: SpotifyImage[];
  };
  /** 30s preview clip, no longer reliably populated by the API — used as a fallback only. */
  preview_url: string | null;
  is_local: boolean;
};

/** Shape shared by playlist items ("PlaylistTrackObject") and Liked Songs ("SavedTrackObject"). */
export type TrackItem = {
  added_at: string;
  track: SpotifyTrack;
};

export type Paging<T> = {
  items: T[];
  total: number;
  limit: number;
  offset: number;
  next: string | null;
};

export type SimplifiedPlaylist = {
  id: string;
  name: string;
  tracks: { total: number };
  owner: { id: string; display_name: string | null };
  collaborative: boolean;
};

export type Me = {
  id: string;
  display_name: string | null;
  product: 'premium' | 'free' | 'open';
};

export type Device = {
  id: string | null;
  name: string;
  type: string;
  is_active: boolean;
  is_restricted: boolean;
  volume_percent: number | null;
};

export type PlaybackState = {
  device: Device;
  is_playing: boolean;
  progress_ms: number | null;
  item: SpotifyTrack | null;
} | null;
