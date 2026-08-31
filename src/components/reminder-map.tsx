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
import { useThemeContext } from '@/lib/theme';
import type { Reminder, ReminderLocation } from '@/lib/reminders';

/** OpenFreeMap — hosted vector tiles, no API key, no usage limits. */
const STYLE_URL = {
  light: 'https://tiles.openfreemap.org/styles/liberty',
  dark: 'https://tiles.openfreemap.org/styles/dark',
};

/** Fallback camera when nothing is pinned and location is unavailable. */
const DEFAULT_CENTER: [number, number] = [78.9629, 20.5937]; // India
const DEFAULT_ZOOM = 3.5;
const PIN_ZOOM = 13;

export type LatLng = { lat: number; lng: number };

/** One row in the search autocomplete list. */
type Suggestion = {
  key: string;
  /** Primary line — the place name. */
  label: string;
  /** Secondary line — street / city / region. */
  sub: string;
  lat: number;
  lng: number;
};

/**
 * Photon (photon.komoot.io) — OpenStreetMap geocoder built for type-ahead
 * search. Free, no API key. `lat`/`lon` bias results toward the map centre.
 */
const PHOTON_URL = 'https://photon.komoot.io/api/';

/** Turn a Photon feature's properties into the two label lines. */
function describePlace(p: Record<string, unknown>): { label: string; sub: string } {
  const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null);
  const label =
    str(p.name) ?? str(p.street) ?? str(p.city) ?? str(p.state) ?? str(p.country) ?? 'Unknown place';
  const sub = [str(p.street), str(p.city), str(p.state), str(p.country)]
    .filter((x): x is string => x != null && x !== label)
    .filter((x, i, a) => a.indexOf(x) === i)
    .join(', ');
  return { label, sub };
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

  /** Last known map centre `[lng, lat]`, used to bias search results. */
  const centerRef = useRef<[number, number] | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Monotonic id so a slow response from an earlier keystroke is ignored. */
  const reqRef = useRef(0);

  useEffect(
    () => () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    },
    [],
  );

  // Keep the bottom search bar above the keyboard when it opens.
  const kb = useAnimatedKeyboard();
  const bottomBarStyle = useAnimatedStyle(() => ({
    bottom: Math.max(kb.height.value, insets.bottom) + 12,
  }));

  const located = reminders.filter((r) => r.location != null);
  const first = located[0]?.location;
  const initialViewState = first
    ? { center: [first.lng, first.lat] as [number, number], zoom: PIN_ZOOM }
    : { center: DEFAULT_CENTER, zoom: DEFAULT_ZOOM };

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
        PHOTON_URL +
        '?limit=5&lang=en&q=' +
        encodeURIComponent(q) +
        (bias ? `&lon=${bias[0]}&lat=${bias[1]}` : '');
      const res = await fetch(url);
      const data: { features?: GeoJSON.Feature[] } = await res.json();
      if (reqId !== reqRef.current) return; // a newer keystroke superseded this
      const next: Suggestion[] = (data.features ?? [])
        .map((f, i): Suggestion | null => {
          const c = (f.geometry as GeoJSON.Point | undefined)?.coordinates;
          if (!Array.isArray(c) || c.length < 2) return null;
          const { label, sub } = describePlace((f.properties ?? {}) as Record<string, unknown>);
          return { key: `${(f.properties as { osm_id?: number })?.osm_id ?? 'x'}-${i}`, label, sub, lng: c[0], lat: c[1] };
        })
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
    setQuery(s.label);
    const found: ReminderLocation = {
      lat: s.lat,
      lng: s.lng,
      label: s.sub ? `${s.label}, ${s.sub}` : s.label,
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

  const locateButton = (
    <Pressable
      accessibilityLabel="Center on my location"
      onPress={goToMyLocation}
      style={({ pressed }) => [
        styles.roundBtn,
        { backgroundColor: colors.card, borderColor: colors.border, opacity: pressed ? 0.7 : 1 },
      ]}>
      <Ionicons
        name={locating ? 'ellipsis-horizontal' : 'locate'}
        size={18}
        color={colors.accent}
      />
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
        {results.map((s, i) => (
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
              <ThemedText type="small" numberOfLines={1}>
                {s.label}
              </ThemedText>
              {s.sub ? (
                <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
                  {s.sub}
                </ThemedText>
              ) : null}
            </View>
          </Pressable>
        ))}
      </ScrollView>
    </View>
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
        onPress={() => Keyboard.dismiss()}
        onRegionDidChange={(e) => {
          const c = e.nativeEvent.center;
          if (Array.isArray(c) && c.length >= 2) centerRef.current = [c[0], c[1]];
        }}
        onLongPress={(e) => {
          const [lng, lat] = e.nativeEvent.lngLat;
          onLongPressMap({ lat, lng });
        }}>
        <Camera ref={cameraRef} initialViewState={initialViewState} />
        <UserLocation />

        {located.map((r) => {
          const loc = r.location!;
          return (
            <Marker key={r.id} id={r.id} lngLat={[loc.lng, loc.lat]} onPress={() => onPressPin(r.id)}>
              <View style={styles.pinHit}>
                <View
                  style={[
                    styles.pin,
                    {
                      backgroundColor: r.done ? colors.textSecondary : colors.accent,
                      borderColor: colors.card,
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
      </Map>

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

      {searchable ? (
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
                  <ThemedText type="small" numberOfLines={2} style={styles.spotLabel}>
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
      ) : (
        <View style={[styles.cornerBtn, styles.locateCorner]}>{locateButton}</View>
      )}
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
  roundBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeBtn: { position: 'absolute', left: 12 },
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
  spotLabel: { flex: 1 },
  spotAdd: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    height: 40,
    borderRadius: 10,
  },
  spotAddText: { color: '#fff' },
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
  resultText: { flex: 1 },
  hint: {
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
