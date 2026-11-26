import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Linking,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Location from 'expo-location';
import AsyncStorage from '@react-native-async-storage/async-storage';

const FAVORITES_KEY = 'restroom-favorites';

type Restroom = {
  id: number;
  name: string;
  address: string;
  lat: number;
  lon: number;
  distance: number;
  accessible: boolean;
  open: boolean;
};

function distanceKm(lat1: number, lon1: number, lat2: number, lon2: number) {
  const earthRadius = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return earthRadius * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export default function HomeScreen() {
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [restrooms, setRestrooms] = useState<Restroom[]>([]);
  const [favorites, setFavorites] = useState<number[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    AsyncStorage.getItem(FAVORITES_KEY).then((value) => {
      if (value) setFavorites(JSON.parse(value));
    });
    locateAndSearch();
  }, []);

  async function locateAndSearch() {
    try {
      setLoading(true);
      setError(null);
      const permission = await Location.requestForegroundPermissionsAsync();
      if (!permission.granted) {
        setError('Location permission is needed to find nearby restrooms.');
        setLoading(false);
        return;
      }

      const location = await Location.getCurrentPositionAsync({});
      const { latitude, longitude } = location.coords;
      const response = await fetch(
        `https://overpass-api.de/api/interpreter?data=${encodeURIComponent(
          `[out:json];nwr[amenity=toilets](around:5000,${latitude},${longitude});out center;`
        )}`
      );
      if (!response.ok) throw new Error('Could not search restroom locations');
      const data = await response.json();

      const results: Restroom[] = (data.elements ?? []).map((item: any) => {
        const lat = item.lat ?? item.center?.lat ?? latitude;
        const lon = item.lon ?? item.center?.lon ?? longitude;
        const tags = item.tags ?? {};
        return {
          id: item.id,
          name: tags.name ?? 'Public restroom',
          address: [tags['addr:housenumber'], tags['addr:street'], tags['addr:city']]
            .filter(Boolean)
            .join(' '),
          lat,
          lon,
          distance: distanceKm(latitude, longitude, lat, lon),
          accessible: tags.wheelchair === 'yes' || tags['toilets:wheelchair'] === 'yes',
          open: tags.opening_hours ? true : false,
        };
      });

      setRestrooms(results.sort((a, b) => a.distance - b.distance));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Something went wrong');
    } finally {
      setLoading(false);
    }
  }

  async function toggleFavorite(id: number) {
    const next = favorites.includes(id)
      ? favorites.filter((favorite) => favorite !== id)
      : [...favorites, id];
    setFavorites(next);
    await AsyncStorage.setItem(FAVORITES_KEY, JSON.stringify(next));
  }

  function openDirections(restroom: Restroom) {
    const label = encodeURIComponent(restroom.name);
    const url = Platform.select({
      ios: `maps://app?daddr=${restroom.lat},${restroom.lon}&q=${label}`,
      android: `geo:${restroom.lat},${restroom.lon}?q=${label}`,
      default: `https://www.google.com/maps/dir/?api=1&destination=${restroom.lat},${restroom.lon}`,
    });
    Linking.openURL(url!);
  }

  const filtered = useMemo(() => {
    const search = query.trim().toLowerCase();
    if (!search) return restrooms;
    return restrooms.filter(
      (restroom) =>
        restroom.name.toLowerCase().includes(search) ||
        restroom.address.toLowerCase().includes(search)
    );
  }, [query, restrooms]);

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.container}>
        <Text style={styles.kicker}>RESTROOM FIND</Text>
        <Text style={styles.title}>Find a restroom near you</Text>
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search by name or street"
          placeholderTextColor="#7A8599"
          style={styles.search}
        />

        {loading ? (
          <View style={styles.center}><ActivityIndicator size="large" color="#4F46E5" /></View>
        ) : error ? (
          <View style={styles.center}>
            <Text style={styles.error}>{error}</Text>
            <Pressable style={styles.retry} onPress={locateAndSearch}><Text style={styles.retryText}>Try again</Text></Pressable>
          </View>
        ) : (
          <FlatList
            data={filtered}
            keyExtractor={(item) => String(item.id)}
            contentContainerStyle={styles.list}
            ListEmptyComponent={<Text style={styles.empty}>No restrooms found within 5 km.</Text>}
            renderItem={({ item }) => (
              <View style={styles.card}>
                <View style={styles.cardHeader}>
                  <View style={styles.cardText}>
                    <Text style={styles.name}>{item.name}</Text>
                    {!!item.address && <Text style={styles.address}>{item.address}</Text>}
                  </View>
                  <Pressable onPress={() => toggleFavorite(item.id)}>
                    <Text style={styles.star}>{favorites.includes(item.id) ? '★' : '☆'}</Text>
                  </Pressable>
                </View>
                <View style={styles.tags}>
                  <Text style={styles.distance}>{item.distance < 1 ? `${Math.round(item.distance * 1000)} m` : `${item.distance.toFixed(1)} km`}</Text>
                  {item.accessible && <Text style={styles.tag}>Accessible</Text>}
                </View>
                <Pressable style={styles.directions} onPress={() => openDirections(item)}>
                  <Text style={styles.directionsText}>Get directions</Text>
                </Pressable>
              </View>
            )}
          />
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F7F8FC' },
  container: { flex: 1, paddingHorizontal: 20, paddingTop: 18 },
  kicker: { color: '#4F46E5', fontWeight: '800', letterSpacing: 1.5, marginBottom: 4 },
  title: { color: '#111827', fontSize: 26, fontWeight: '800', marginBottom: 16 },
  search: { backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 14, paddingHorizontal: 16, height: 52, color: '#111827', marginBottom: 12 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingBottom: 80 },
  list: { gap: 12, paddingBottom: 24 },
  card: { backgroundColor: '#FFFFFF', borderRadius: 18, padding: 16, borderWidth: 1, borderColor: '#E9ECF2' },
  cardHeader: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  cardText: { flex: 1, paddingRight: 12 },
  name: { color: '#111827', fontSize: 17, fontWeight: '700' },
  address: { color: '#6B7280', marginTop: 4 },
  star: { color: '#F59E0B', fontSize: 28, lineHeight: 30 },
  tags: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12 },
  distance: { color: '#4F46E5', fontWeight: '700' },
  tag: { backgroundColor: '#DCFCE7', color: '#166534', borderRadius: 20, overflow: 'hidden', paddingHorizontal: 10, paddingVertical: 5, fontSize: 12, fontWeight: '700' },
  directions: { backgroundColor: '#4F46E5', borderRadius: 12, alignItems: 'center', paddingVertical: 12, marginTop: 14 },
  directionsText: { color: '#FFFFFF', fontWeight: '800' },
  error: { color: '#B91C1C', textAlign: 'center', marginBottom: 12 },
  retry: { backgroundColor: '#111827', borderRadius: 12, paddingHorizontal: 18, paddingVertical: 12 },
  retryText: { color: '#FFFFFF', fontWeight: '700' },
  empty: { color: '#6B7280', textAlign: 'center', marginTop: 40 },
});
