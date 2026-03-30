import { useFocusEffect, router } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  Pressable,
  RefreshControl,
  SafeAreaView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { fetchOutfits, type OutfitSummary } from '../../lib/outfits';
import { useSession } from '../../lib/session';

export default function OutfitsScreen() {
  const { user } = useSession();
  const [outfits, setOutfits] = useState<OutfitSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const loadOutfits = useCallback(
    async (mode: 'initial' | 'refresh' = 'initial') => {
      if (!user) {
        setOutfits([]);
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
        const nextOutfits = await fetchOutfits(user.id);
        setOutfits(nextOutfits);
        setErrorMessage(null);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Unable to load outfits right now.';
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
      loadOutfits();
    }, [loadOutfits])
  );

  if (loading) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.centered}>
          <ActivityIndicator color="#8C5E3C" size="small" />
          <Text style={styles.helperText}>Loading outfits...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <FlatList
        contentContainerStyle={styles.listContent}
        data={outfits}
        keyExtractor={(item) => item.id}
        refreshControl={
          <RefreshControl
            onRefresh={() => {
              loadOutfits('refresh');
            }}
            refreshing={refreshing}
            tintColor="#8C5E3C"
          />
        }
        renderItem={({ item }) => (
          <View style={styles.card}>
            {item.imageUrl ? (
              <Image source={{ uri: item.imageUrl }} style={styles.image} />
            ) : (
              <View style={styles.imageFallback}>
                <Text style={styles.imageFallbackText}>No preview</Text>
              </View>
            )}
            <View style={styles.cardContent}>
              <Text style={styles.cardTitle}>{item.name}</Text>
              <Text style={styles.cardMeta}>{item.itemCount} items</Text>
              {item.occasions.length > 0 ? (
                <Text style={styles.cardDetail}>{item.occasions.join(', ')}</Text>
              ) : null}
              {item.tags.length > 0 ? (
                <Text style={styles.cardDetail}>Tags: {item.tags.join(', ')}</Text>
              ) : null}
            </View>
          </View>
        )}
        ListHeaderComponent={
          <View style={styles.header}>
            <Text style={styles.title}>Outfits</Text>
            <Text style={styles.body}>
              Save looks built from your wardrobe items and tag them for real-world use.
            </Text>
            <Pressable onPress={() => router.push('/outfits/new')} style={styles.createButton}>
              <Text style={styles.createButtonText}>Create outfit</Text>
            </Pressable>
            {errorMessage ? <Text style={styles.error}>{errorMessage}</Text> : null}
          </View>
        }
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Text style={styles.emptyTitle}>No outfits yet</Text>
            <Text style={styles.emptyBody}>
              Create your first outfit to start saving complete looks.
            </Text>
          </View>
        }
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
    padding: 24,
    paddingBottom: 40,
    flexGrow: 1,
    gap: 12,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  helperText: {
    color: '#5D534C',
    fontSize: 15,
  },
  header: {
    marginBottom: 18,
  },
  title: {
    color: '#201A17',
    fontSize: 30,
    fontWeight: '700',
    marginBottom: 12,
  },
  body: {
    color: '#5D534C',
    fontSize: 16,
    lineHeight: 24,
  },
  createButton: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: '#201A17',
    borderRadius: 16,
    marginTop: 18,
    paddingHorizontal: 18,
    paddingVertical: 14,
  },
  createButtonText: {
    color: '#F7F1EB',
    fontSize: 15,
    fontWeight: '700',
  },
  error: {
    color: '#A13737',
    fontSize: 14,
    lineHeight: 20,
    marginTop: 12,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderColor: '#E7D8CA',
    borderRadius: 18,
    borderWidth: 1,
    overflow: 'hidden',
  },
  image: {
    height: 180,
    width: '100%',
  },
  imageFallback: {
    alignItems: 'center',
    backgroundColor: '#EFE6DE',
    height: 180,
    justifyContent: 'center',
    width: '100%',
  },
  imageFallbackText: {
    color: '#8E837A',
    fontSize: 14,
    fontWeight: '600',
  },
  cardContent: {
    padding: 18,
  },
  cardTitle: {
    color: '#201A17',
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 6,
  },
  cardMeta: {
    color: '#6B615A',
    fontSize: 15,
  },
  cardDetail: {
    color: '#8C5E3C',
    fontSize: 14,
    marginTop: 6,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 48,
  },
  emptyTitle: {
    color: '#201A17',
    fontSize: 22,
    fontWeight: '700',
    marginBottom: 10,
  },
  emptyBody: {
    color: '#5D534C',
    fontSize: 15,
    lineHeight: 22,
    maxWidth: 280,
    textAlign: 'center',
  },
});
