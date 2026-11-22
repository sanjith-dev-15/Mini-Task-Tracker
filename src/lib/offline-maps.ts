/**
 * Offline map areas — download a rectangle of the street map so it keeps
 * working with no internet.
 *
 * Built on MapLibre's `OfflineManager`: each download is stored natively as
 * "offline packs" in MapLibre's own database, and the map reads from them
 * automatically whenever the network can't answer. Nothing else in the app
 * has to change for the map to work offline.
 *
 * One area = two packs, one per style (light + dark), so the map works offline
 * in either theme. Both OpenFreeMap styles draw from the same vector tiles, and
 * MapLibre stores a shared resource only once, so the second pack mostly adds
 * the dark style's sprites and fonts rather than doubling the download.
 *
 * Satellite (Esri) is deliberately not offered: Esri's free imagery terms don't
 * allow bulk downloading.
 */

import {
  OfflineManager,
  type LngLatBounds,
  type OfflinePack,
  type OfflinePackStatus,
} from '@maplibre/maplibre-react-native';
import { useEffect, useSyncExternalStore } from 'react';

/** OpenFreeMap — hosted vector tiles, no API key, no usage limits. */
export const MAP_STYLE_URL = {
  // `bright` carries more POI labels / building detail than `liberty`.
  light: 'https://tiles.openfreemap.org/styles/bright',
  dark: 'https://tiles.openfreemap.org/styles/dark',
} as const;

/**
 * Tint for downloaded areas, on the map and in the settings list — purple, so
 * it never reads as a reminder pin (blue) or your live location (green).
 */
export const OFFLINE_COLOR = '#8B5CF6';

/**
 * OpenFreeMap's vector tiles stop at zoom 14; MapLibre draws closer zooms
 * (street level, 17+) by scaling those up, so 0–14 covers every zoom offline.
 */
const MIN_ZOOM = 0;
const MAX_ZOOM = 14;

/**
 * Upper bound on one area's tile count — roughly a large city plus its
 * surroundings. Keeps a single tap from queueing a multi-gigabyte download
 * against a free, shared tile server.
 */
export const MAX_AREA_TILES = 4000;

/** Rough average size of one OpenFreeMap vector tile, for the size estimate. */
const AVG_TILE_BYTES = 40 * 1024;

export type OfflineAreaState = 'downloading' | 'paused' | 'complete' | 'error';

export type OfflineArea = {
  /** Shared id tying the light + dark packs together. */
  id: string;
  name: string;
  createdAt: number;
  bounds: LngLatBounds;
  packIds: string[];
  /** 0–100, averaged across the area's packs. */
  percentage: number;
  /** Bytes stored on the device. */
  bytes: number;
  state: OfflineAreaState;
  error?: string;
};

type PackMeta = { area?: string; name?: string; createdAt?: number };
type PackInfo = {
  pack: OfflinePack;
  percentage: number;
  bytes: number;
  state: OfflinePackStatus['state'];
  error?: string;
};

// ---------------------------------------------------------------------------
// Store — one copy for the whole app, so the map screen and the settings list
// see the same live progress.
// ---------------------------------------------------------------------------

const packs = new Map<string, PackInfo>();
let areas: OfflineArea[] = [];
let loaded = false;
let loading: Promise<void> | null = null;
const listeners = new Set<() => void>();

function emit() {
  const groups = new Map<string, PackInfo[]>();
  for (const info of packs.values()) {
    const meta = info.pack.metadata as PackMeta;
    const key = meta.area ?? info.pack.id;
    groups.set(key, [...(groups.get(key) ?? []), info]);
  }

  areas = [...groups.entries()]
    .map(([id, list]): OfflineArea => {
      const meta = list[0].pack.metadata as PackMeta;
      const error = list.find((p) => p.error)?.error;
      const complete = list.every((p) => p.state === 'complete');
      const active = list.some((p) => p.state === 'active');
      return {
        id,
        name: meta.name ?? 'Map area',
        createdAt: meta.createdAt ?? 0,
        bounds: list[0].pack.bounds,
        packIds: list.map((p) => p.pack.id),
        percentage: list.reduce((sum, p) => sum + p.percentage, 0) / list.length,
        // Shared tiles are stored once, so the largest pack is the honest
        // figure — summing would count the common tiles twice.
        bytes: Math.max(...list.map((p) => p.bytes)),
        state: complete ? 'complete' : error ? 'error' : active ? 'downloading' : 'paused',
        error,
      };
    })
    .sort((a, b) => b.createdAt - a.createdAt);

  for (const l of listeners) l();
}

