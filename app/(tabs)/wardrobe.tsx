import { useFocusEffect } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  RefreshControl,
  SafeAreaView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { useSession } from '../../lib/session';
import { type ClothingItem, fetchWardrobeItems } from '../../lib/wardrobe';

export default function WardrobeScreen() {
  const { user } = useSession();
  const [items, setItems] = useState<ClothingItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const loadItems = async (mode: 'initial' | 'refresh' = 'initial') => {
    if (!user) {
      setItems([]);
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
      const { items: nextItems } = await fetchWardrobeItems(user.id);
      setItems(nextItems);
      setErrorMessage(null);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unable to load your wardrobe right now.';
      setErrorMessage(message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useFocusEffect(() => {
    loadItems();
  });

  if (loading) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.centered}>
          <ActivityIndicator color="#8C5E3C" size="small" />
          <Text style={styles.loadingText}>Loading your wardrobe...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <FlatList
        contentContainerStyle={styles.listContent}
        data={items}
        keyExtractor={(item) => item.id}
        refreshControl={
          <RefreshControl
            onRefresh={() => {
              loadItems('refresh');
            }}
            refreshing={refreshing}
            tintColor="#8C5E3C"
          />
        }
        renderItem={({ item }) => (
          <View style={styles.card}>
            {item.imageUrl ? (
              <Image source={{ uri: item.imageUrl }} style={styles.itemImage} />
            ) : (
              <View style={styles.imageFallback}>
                <Text style={styles.imageFallbackText}>No image</Text>
              </View>
            )}
            <Text style={styles.itemName}>{item.name}</Text>
            <Text style={styles.itemMeta}>
              {item.color?.trim() ? item.color : 'Color not set'}
            </Text>
          </View>
        )}
        ListHeaderComponent={
          <View style={styles.header}>
            <Text style={styles.title}>Wardrobe</Text>
            <Text style={styles.body}>
              A simple live list of your latest clothing items from Supabase.
            </Text>
            {errorMessage ? <Text style={styles.error}>{errorMessage}</Text> : null}
          </View>
        }
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Text style={styles.emptyTitle}>No items yet</Text>
            <Text style={styles.emptyBody}>
              Add your first piece from the Add Item tab and it will show up here.
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
  loadingText: {
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
  itemImage: {
    backgroundColor: '#EFE6DE',
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
  itemName: {
    color: '#201A17',
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 6,
    paddingHorizontal: 18,
    paddingTop: 16,
  },
  itemMeta: {
    color: '#6B615A',
    fontSize: 15,
    paddingBottom: 18,
    paddingHorizontal: 18,
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
