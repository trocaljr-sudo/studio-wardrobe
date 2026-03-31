import { useFocusEffect, router } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  RefreshControl,
  SafeAreaView,
  SectionList,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { fetchEvents, type EventSummary } from '../../lib/events';
import { useSession } from '../../lib/session';

function formatEventDate(date: string | null, time: string | null) {
  if (!date) {
    return 'Date not set';
  }

  const baseDate = new Date(`${date}T12:00:00`);
  if (Number.isNaN(baseDate.getTime())) {
    return date;
  }

  const dateLabel = baseDate.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

  return time ? `${dateLabel} at ${time}` : dateLabel;
}

export default function EventsScreen() {
  const { user } = useSession();
  const [events, setEvents] = useState<EventSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const loadEvents = useCallback(
    async (mode: 'initial' | 'refresh' = 'initial') => {
      if (!user) {
        setEvents([]);
        setLoading(false);
        setRefreshing(false);
        return;
      }

      if (mode === 'refresh') {
        setRefreshing(true);
      } else {
        setLoading(true);
      }

      try {
        const nextEvents = await fetchEvents(user.id);
        setEvents(nextEvents);
        setErrorMessage(null);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Unable to load events right now.';
        setErrorMessage(message);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [user]
  );

  useFocusEffect(
    useCallback(() => {
      loadEvents();
    }, [loadEvents])
  );

  const sections = useMemo(() => {
    const upcoming = events.filter((event) => !event.isPast);
    const past = events.filter((event) => event.isPast);

    return [
      { title: 'Upcoming', data: upcoming },
      { title: 'Past', data: past },
    ].filter((section) => section.data.length > 0);
  }, [events]);

  if (loading) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.centered}>
          <ActivityIndicator color="#8C5E3C" size="small" />
          <Text style={styles.helperText}>Loading events...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <SectionList
        contentContainerStyle={styles.listContent}
        keyExtractor={(item) => String(item.id)}
        refreshControl={
          <RefreshControl
            onRefresh={() => {
              loadEvents('refresh');
            }}
            refreshing={refreshing}
            tintColor="#8C5E3C"
          />
        }
        renderItem={({ item }) => (
          <Pressable onPress={() => router.push(`/events/${item.id}`)} style={styles.card}>
            {item.outfit?.imageUrl ? (
              <Image source={{ uri: item.outfit.imageUrl }} style={styles.image} />
            ) : (
              <View style={styles.imageFallback}>
                <Text style={styles.imageFallbackText}>No look yet</Text>
              </View>
            )}
            <View style={styles.cardContent}>
              <Text style={styles.cardTitle}>{item.title}</Text>
              <Text style={styles.cardMeta}>
                {formatEventDate(item.scheduledDate, item.scheduledTime)}
              </Text>
              {item.occasion ? (
                <Text style={styles.cardDetail}>Occasion: {item.occasion.name}</Text>
              ) : null}
              {item.outfit ? (
                <Text style={styles.cardDetail}>Planned look: {item.outfit.name}</Text>
              ) : (
                <Text style={styles.cardDetailMuted}>No outfit assigned yet</Text>
              )}
            </View>
          </Pressable>
        )}
        renderSectionHeader={({ section }) => (
          <Text style={styles.sectionTitle}>{section.title}</Text>
        )}
        sections={sections}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Text style={styles.emptyTitle}>
              {errorMessage ? 'Events need another try' : 'No events planned yet'}
            </Text>
            <Text style={styles.emptyBody}>
              {errorMessage
                ? errorMessage
                : 'Add an event to map a real date or occasion to one of your saved outfits.'}
            </Text>
            <Pressable onPress={() => router.push('/events/new')} style={styles.emptyButton}>
              <Text style={styles.emptyButtonText}>
                {errorMessage ? 'Try creating an event' : 'Create your first event'}
              </Text>
            </Pressable>
          </View>
        }
        ListHeaderComponent={
          <View style={styles.header}>
            <Text style={styles.title}>Events</Text>
            <Text style={styles.body}>
              Plan what you want to wear for upcoming moments and keep your styling calendar in one place.
            </Text>
            <Pressable onPress={() => router.push('/events/new')} style={styles.primaryButton}>
              <Text style={styles.primaryButtonText}>Create event</Text>
            </Pressable>
          </View>
        }
        stickySectionHeadersEnabled={false}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#F6F1EA',
  },
  listContent: {
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 32,
    gap: 16,
  },
  header: {
    gap: 12,
    marginBottom: 12,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#201A17',
  },
  body: {
    fontSize: 15,
    lineHeight: 22,
    color: '#5E534A',
  },
  primaryButton: {
    alignSelf: 'flex-start',
    backgroundColor: '#8C5E3C',
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 14,
  },
  primaryButtonText: {
    color: '#FFF8F1',
    fontWeight: '700',
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#3B2F2A',
    marginBottom: 10,
    marginTop: 8,
  },
  card: {
    backgroundColor: '#FFFCF7',
    borderRadius: 22,
    borderWidth: 1,
    borderColor: '#E7D8CA',
    overflow: 'hidden',
    marginBottom: 14,
  },
  image: {
    width: '100%',
    height: 170,
    backgroundColor: '#E9DED4',
  },
  imageFallback: {
    width: '100%',
    height: 170,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#EDE4DB',
  },
  imageFallbackText: {
    color: '#7A6E66',
    fontWeight: '600',
  },
  cardContent: {
    padding: 16,
    gap: 6,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#201A17',
  },
  cardMeta: {
    color: '#6A6058',
    fontSize: 14,
  },
  cardDetail: {
    color: '#4E443C',
    fontSize: 14,
  },
  cardDetailMuted: {
    color: '#8B8178',
    fontSize: 14,
  },
  emptyState: {
    paddingTop: 48,
    alignItems: 'center',
    gap: 10,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#2C221E',
    textAlign: 'center',
  },
  emptyBody: {
    color: '#6A6058',
    textAlign: 'center',
    lineHeight: 21,
  },
  emptyButton: {
    alignItems: 'center',
    backgroundColor: '#201A17',
    borderRadius: 14,
    marginTop: 14,
    paddingHorizontal: 18,
    paddingVertical: 12,
  },
  emptyButtonText: {
    color: '#F7F1EB',
    fontSize: 14,
    fontWeight: '700',
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  helperText: {
    color: '#6A6058',
  },
});
