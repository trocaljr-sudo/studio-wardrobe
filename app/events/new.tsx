import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { createEvent } from '../../lib/events';
import { fetchOccasions, fetchOutfits, type Occasion, type OutfitSummary } from '../../lib/outfits';
import { useSession } from '../../lib/session';

function isValidDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const candidate = new Date(`${value}T12:00:00`);
  return !Number.isNaN(candidate.getTime());
}

function isValidTime(value: string) {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

function sortOutfits(outfits: OutfitSummary[], occasionId: string | null) {
  return [...outfits].sort((left, right) => {
    const leftMatch = occasionId
      ? left.occasions.some((occasion) => occasion.id === occasionId)
      : false;
    const rightMatch = occasionId
      ? right.occasions.some((occasion) => occasion.id === occasionId)
      : false;

    if (leftMatch && !rightMatch) {
      return -1;
    }

    if (!leftMatch && rightMatch) {
      return 1;
    }

    return left.name.localeCompare(right.name);
  });
}

export default function NewEventScreen() {
  const { user } = useSession();
  const [title, setTitle] = useState('');
  const [scheduledDate, setScheduledDate] = useState('');
  const [scheduledTime, setScheduledTime] = useState('');
  const [notes, setNotes] = useState('');
  const [occasions, setOccasions] = useState<Occasion[]>([]);
  const [outfits, setOutfits] = useState<OutfitSummary[]>([]);
  const [selectedOccasionId, setSelectedOccasionId] = useState<string | null>(null);
  const [selectedOutfitId, setSelectedOutfitId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    const loadData = async () => {
      if (!user) {
        if (mounted) {
          setLoading(false);
        }
        return;
      }

      try {
        const [nextOccasions, nextOutfits] = await Promise.all([
          fetchOccasions(),
          fetchOutfits(user.id),
        ]);

        if (!mounted) {
          return;
        }

        setOccasions(nextOccasions);
        setOutfits(nextOutfits);
      } catch (error) {
        if (!mounted) {
          return;
        }

        const message =
          error instanceof Error ? error.message : 'Unable to load event planning right now.';
        setErrorMessage(message);
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    };

    loadData();

    return () => {
      mounted = false;
    };
  }, [user]);

  const handleSave = async () => {
    if (!user) {
      setErrorMessage('Sign in again before creating an event.');
      return;
    }

    if (!title.trim()) {
      setErrorMessage('Add an event title before saving.');
      return;
    }

    if (!isValidDate(scheduledDate.trim())) {
      setErrorMessage('Enter the date as YYYY-MM-DD.');
      return;
    }

    if (scheduledTime.trim() && !isValidTime(scheduledTime.trim())) {
      setErrorMessage('Use 24-hour time like 18:30 or leave it blank.');
      return;
    }

    setSaving(true);
    setErrorMessage(null);

    try {
      await createEvent({
        userId: user.id,
        title: title.trim(),
        scheduledDate: scheduledDate.trim(),
        scheduledTime: scheduledTime.trim(),
        notes,
        occasionId: selectedOccasionId,
        outfitId: selectedOutfitId,
      });

      router.replace('/(tabs)/events');
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unable to save this event right now.';
      setErrorMessage(message);
    } finally {
      setSaving(false);
    }
  };

  const sortedOutfits = sortOutfits(outfits, selectedOccasionId);

  if (loading) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.centered}>
          <ActivityIndicator color="#8C5E3C" size="small" />
          <Text style={styles.helperText}>Loading event planner...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        behavior={Platform.select({ ios: 'padding', android: undefined })}
        style={styles.container}
      >
        <ScrollView contentContainerStyle={styles.content}>
          <Pressable onPress={() => router.back()} style={styles.backButton}>
            <Text style={styles.backText}>Back</Text>
          </Pressable>

          <Text style={styles.title}>Create Event</Text>
          <Text style={styles.body}>
            Add the date first, then optionally connect one of your outfits to the plan.
          </Text>

          <TextInput
            onChangeText={setTitle}
            placeholder="Event title"
            placeholderTextColor="#8B8B95"
            style={styles.input}
            value={title}
          />
          <TextInput
            autoCapitalize="none"
            onChangeText={setScheduledDate}
            placeholder="Date (YYYY-MM-DD)"
            placeholderTextColor="#8B8B95"
            style={styles.input}
            value={scheduledDate}
          />
          <TextInput
            autoCapitalize="none"
            onChangeText={setScheduledTime}
            placeholder="Time (optional, HH:MM)"
            placeholderTextColor="#8B8B95"
            style={styles.input}
            value={scheduledTime}
          />
          <TextInput
            multiline
            onChangeText={setNotes}
            placeholder="Notes (optional)"
            placeholderTextColor="#8B8B95"
            style={[styles.input, styles.textArea]}
            value={notes}
          />

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Occasion</Text>
            <View style={styles.chipWrap}>
              <Pressable
                onPress={() => setSelectedOccasionId(null)}
                style={[styles.chip, !selectedOccasionId && styles.chipSelected]}
              >
                <Text style={[styles.chipText, !selectedOccasionId && styles.chipTextSelected]}>
                  None
                </Text>
              </Pressable>
              {occasions.map((occasion) => (
                <Pressable
                  key={occasion.id}
                  onPress={() => setSelectedOccasionId(occasion.id)}
                  style={[styles.chip, selectedOccasionId === occasion.id && styles.chipSelected]}
                >
                  <Text
                    style={[
                      styles.chipText,
                      selectedOccasionId === occasion.id && styles.chipTextSelected,
                    ]}
                  >
                    {occasion.name}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Planned outfit</Text>
            <Pressable
              onPress={() => setSelectedOutfitId(null)}
              style={[styles.outfitCard, !selectedOutfitId && styles.outfitCardSelected]}
            >
              <View style={styles.outfitPlaceholder}>
                <Text style={styles.outfitPlaceholderText}>No outfit yet</Text>
              </View>
              <View style={styles.outfitCopy}>
                <Text style={styles.outfitName}>Choose later</Text>
                <Text style={styles.outfitMeta}>You can attach an outfit after the event is saved.</Text>
              </View>
            </Pressable>

            {sortedOutfits.map((outfit) => {
              const selected = selectedOutfitId === outfit.id;

              return (
                <Pressable
                  key={outfit.id}
                  onPress={() => setSelectedOutfitId(outfit.id)}
                  style={[styles.outfitCard, selected && styles.outfitCardSelected]}
                >
                  {outfit.imageUrl ? (
                    <Image source={{ uri: outfit.imageUrl }} style={styles.outfitImage} />
                  ) : (
                    <View style={styles.outfitPlaceholder}>
                      <Text style={styles.outfitPlaceholderText}>No preview</Text>
                    </View>
                  )}
                  <View style={styles.outfitCopy}>
                    <Text style={styles.outfitName}>{outfit.name}</Text>
                    <Text style={styles.outfitMeta}>
                      {outfit.occasions.length > 0
                        ? outfit.occasions.map((occasion) => occasion.name).join(', ')
                        : `${outfit.itemCount} items`}
                    </Text>
                  </View>
                </Pressable>
              );
            })}
          </View>

          {errorMessage ? <Text style={styles.error}>{errorMessage}</Text> : null}

          <Pressable
            disabled={saving}
            onPress={handleSave}
            style={[styles.primaryButton, saving && styles.disabledButton]}
          >
            <Text style={styles.primaryButtonText}>{saving ? 'Saving...' : 'Save event'}</Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#F6F1EA',
  },
  container: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 40,
    gap: 16,
  },
  backButton: {
    alignSelf: 'flex-start',
    paddingVertical: 6,
  },
  backText: {
    color: '#8C5E3C',
    fontWeight: '600',
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#201A17',
  },
  body: {
    color: '#5E534A',
    lineHeight: 22,
  },
  input: {
    borderWidth: 1,
    borderColor: '#D9C8B7',
    backgroundColor: '#FFFCF8',
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 14,
    color: '#201A17',
    fontSize: 16,
  },
  textArea: {
    minHeight: 110,
    textAlignVertical: 'top',
  },
  section: {
    gap: 12,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#2C221E',
  },
  chipWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  chip: {
    borderWidth: 1,
    borderColor: '#D7C6B7',
    backgroundColor: '#FFFCF7',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 999,
  },
  chipSelected: {
    borderColor: '#8C5E3C',
    backgroundColor: '#E8D8CA',
  },
  chipText: {
    color: '#5D524A',
    fontWeight: '600',
  },
  chipTextSelected: {
    color: '#5A361A',
  },
  outfitCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#E3D2C4',
    backgroundColor: '#FFFCF7',
    padding: 12,
  },
  outfitCardSelected: {
    borderColor: '#8C5E3C',
    backgroundColor: '#F5EADF',
  },
  outfitImage: {
    width: 84,
    height: 84,
    borderRadius: 14,
    backgroundColor: '#E8DDD2',
  },
  outfitPlaceholder: {
    width: 84,
    height: 84,
    borderRadius: 14,
    backgroundColor: '#EDE4DB',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  outfitPlaceholderText: {
    color: '#7A6E66',
    fontWeight: '600',
    textAlign: 'center',
  },
  outfitCopy: {
    flex: 1,
    gap: 4,
  },
  outfitName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#231B17',
  },
  outfitMeta: {
    color: '#6A6058',
    lineHeight: 20,
  },
  error: {
    color: '#A13D30',
    lineHeight: 20,
  },
  primaryButton: {
    backgroundColor: '#8C5E3C',
    borderRadius: 16,
    paddingVertical: 15,
    alignItems: 'center',
  },
  primaryButtonText: {
    color: '#FFF8F1',
    fontWeight: '700',
    fontSize: 16,
  },
  disabledButton: {
    opacity: 0.7,
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