function applyStatus(id: string, status: Partial<OfflinePackStatus>) {
  const info = packs.get(id);
  if (!info) return;
  packs.set(id, {
    ...info,
    percentage: status.percentage ?? info.percentage,
    bytes: status.completedResourceSize ?? info.bytes,
    state: status.state ?? info.state,
    // A fresh progress event means the download is moving again.
    error: status.state === 'active' ? undefined : info.error,
  });
  emit();
}

const onProgress = (pack: OfflinePack, status: OfflinePackStatus) =>
  applyStatus(pack.id, status);

const onError = (pack: OfflinePack, err: { message: string }) => {
  const info = packs.get(pack.id);
  if (!info) return;
  packs.set(pack.id, { ...info, error: err.message || 'Download failed', state: 'inactive' });
  emit();
};

/** Read every stored pack (and its progress) from MapLibre's database. */
export function loadOfflineAreas(): Promise<void> {
  if (loading) return loading;
  loading = (async () => {
    try {
      const stored = await OfflineManager.getPacks();
      for (const pack of stored) {
        const status = await pack.status().catch(() => null);
        packs.set(pack.id, {
          pack,
          percentage: status?.percentage ?? 0,
          bytes: status?.completedResourceSize ?? 0,
          state: status?.state ?? 'inactive',
          error: packs.get(pack.id)?.error,
        });
      }
      loaded = true;
      emit();
    } finally {
      loading = null;
    }
  })();
  return loading;
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

/** Live list of downloaded / downloading areas, newest first. */
export function useOfflineAreas(): { areas: OfflineArea[]; loaded: boolean } {
  useEffect(() => {
    loadOfflineAreas().catch(() => {});
  }, []);
  const list = useSyncExternalStore(subscribe, () => areas);
  return { areas: list, loaded };
}

// ---------------------------------------------------------------------------
// Size estimate
// ---------------------------------------------------------------------------

const lngToX = (lng: number, z: number) => Math.floor(((lng + 180) / 360) * 2 ** z);
function latToY(lat: number, z: number) {
  const clamped = Math.max(-85.0511, Math.min(85.0511, lat));
  const r = (clamped * Math.PI) / 180;
  return Math.floor(((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * 2 ** z);
}

/** Number of map tiles covering `bounds` across all downloaded zoom levels. */
export function estimateTiles([west, south, east, north]: LngLatBounds): number {
  let total = 0;
  for (let z = MIN_ZOOM; z <= MAX_ZOOM; z++) {
    const xs = lngToX(east, z) - lngToX(west, z) + 1;
    const ys = latToY(south, z) - latToY(north, z) + 1;
    total += Math.max(1, xs) * Math.max(1, ys);
  }
  return total;
}

/** Rough download size in bytes — tile sizes vary a lot between city and countryside. */
export const estimateBytes = (tiles: number) => tiles * AVG_TILE_BYTES;

export function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  const mb = bytes / (1024 * 1024);
  return mb < 10 ? `${mb.toFixed(1)} MB` : `${Math.round(mb)} MB`;
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

/** Start downloading `bounds` for offline use. Returns the new area's id. */
export async function downloadArea(bounds: LngLatBounds, name: string): Promise<string> {
  if (!loaded) await loadOfflineAreas().catch(() => {});
  const area = `area-${Date.now().toString(36)}`;
  const createdAt = Date.now();

  for (const mapStyle of [MAP_STYLE_URL.light, MAP_STYLE_URL.dark]) {
    const pack = await OfflineManager.createPack(
      {
        mapStyle,
        bounds,
        minZoom: MIN_ZOOM,
        maxZoom: MAX_ZOOM,
        metadata: { area, name, createdAt } satisfies PackMeta,
      },
      onProgress,
      onError,
    );
    // Progress events may already have arrived; keep whatever they set.
    if (!packs.has(pack.id)) {
      packs.set(pack.id, { pack, percentage: 0, bytes: 0, state: 'active' });
    }
    emit();
  }
  return area;
}

/** Continue a download that was interrupted (app closed, network dropped, error). */
export async function resumeArea(area: OfflineArea): Promise<void> {
  for (const id of area.packIds) {
    const info = packs.get(id);
    if (!info || info.state === 'complete') continue;
    await OfflineManager.addListener(id, onProgress, onError);
    await info.pack.resume();
    applyStatus(id, { state: 'active' });
  }
}

/** Remove an area and free the storage only it was using. */
export async function deleteArea(area: OfflineArea): Promise<void> {
  for (const id of area.packIds) {
    OfflineManager.removeListener(id);
    await OfflineManager.deletePack(id).catch(() => {});
    packs.delete(id);
  }
  emit();
}
