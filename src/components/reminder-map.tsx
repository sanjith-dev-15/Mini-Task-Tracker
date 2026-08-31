import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import {
  Camera,
  type CameraRef,
  Map,
  Marker,
  UserLocation,
} from '@maplibre/maplibre-react-native';
import { useEffect, useRef, useState } from 'react';
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

import { ThemedText } from '@/components/themed-text';
import { formatDue, isOverdue } from '@/lib/reminder-dates';
import { useThemeContext } from '@/lib/theme';
import type { Reminder, ReminderLocation } from '@/lib/reminders';

/** OpenFreeMap — hosted vector tiles, no API key, no usage limits. */
const STYLE_URL = {
  // `bright` carries more POI labels / building detail than `liberty`.
  light: 'https://tiles.openfreemap.org/styles/bright',
  dark: 'https://tiles.openfreemap.org/styles/dark',
};

/** Fallback camera when nothing is pinned and location is unavailable. */
const DEFAULT_CENTER: [number, number] = [78.9629, 20.5937]; // India
const DEFAULT_ZOOM = 3.5;
const PIN_ZOOM = 13;

export type LatLng = { lat: number; lng: number };

/**
 * Photon (photon.komoot.io) — OpenStreetMap geocoder built for type-ahead
 * search. Free, no API key. `lat`/`lon` bias results toward the map centre.
 */
const PHOTON_SEARCH = 'https://photon.komoot.io/api/';
const PHOTON_REVERSE = 'https://photon.komoot.io/reverse/';

/** One row in the search autocomplete list. */
type Suggestion = {
  key: string;
  /** Place name (primary line). */
  name: string;
  /** Humanised OSM category, e.g. "Cafe" — or null. */
  category: string | null;
  /** Full one-line address (secondary line). */
  address: string;
  lat: number;
  lng: number;
};

const str = (v: unknown): string | null =>
  typeof v === 'string' && v.trim() ? v.trim() : null;

/** Humanise a Photon `osm_value`/`osm_key` (e.g. `fast_food` → "Fast food"). */
function categoryLabel(p: Record<string, unknown>): string | null {
  const raw = (str(p.osm_value) && p.osm_value !== 'yes' ? str(p.osm_value) : null) ?? str(p.osm_key);
  if (!raw) return null;
  const s = raw.replace(/_/g, ' ');
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Assemble a single-line address from a Photon feature's properties. */
function addressLine(p: Record<string, unknown>): string {
  const houseStreet = [str(p.housenumber), str(p.street)].filter(Boolean).join(' ');
  return [houseStreet || null, str(p.city) ?? str(p.county), str(p.postcode), str(p.state), str(p.country)]
    .filter((x): x is string => x != null)
    .filter((x, i, a) => a.indexOf(x) === i)
    .join(', ');
}

function placeName(p: Record<string, unknown>): string {
  return str(p.name) ?? str(p.street) ?? str(p.city) ?? str(p.state) ?? str(p.country) ?? 'Unknown place';
}

function toSuggestion(f: GeoJSON.Feature, i: number): Suggestion | null {
  const c = (f.geometry as GeoJSON.Point | undefined)?.coordinates;
  if (!Array.isArray(c) || c.length < 2) return null;
  const p = (f.properties ?? {}) as Record<string, unknown>;
  return {
    key: `${(p as { osm_id?: number }).osm_id ?? 'x'}-${i}`,
    name: placeName(p),
    category: categoryLabel(p),
    address: addressLine(p),
    lat: c[1],
    lng: c[0],
  };
}

/** Reverse-geocode a coordinate to a one-line address (or undefined). */
async function reverseGeocode(lat: number, lng: number): Promise<string | undefined> {
  try {
    const res = await fetch(`${PHOTON_REVERSE}?lon=${lng}&lat=${lat}`);
    const data: { features?: GeoJSON.Feature[] } = await res.json();
    const p = (data.features?.[0]?.properties ?? {}) as Record<string, unknown>;
    return addressLine(p) || str(p.name) || undefined;
  } catch {
    return undefined;
  }
}

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
  /** Show the place/address search bar in the top bar. */
  searchable?: boolean;
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
  searchable,
  fullBleed,
  style,
}: Props) {
  const { colors, scheme } = useThemeContext();
  const insets = useSafeAreaInsets();
  const cameraRef = useRef<CameraRef>(null);
  const [locating, setLocating] = useState(false);

  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Suggestion[]>([]);
  const [searching, setSearching] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [spot, setSpot] = useState<ReminderLocation | null>(null);

  /** Reminder whose info card is open (tapped pin). */
  const [selectedId, setSelectedId] = useState<string | null>(null);
  /** Coordinate being reverse-geocoded after a long-press. */
  const [dropAt, setDropAt] = useState<[number, number] | null>(null);

  /** User's location `[lng, lat]` once known — used for result distances. */
  const [userLoc, setUserLoc] = useState<[number, number] | null>(null);

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
        zoom: PIN_ZOOM,
        duration: 700,
      });
    } catch {
      // ignore — leave the camera where it is
    } finally {
      setLocating(false);
    }
  };

  const fetchSuggestions = async (q: string) => {
    const reqId = ++reqRef.current;
    setSearching(true);
    try {
      const bias = centerRef.current ?? initialViewState.center;
      const url =
        PHOTON_SEARCH +
        '?limit=5&lang=en&q=' +
        encodeURIComponent(q) +
        (bias ? `&lon=${bias[0]}&lat=${bias[1]}` : '');
      const res = await fetch(url);
      const data: { features?: GeoJSON.Feature[] } = await res.json();
      if (reqId !== reqRef.current) return; // a newer keystroke superseded this
      const next = (data.features ?? [])
        .map(toSuggestion)
        .filter((s): s is Suggestion => s != null);
      setResults(next);
      setNotFound(next.length === 0);
    } catch {
      if (reqId === reqRef.current) {
        setResults([]);
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
        style={StyleSheet.absoluteFill}
        mapStyle={scheme === 'dark' ? STYLE_URL.dark : STYLE_URL.light}
        logo={false}
        attributionPosition={searchable ? { top: 8, right: 8 } : { bottom: 6, left: 6 }}
        onPress={() => {
          Keyboard.dismiss();
          setSelectedId(null);
        }}
        onRegionDidChange={(e) => {
          const c = e.nativeEvent.center;
          if (Array.isArray(c) && c.length >= 2) centerRef.current = [c[0], c[1]];
        }}
        onLongPress={(e) => {
          const [lng, lat] = e.nativeEvent.lngLat;
          handleLongPress(lat, lng);
        }}>
        <Camera ref={cameraRef} initialViewState={initialViewState} />
        <UserLocation />

        {located.map((r) => {
          const loc = r.location!;
          const active = r.id === selectedId;
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

      {searchable && !selected ? (
        <Animated.View style={[styles.bottomBar, bottomBarStyle]} pointerEvents="box-none">
          <View style={styles.bottomLeft}>
            {notFound && (
              <View
                style={[styles.hint, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <ThemedText type="small" themeColor="textSecondary">
                  No place found for “{query.trim()}”
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
                  <Ionicons name="add" size={18} color="#fff" />
                  <ThemedText type="smallBold" style={styles.spotAddText}>
                    Add reminder here
                  </ThemedText>
                </Pressable>
              </View>
            )}

            {resultsList}
            {searchBox}
          </View>
          {locateButton}
        </Animated.View>
      ) : !searchable ? (
        <View style={[styles.cornerBtn, styles.locateCorner]}>{locateButton}</View>
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
  locateCorner: { right: 10, bottom: 10 },
  expandBtn: { right: 10, top: 10 },
});
