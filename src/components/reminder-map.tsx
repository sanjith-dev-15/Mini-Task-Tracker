import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import {
  Camera,
  type CameraRef,
  GeoJSONSource,
  Layer,
  LogManager,
  Map,
  type MapRef,
  Marker,
  useCurrentPosition,
} from '@maplibre/maplibre-react-native';
import { useEffect, useRef, useState, type ComponentProps } from 'react';
import {
  ActivityIndicator,
  Keyboard,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import Animated, {
  useAnimatedKeyboard,
  useAnimatedStyle,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useGlassAlert } from '@/components/glass-alert';
import { ThemedText } from '@/components/themed-text';
import { reverseGeocode, searchPlaces, type Suggestion } from '@/lib/geocode';
import {
  MAX_AREA_TILES,
  MAP_STYLE_URL as STYLE_URL,
  OFFLINE_COLOR,
  downloadArea,
  estimateBytes,
  estimateTiles,
  formatBytes,
  useOfflineAreas,
} from '@/lib/offline-maps';
import { formatDue, isOverdue } from '@/lib/reminder-dates';
import { useThemeContext } from '@/lib/theme';
import type { Reminder, ReminderLocation } from '@/lib/reminders';

/**
 * Silence the flood of `Mbgl-HttpRequest` WARNs MapLibre emits whenever it
 * cancels an in-flight tile request — routine when the map pans, zooms or
 * unmounts (the HTTP/2 stream is reset with CANCEL). The library only downgrades
 * the exact "Canceled" wording, not the "stream was reset: CANCEL" variant, so
 * we drop those here and let every other log through untouched.
 */
LogManager.onLog(
  (log) =>
    log.tag === 'Mbgl-HttpRequest' &&
    /cancell?ed|stream was reset: cancel/i.test(log.message),
);

/**
 * Satellite view — Esri World Imagery, with Esri's place-name layer on top so
 * towns and areas stay readable. Raster tiles, no API key.
 */
const ESRI = 'https://server.arcgisonline.com/ArcGIS/rest/services';
type StyleJson = Exclude<ComponentProps<typeof Map>['mapStyle'], string | undefined>;
const SATELLITE_STYLE: StyleJson = {
  version: 8,
  sources: {
    imagery: {
      type: 'raster',
      tiles: [`${ESRI}/World_Imagery/MapServer/tile/{z}/{y}/{x}`],
      tileSize: 256,
      maxzoom: 19,
      attribution: 'Powered by Esri · Esri, Maxar, Earthstar Geographics, GIS User Community',
    },
    places: {
      type: 'raster',
      tiles: [`${ESRI}/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}`],
      tileSize: 256,
      maxzoom: 19,
    },
  },
  layers: [
    { id: 'imagery', type: 'raster', source: 'imagery' },
    { id: 'places', type: 'raster', source: 'places' },
  ],
};

type MapKind = 'map' | 'satellite';
const MAP_KIND_KEY = 'map:kind';
/** Shared across map instances (home preview + full screen) during a session. */
let savedKind: MapKind = 'map';

/** Fallback camera when nothing is pinned and location is unavailable. */
const DEFAULT_CENTER: [number, number] = [78.9629, 20.5937]; // India
const DEFAULT_ZOOM = 3.5;
const PIN_ZOOM = 13;
/** "My location" zooms in to street level, like Google Maps. */
const MY_LOCATION_ZOOM = 17;
/** Your live-location dot — green, so it never reads as a (blue) reminder pin. */
const LIVE_COLOR = '#22C55E';
const PIN_LABEL_HEIGHT = 22;

/**
 * Short tag shown above a pin: the title, else the first named part of the
 * place — skipping house / door numbers like "43" or "7/6B".
 */
function pinLabel(r: Reminder): string {
  const title = r.title.trim();
  if (title) return title;
  const parts = (r.location?.label ?? '').split(',').map((p) => p.trim());
  const named = parts.find((p) => /[a-z]{3,}/i.test(p));
  return named || 'Reminder';
}

/**
 * Name for a downloaded map area, from the address at its centre: the first two
 * named parts ("Indiranagar, Bengaluru"), skipping house numbers and postcodes.
 */
function areaName(label: string | undefined): string {
  const named = (label ?? '')
    .split(',')
    .map((p) => p.trim())
    .filter((p) => /[a-z]{3,}/i.test(p));
  if (named.length) return named.slice(0, 2).join(', ');
  return `Map area · ${new Date().toLocaleDateString()}`;
}

export type { LatLng } from '@/lib/geocode';

/** Great-circle distance in km between two `[lng, lat]` points. */
function distanceKm(a: [number, number], b: [number, number]): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b[1] - a[1]);
  const dLon = toRad(b[0] - a[0]);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a[1])) * Math.cos(toRad(b[1])) * Math.sin(dLon / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

function formatDistance(km: number): string {
  if (km < 1) return `${Math.round(km * 1000)} m`;
  if (km < 10) return `${km.toFixed(1)} km`;
  return `${Math.round(km)} km`;
}

function openDirections(loc: ReminderLocation) {
  const dest = `${loc.lat},${loc.lng}`;
  const url = `https://www.google.com/maps/dir/?api=1&destination=${dest}`;
  Linking.openURL(url).catch(() => {});
}

type Props = {
  reminders: Reminder[];
  onPressPin: (id: string) => void;
  onLongPressMap: (loc: ReminderLocation) => void;
  /** When set, an expand button is shown that calls this (e.g. open the full-screen map). */
  onExpand?: () => void;
  /** When set, a close button is shown in the top bar (full-screen mode). */
  onClose?: () => void;
  /** When set, a button opens the offline-maps list (Settings → Offline maps). */
  onOpenOfflineMaps?: () => void;
  /** Show the place/address search bar in the top bar. */
  searchable?: boolean;
  /**
   * "Pick a location" mode: the map is being used to choose a place for an
   * existing reminder, so CTAs read "Use this location" and a hint is shown.
   */
  pickMode?: boolean;
  /** Fill the parent with no rounded corners / border (full-screen mode). */
  fullBleed?: boolean;
  style?: StyleProp<ViewStyle>;
};

export function ReminderMap({
  reminders,
  onPressPin,
  onLongPressMap,
  onExpand,
  onClose,
  onOpenOfflineMaps,
  searchable,
  pickMode,
  fullBleed,
  style,
}: Props) {
  const { colors, scheme } = useThemeContext();
  const insets = useSafeAreaInsets();
  const cameraRef = useRef<CameraRef>(null);
  const mapRef = useRef<MapRef>(null);
  const [locating, setLocating] = useState(false);

  // Offline download — only offered on the full-screen map.
  const { alert: glassAlert, showAlert } = useGlassAlert();
  const { areas: offlineAreas } = useOfflineAreas();
  /** Area started from this map, so its progress shows in the pill. */
  const [downloadId, setDownloadId] = useState<string | null>(null);
  const [preparing, setPreparing] = useState(false);
  const downloading = downloadId ? offlineAreas.find((a) => a.id === downloadId) : undefined;
  /** Each downloaded area as a rectangle, tinted on the map. */
  const offlineShapes: GeoJSON.FeatureCollection = {
    type: 'FeatureCollection',
    features: offlineAreas.map((a) => {
      const [w, s, e, n] = a.bounds;
      return {
        type: 'Feature',
        id: a.id,
        properties: { complete: a.state === 'complete' },
        geometry: {
          type: 'Polygon',
          coordinates: [[[w, s], [e, s], [e, n], [w, n], [w, s]]],
        },
      };
    }),
  };
  // Hide the "Saved" pill a few seconds after the download finishes.
  useEffect(() => {
    if (downloading?.state !== 'complete') return;
    const t = setTimeout(() => setDownloadId(null), 3000);
    return () => clearTimeout(t);
  }, [downloading?.state]);

  /** Map rotation in degrees (0 = north up), rounded to whole degrees. */
  const [bearing, setBearing] = useState(0);
  const trackBearing = (b: number) => {
    const rounded = Math.round(b) % 360;
    setBearing((cur) => (cur === rounded ? cur : rounded));
  };

  // Street map vs satellite — remembered between launches.
  const [kind, setKind] = useState<MapKind>(savedKind);
  useEffect(() => {
    AsyncStorage.getItem(MAP_KIND_KEY)
      .then((v) => {
        if (v === 'map' || v === 'satellite') {
          savedKind = v;
          setKind(v);
        }
      })
      .catch(() => {});
  }, []);
  const toggleKind = () => {
    const next: MapKind = kind === 'satellite' ? 'map' : 'satellite';
    savedKind = next;
    setKind(next);
    AsyncStorage.setItem(MAP_KIND_KEY, next).catch(() => {});
  };

  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Suggestion[]>([]);
  const [searching, setSearching] = useState(false);
  const [notFound, setNotFound] = useState(false);
  /** Search couldn't reach the server (usually: no internet). */
  const [searchFailed, setSearchFailed] = useState(false);
  const [spot, setSpot] = useState<ReminderLocation | null>(null);

  /** Reminder whose info card is open (tapped pin). */
  const [selectedId, setSelectedId] = useState<string | null>(null);
  /** Coordinate being reverse-geocoded after a long-press. */
  const [dropAt, setDropAt] = useState<[number, number] | null>(null);

  /** User's location `[lng, lat]` once known — used for result distances. */
  const [userLoc, setUserLoc] = useState<[number, number] | null>(null);
  // Live position for the "you are here" dot (`[lng, lat]`).
  const position = useCurrentPosition();
  const me: [number, number] | null = position?.coords
    ? [position.coords.longitude, position.coords.latitude]
    : null;

  /** Last known map centre `[lng, lat]`, used to bias search results. */
  const centerRef = useRef<[number, number] | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Monotonic id so a slow response from an earlier keystroke is ignored. */
  const reqRef = useRef(0);

  useEffect(() => {
    Location.getLastKnownPositionAsync()
      .then((pos) => {
        if (pos) setUserLoc([pos.coords.longitude, pos.coords.latitude]);
      })
      .catch(() => {});
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  // Keep the bottom bar above the keyboard when it opens.
  const kb = useAnimatedKeyboard();
  const bottomBarStyle = useAnimatedStyle(() => ({
    bottom: Math.max(kb.height.value, insets.bottom) + 12,
  }));

  const located = reminders.filter((r) => r.location != null);
  const first = located[0]?.location;
  const initialViewState = first
    ? { center: [first.lng, first.lat] as [number, number], zoom: PIN_ZOOM }
    : { center: DEFAULT_CENTER, zoom: DEFAULT_ZOOM };

  const selected = selectedId ? reminders.find((r) => r.id === selectedId) ?? null : null;

  if (Platform.OS === 'web') {
    return (
      <View
        style={[
          styles.fallback,
          { backgroundColor: colors.backgroundElement, borderColor: colors.border },
          style,
        ]}>
        <Ionicons name="map-outline" size={28} color={colors.textSecondary} />
        <ThemedText type="small" themeColor="textSecondary">
          The map is available in the app
        </ThemedText>
      </View>
    );
  }

  const goToMyLocation = async () => {
    if (locating) return;
    setLocating(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') return;
      const pos = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      setUserLoc([pos.coords.longitude, pos.coords.latitude]);
      cameraRef.current?.easeTo({
        center: [pos.coords.longitude, pos.coords.latitude],
        zoom: MY_LOCATION_ZOOM,
        duration: 700,
      });
    } catch {
      // ignore — leave the camera where it is
    } finally {
      setLocating(false);
    }
  };

  /** Save the street map currently on screen for offline use. */
  const offerDownload = async () => {
    if (preparing || downloading?.state === 'downloading') return;
    setPreparing(true);
    try {
      const bounds = await mapRef.current?.getBounds();
      if (!bounds) return;
      const tiles = estimateTiles(bounds);
      if (tiles > MAX_AREA_TILES) {
        showAlert({
          title: 'Area too large',
          message: 'Zoom in to a city or smaller region, then try again.',
          icon: 'search-outline',
          tone: 'accent',
          actions: [{ label: 'OK', onPress: () => {} }],
        });
        return;
      }
      const [w, s, e, n] = bounds;
      const name = areaName(await reverseGeocode((s + n) / 2, (w + e) / 2));
      showAlert({
        title: 'Download this area?',
        message:
          `${name}\n\nThe street map you can see will work without internet ` +
          `(about ${formatBytes(estimateBytes(tiles))}). ` +
          'Satellite view and place search still need internet.',
        icon: 'cloud-download-outline',
        tone: 'accent',
        actions: [
          { label: 'Cancel', style: 'cancel', onPress: () => {} },
          {
            label: 'Download',
            onPress: () => {
              downloadArea(bounds, name)
                .then(setDownloadId)
                .catch(() =>
                  showAlert({
                    title: "Couldn't start download",
                    message: 'Check your internet connection and try again.',
                    icon: 'cloud-offline-outline',
                    actions: [{ label: 'OK', onPress: () => {} }],
                  }),
                );
            },
          },
        ],
      });
    } finally {
      setPreparing(false);
    }
  };

  /** Drop a pin on the device's current position — no search needed. */
  const pinMyLocation = async () => {
    if (locating) return;
    Keyboard.dismiss();
    setLocating(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') return;
      const pos = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });
      const here = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      setUserLoc([here.lng, here.lat]);
      setSelectedId(null);
      setResults([]);
      setNotFound(false);
      setQuery('');
      setSpot({ ...here, label: undefined });
      cameraRef.current?.easeTo({
        center: [here.lng, here.lat],
        zoom: MY_LOCATION_ZOOM,
        duration: 700,
      });
      const label = await reverseGeocode(here.lat, here.lng);
      setSpot((cur) =>
        cur && cur.lat === here.lat && cur.lng === here.lng ? { ...cur, label } : cur,
      );
    } catch {
      // ignore — nothing pinned
    } finally {
      setLocating(false);
    }
  };

  const fetchSuggestions = async (q: string) => {
    const reqId = ++reqRef.current;
    setSearching(true);
    try {
      const bias = centerRef.current ?? initialViewState.center;
      const next = await searchPlaces(q, bias);
      if (reqId !== reqRef.current) return; // a newer keystroke superseded this
      setResults(next);
      setSearchFailed(false);
      setNotFound(next.length === 0);
    } catch {
      if (reqId === reqRef.current) {
        setResults([]);
        setSearchFailed(true);
        setNotFound(true);
      }
    } finally {
      if (reqId === reqRef.current) setSearching(false);
    }
  };

  const onQueryChange = (t: string) => {
    setQuery(t);
    setNotFound(false);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const q = t.trim();
    if (q.length < 3) {
      setResults([]);
      setSearching(false);
      return;
    }
    debounceRef.current = setTimeout(() => fetchSuggestions(q), 300);
  };

  const selectSuggestion = (s: Suggestion) => {
    Keyboard.dismiss();
    if (debounceRef.current) clearTimeout(debounceRef.current);
    reqRef.current++; // drop any in-flight response
    setResults([]);
    setSearching(false);
    setNotFound(false);
    setSelectedId(null);
    setQuery(s.name);
    const found: ReminderLocation = {
      lat: s.lat,
      lng: s.lng,
      label: s.address || s.name,
    };
    setSpot(found);
    cameraRef.current?.easeTo({
      center: [found.lng, found.lat],
      zoom: PIN_ZOOM,
      duration: 800,
    });
  };

  const submitSearch = () => {
    if (results.length > 0) {
      selectSuggestion(results[0]);
      return;
    }
    const q = query.trim();
    if (q.length < 3) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    fetchSuggestions(q);
  };

  const clearSearch = () => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    reqRef.current++;
    setQuery('');
    setResults([]);
    setSpot(null);
    setNotFound(false);
    setSearching(false);
  };

  const handleLongPress = async (lat: number, lng: number) => {
    Keyboard.dismiss();
    setSelectedId(null);
    setSpot(null);
    setDropAt([lng, lat]);
    const label = await reverseGeocode(lat, lng);
    setDropAt(null);
    onLongPressMap({ lat, lng, label });
  };

  const distanceFor = (s: Suggestion): string | null => {
    if (!userLoc) return null;
    return formatDistance(distanceKm(userLoc, [s.lng, s.lat]));
  };

  const locateButton = (
    <Pressable
      accessibilityLabel="Center on my location"
      onPress={goToMyLocation}
      style={({ pressed }) => [
        styles.roundBtn,
        { backgroundColor: colors.card, borderColor: colors.border, opacity: pressed ? 0.7 : 1 },
      ]}>
      <Ionicons name={locating ? 'ellipsis-horizontal' : 'locate'} size={18} color={colors.accent} />
    </Pressable>
  );

  const satellite = kind === 'satellite';
  const layerButton = (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={satellite ? 'Show street map' : 'Show satellite view'}
      onPress={toggleKind}
      style={({ pressed }) => [
        styles.roundBtn,
        {
          backgroundColor: satellite ? colors.accent : colors.card,
          borderColor: satellite ? colors.accent : colors.border,
          opacity: pressed ? 0.7 : 1,
        },
      ]}>
      <Ionicons name={satellite ? 'map-outline' : 'earth'} size={18} color={satellite ? '#fff' : colors.accent} />
    </Pressable>
  );

  // Compass — only while the map is rotated; tap to turn north back up.
  const rotated = bearing !== 0;
  const compassButton = rotated && (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Reset map to north"
      onPress={() =>
        cameraRef.current?.easeTo({
          center: centerRef.current ?? initialViewState.center,
          bearing: 0,
          pitch: 0,
          duration: 400,
        })
      }
      style={({ pressed }) => [
        styles.roundBtn,
        { backgroundColor: colors.card, borderColor: colors.border, opacity: pressed ? 0.7 : 1 },
      ]}>
      <View style={{ transform: [{ rotate: `${-bearing}deg` }] }}>
        <Ionicons name="navigate" size={18} color={colors.danger} style={styles.compassIcon} />
      </View>
    </Pressable>
  );

  // Offline download — full-screen street map only (satellite can't be saved).
  const offlineButton = onClose && !pickMode && !satellite && (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Download this area for offline use"
      onPress={offerDownload}
      style={({ pressed }) => [
        styles.roundBtn,
        { backgroundColor: colors.card, borderColor: colors.border, opacity: pressed ? 0.7 : 1 },
      ]}>
      {preparing ? (
        <ActivityIndicator size="small" color={colors.accent} />
      ) : (
        <Ionicons name="cloud-download-outline" size={18} color={colors.accent} />
      )}
    </Pressable>
  );

  // Opens the list of saved areas (Settings → Offline maps).
  const offlineListButton = onOpenOfflineMaps && !pickMode && (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Manage offline maps"
      onPress={onOpenOfflineMaps}
      style={({ pressed }) => [
        styles.roundBtn,
        { backgroundColor: colors.card, borderColor: colors.border, opacity: pressed ? 0.7 : 1 },
      ]}>
      <Ionicons name="albums-outline" size={18} color={OFFLINE_COLOR} />
      {offlineAreas.length > 0 && (
        <View style={[styles.badge, { borderColor: colors.card }]}>
          <ThemedText style={styles.badgeText}>{offlineAreas.length}</ThemedText>
        </View>
      )}
    </Pressable>
  );

  /** Right-hand column: compass, offline list + download, layer toggle, "my location". */
  const sideButtons = (
    <View style={styles.sideButtons}>
      {compassButton}
      {offlineListButton}
      {offlineButton}
      {layerButton}
      {locateButton}
    </View>
  );

  const downloadPill = downloading && (
    <View
      pointerEvents="none"
      style={[
        styles.downloadPill,
        { top: insets.top + 8, backgroundColor: colors.card, borderColor: colors.border },
      ]}>
      {downloading.state === 'complete' ? (
        <Ionicons name="checkmark-circle" size={16} color={colors.accent} />
      ) : downloading.state === 'error' ? (
        <Ionicons name="cloud-offline-outline" size={16} color={colors.danger} />
      ) : (
        <ActivityIndicator size="small" color={colors.accent} />
      )}
      <ThemedText type="small" numberOfLines={1}>
        {downloading.state === 'complete'
          ? 'Saved for offline use'
          : downloading.state === 'error'
            ? 'Download stopped — resume in Offline maps'
            : `Downloading offline map… ${Math.floor(downloading.percentage)}%`}
      </ThemedText>
    </View>
  );

  const searchBox = (
    <View style={[styles.searchBox, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <Ionicons name="search" size={17} color={colors.textSecondary} />
      <TextInput
        value={query}
        onChangeText={onQueryChange}
        onSubmitEditing={submitSearch}
        placeholder="Search a place or address"
        placeholderTextColor={colors.textSecondary}
        style={[styles.searchInput, { color: colors.text }]}
        returnKeyType="search"
        autoCorrect={false}
      />
      {searching ? (
        <ActivityIndicator size="small" color={colors.textSecondary} />
      ) : query.length > 0 ? (
        <Pressable onPress={clearSearch} hitSlop={8}>
          <Ionicons name="close-circle" size={18} color={colors.textSecondary} />
        </Pressable>
      ) : null}
    </View>
  );

  const resultsList = results.length > 0 && (
    <View style={[styles.results, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        {results.map((s, i) => {
          const dist = distanceFor(s);
          return (
            <Pressable
              key={s.key}
              onPress={() => selectSuggestion(s)}
              style={({ pressed }) => [
                styles.resultRow,
                i > 0 && { borderTopColor: colors.border, borderTopWidth: StyleSheet.hairlineWidth },
                pressed && { backgroundColor: colors.backgroundElement },
              ]}>
              <Ionicons name="location-outline" size={16} color={colors.textSecondary} />
              <View style={styles.resultText}>
                <View style={styles.resultTop}>
                  <ThemedText type="small" numberOfLines={1} style={styles.flex}>
                    {s.name}
                  </ThemedText>
                  {dist && (
                    <ThemedText type="small" themeColor="textSecondary">
                      {dist}
                    </ThemedText>
                  )}
                </View>
                {(s.category || s.address) && (
                  <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
                    {[s.category, s.address].filter(Boolean).join(' · ')}
                  </ThemedText>
                )}
              </View>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );

  const pinCard = selected && selected.location && (
    <Animated.View
      style={[styles.bottomBar, bottomBarStyle]}
      pointerEvents="box-none">
      <View
        style={[styles.spotCard, styles.flex, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <View style={styles.spotHead}>
          <Ionicons
            name={selected.done ? 'checkmark-circle' : 'ellipse-outline'}
            size={16}
            color={selected.done ? colors.textSecondary : colors.accent}
          />
          <View style={styles.flex}>
            <ThemedText numberOfLines={1}>{selected.title.trim() || 'Untitled reminder'}</ThemedText>
            {selected.dueAt != null && (
              <ThemedText
                type="small"
                style={{
                  color: isOverdue(selected.dueAt, selected.done) ? colors.danger : colors.textSecondary,
                }}>
                {formatDue(selected.dueAt)}
              </ThemedText>
            )}
          </View>
          <Pressable onPress={() => setSelectedId(null)} hitSlop={8}>
            <Ionicons name="close" size={16} color={colors.textSecondary} />
          </Pressable>
        </View>

        {selected.notes.trim() ? (
          <ThemedText type="small" themeColor="textSecondary" numberOfLines={2}>
            {selected.notes.trim()}
          </ThemedText>
        ) : null}
        {selected.location.label ? (
          <View style={styles.spotHead}>
            <Ionicons name="location-outline" size={14} color={colors.textSecondary} />
            <ThemedText type="small" themeColor="textSecondary" numberOfLines={1} style={styles.flex}>
              {selected.location.label}
            </ThemedText>
          </View>
        ) : null}

        <View style={styles.cardActions}>
          <Pressable
            onPress={() => openDirections(selected.location!)}
            style={({ pressed }) => [
              styles.cardBtn,
              { borderColor: colors.border, opacity: pressed ? 0.7 : 1 },
            ]}>
            <Ionicons name="navigate-outline" size={16} color={colors.accent} />
            <ThemedText type="smallBold" style={{ color: colors.accent }}>
              Directions
            </ThemedText>
          </Pressable>
          <Pressable
            onPress={() => onPressPin(selected.id)}
            style={({ pressed }) => [
              styles.cardBtn,
              { backgroundColor: colors.accent, opacity: pressed ? 0.85 : 1 },
            ]}>
            <Ionicons name="open-outline" size={16} color="#fff" />
            <ThemedText type="smallBold" style={styles.spotAddText}>
              Open
            </ThemedText>
          </Pressable>
        </View>
      </View>
    </Animated.View>
  );

  return (
    <View
      style={[
        fullBleed ? styles.containerFull : styles.container,
        { borderColor: colors.border },
        style,
      ]}>
      <Map
        ref={mapRef}
        style={StyleSheet.absoluteFill}
        mapStyle={
          satellite ? SATELLITE_STYLE : scheme === 'dark' ? STYLE_URL.dark : STYLE_URL.light
        }
        logo={false}
        // Built-in compass sits at the top; ours lives in the side button column.
        compass={false}
        onRegionIsChanging={(e) => trackBearing(e.nativeEvent.bearing)}
        attributionPosition={searchable ? { top: 8, right: 8 } : { bottom: 6, left: 6 }}
        onPress={() => {
          Keyboard.dismiss();
          setSelectedId(null);
        }}
        onRegionDidChange={(e) => {
          trackBearing(e.nativeEvent.bearing);
          const c = e.nativeEvent.center;
          if (Array.isArray(c) && c.length >= 2) centerRef.current = [c[0], c[1]];
        }}
        onLongPress={(e) => {
          const [lng, lat] = e.nativeEvent.lngLat;
          handleLongPress(lat, lng);
        }}>
        <Camera ref={cameraRef} initialViewState={initialViewState} />

        {/* Downloaded offline areas: light purple tint + border. Solid border
            once saved, dashed while still downloading / paused. Street map
            only — satellite imagery isn't part of the download. */}
        {!satellite && offlineShapes.features.length > 0 && (
          <GeoJSONSource id="offline-areas" data={offlineShapes}>
            <Layer
              type="fill"
              id="offline-areas-fill"
              paint={{ 'fill-color': OFFLINE_COLOR, 'fill-opacity': 0.1 }}
            />
            <Layer
              type="line"
              id="offline-areas-line"
              filter={['==', ['get', 'complete'], true]}
              paint={{ 'line-color': OFFLINE_COLOR, 'line-width': 2, 'line-opacity': 0.9 }}
            />
            <Layer
              type="line"
              id="offline-areas-line-pending"
              filter={['==', ['get', 'complete'], false]}
              paint={{
                'line-color': OFFLINE_COLOR,
                'line-width': 2,
                'line-opacity': 0.9,
                'line-dasharray': [2, 2],
              }}
            />
          </GeoJSONSource>
        )}
        {located.map((r) => {
          const loc = r.location!;
          const active = r.id === selectedId;
          const label = pinLabel(r);
          return (
            <Marker
              key={r.id}
              id={r.id}
              lngLat={[loc.lng, loc.lat]}
              onPress={() => {
                setSpot(null);
                setSelectedId(r.id);
                cameraRef.current?.easeTo({
                  center: [loc.lng, loc.lat],
                  zoom: PIN_ZOOM,
                  duration: 400,
                });
              }}>
              {/* Label above, same-height spacer below → the dot stays centred on the spot. */}
              <View style={styles.pinStack}>
                <View
                  style={[
                    styles.pinLabel,
                    {
                      backgroundColor: colors.card,
                      borderColor: active ? colors.accent : colors.border,
                    },
                  ]}>
                  <ThemedText
                    type="small"
                    numberOfLines={1}
                    style={[styles.pinLabelText, { color: r.done ? colors.textSecondary : colors.text }]}>
                    {label}
                  </ThemedText>
                </View>
                <View style={styles.pinHit}>
                  <View
                    style={[
                      styles.pin,
                      active && styles.pinActive,
                      {
                        backgroundColor: r.done ? colors.textSecondary : colors.accent,
                        borderColor: active ? colors.accent : colors.card,
                      },
                    ]}
                  />
                </View>
                <View style={styles.pinSpacer} />
              </View>
            </Marker>
          );
        })}

        {spot && (
          <Marker
            id="search-result"
            lngLat={[spot.lng, spot.lat]}
            onPress={() =>
              cameraRef.current?.easeTo({
                center: [spot.lng, spot.lat],
                zoom: PIN_ZOOM,
                duration: 300,
              })
            }>
            <View style={styles.pinHit}>
              <Ionicons name="location" size={34} color={colors.danger} />
            </View>
          </Marker>
        )}

        {dropAt && (
          <Marker id="drop" lngLat={dropAt}>
            <View style={styles.pinHit}>
              <Ionicons name="location" size={34} color={colors.danger} />
            </View>
          </Marker>
        )}

        {/* Live location — its own colour, and last so it sits above any pin
            you're standing on. */}
        {me && (
          <Marker id="me" lngLat={me}>
            <View style={styles.meHalo} pointerEvents="none">
              <View style={styles.meDot} />
            </View>
          </Marker>
        )}
      </Map>

      {dropAt && (
        <View style={styles.centerWrap} pointerEvents="none">
          <View style={[styles.hint, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <ActivityIndicator size="small" color={colors.textSecondary} />
            <ThemedText type="small" themeColor="textSecondary">
              Finding address…
            </ThemedText>
          </View>
        </View>
      )}

      {onClose && (
        <Pressable
          accessibilityLabel="Close full-screen map"
          onPress={onClose}
          style={({ pressed }) => [
            styles.roundBtn,
            styles.closeBtn,
            { top: insets.top + 8, backgroundColor: colors.card, borderColor: colors.border, opacity: pressed ? 0.7 : 1 },
          ]}>
          <Ionicons name="close" size={22} color={colors.text} />
        </Pressable>
      )}

      {pickMode && (
        <View
          pointerEvents="none"
          style={[
            styles.pickHint,
            { top: insets.top + 8 + 48, backgroundColor: colors.card, borderColor: colors.border },
          ]}>
          <Ionicons name="hand-left-outline" size={14} color={colors.textSecondary} />
          <ThemedText type="small" themeColor="textSecondary">
            Search or long-press the map to set the location
          </ThemedText>
        </View>
      )}

      {onExpand && (
        <Pressable
          accessibilityLabel="Open full-screen map"
          onPress={onExpand}
          style={({ pressed }) => [
            styles.cornerBtn,
            styles.expandBtn,
            { backgroundColor: colors.card, borderColor: colors.border, opacity: pressed ? 0.7 : 1 },
          ]}>
          <Ionicons name="expand" size={17} color={colors.accent} />
        </Pressable>
      )}

      {pinCard}
      {downloadPill}
      {glassAlert}

      {searchable && !selected ? (
        <Animated.View style={[styles.bottomBar, bottomBarStyle]} pointerEvents="box-none">
          <View style={styles.bottomLeft}>
            {notFound && (
              <View
                style={[styles.hint, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <ThemedText type="small" themeColor="textSecondary">
                  {searchFailed
                    ? 'Search needs internet — long-press the map to drop a pin'
                    : `No place found for “${query.trim()}”`}
                </ThemedText>
              </View>
            )}

            {spot && (
              <View
                style={[
                  styles.spotCard,
                  { backgroundColor: colors.card, borderColor: colors.border },
                ]}>
                <View style={styles.spotHead}>
                  <Ionicons name="location" size={16} color={colors.danger} />
                  <ThemedText type="small" numberOfLines={2} style={styles.flex}>
                    {spot.label ?? `${spot.lat.toFixed(4)}, ${spot.lng.toFixed(4)}`}
                  </ThemedText>
                  <Pressable onPress={() => setSpot(null)} hitSlop={8}>
                    <Ionicons name="close" size={16} color={colors.textSecondary} />
                  </Pressable>
                </View>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => onLongPressMap(spot)}
                  style={({ pressed }) => [
                    styles.spotAdd,
                    { backgroundColor: colors.accent, opacity: pressed ? 0.85 : 1 },
                  ]}>
                  <Ionicons name={pickMode ? 'checkmark' : 'add'} size={18} color="#fff" />
                  <ThemedText type="smallBold" style={styles.spotAddText}>
                    {pickMode ? 'Use this location' : 'Add reminder here'}
                  </ThemedText>
                </Pressable>
              </View>
            )}

            {!spot && results.length === 0 && !notFound && (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Pin my current location"
                onPress={pinMyLocation}
                style={({ pressed }) => [
                  styles.myLocBtn,
                  {
                    backgroundColor: colors.card,
                    borderColor: colors.border,
                    opacity: pressed ? 0.7 : 1,
                  },
                ]}>
                {locating ? (
                  <ActivityIndicator size="small" color={colors.accent} />
                ) : (
                  <Ionicons name="navigate" size={15} color={colors.accent} />
                )}
                <ThemedText type="smallBold" style={{ color: colors.accent }}>
                  {locating ? 'Getting your location…' : 'Use my current location'}
                </ThemedText>
              </Pressable>
            )}

            {resultsList}
            {searchBox}
          </View>
          {sideButtons}
        </Animated.View>
      ) : !searchable ? (
        <View style={styles.locateCorner}>{sideButtons}</View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  containerFull: { flex: 1, overflow: 'hidden' },
  flex: { flex: 1 },
  fallback: {
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  pinHit: { padding: 8, alignItems: 'center', justifyContent: 'center' },
  pinStack: { alignItems: 'center' },
  meHalo: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: LIVE_COLOR + '38',
    alignItems: 'center',
    justifyContent: 'center',
  },
  meDot: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 3,
    borderColor: '#fff',
    backgroundColor: LIVE_COLOR,
  },
  pinLabel: {
    height: PIN_LABEL_HEIGHT,
    maxWidth: 140,
    paddingHorizontal: 8,
    borderRadius: PIN_LABEL_HEIGHT / 2,
    borderWidth: StyleSheet.hairlineWidth,
    justifyContent: 'center',
  },
  pinLabelText: { fontSize: 11, lineHeight: 14, fontWeight: '600' },
  pinSpacer: { height: PIN_LABEL_HEIGHT },
  pin: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 3,
  },
  pinActive: { width: 24, height: 24, borderRadius: 12, borderWidth: 4 },
  roundBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeBtn: { position: 'absolute', left: 12 },
  centerWrap: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bottomBar: {
    position: 'absolute',
    left: 12,
    right: 12,
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
  },
  bottomLeft: { flex: 1, gap: 8 },
  myLocBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 7,
    height: 38,
    borderRadius: 19,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 14,
  },
  spotCard: {
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 12,
    gap: 10,
  },
  spotHead: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  spotAdd: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    height: 40,
    borderRadius: 10,
  },
  spotAddText: { color: '#fff' },
  cardActions: { flexDirection: 'row', gap: 8 },
  cardBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    height: 40,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    height: 40,
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 14,
  },
  searchInput: { flex: 1, fontSize: 15, height: '100%' },
  results: {
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
    maxHeight: 220,
  },
  resultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  resultText: { flex: 1, gap: 2 },
  resultTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  hint: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    alignSelf: 'flex-start',
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  cornerBtn: {
    position: 'absolute',
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  locateCorner: { position: 'absolute', right: 10, bottom: 10 },
  sideButtons: { gap: 8 },
  // Ionicons "navigate" points up-right; turn it so the tip points north.
  compassIcon: { transform: [{ rotate: '-45deg' }] },
  expandBtn: { right: 10, top: 10 },
  badge: {
    position: 'absolute',
    top: -4,
    right: -4,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2,
    paddingHorizontal: 3,
    backgroundColor: OFFLINE_COLOR,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { color: '#fff', fontSize: 10, lineHeight: 12, fontWeight: '700' },
  downloadPill: {
    position: 'absolute',
    alignSelf: 'center',
    maxWidth: '70%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    height: 40,
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 14,
  },
  pickHint: {
    position: 'absolute',
    alignSelf: 'center',
    maxWidth: '78%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
});
