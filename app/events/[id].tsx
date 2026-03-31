import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
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

import { deleteEvent, fetchEventDetail, updateEvent } from '../../lib/events';
import { fetchOccasions, fetchOutfits, type Occasion, type OutfitSummary } from '../../lib/outfits';
import { fetchEventRecommendations, type RecommendedOutfit } from '../../lib/recommendations';
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

function formatEventDate(date: string | null, time: string | null) {
  if (!date) {
    return 'Date not set';
  }

  const candidate = new Date(`${date}T12:00:00`);
  if (Number.isNaN(candidate.getTime())) {
    return date;
  }

  const dateLabel = candidate.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

  return time ? `${dateLabel} at ${time}` : dateLabel;
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

export default function EventDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const eventId = Number(id);
  const { user } = useSession();
  const [detail, setDetail] = useState<Awaited<ReturnType<typeof fetchEventDetail>> | null>(null);
  const [allOccasions, setAllOccasions] = useState<Occasion[]>([]);
  const [allOutfits, setAllOutfits] = useState<OutfitSummary[]>([]);
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState('');
  const [scheduledDate, setScheduledDate] = useState('');
  const [scheduledTime, setScheduledTime] = useState('');
  const [notes, setNotes] = useState('');
  const [selectedOccasionId, setSelectedOccasionId] = useState<string | null>(null);
  const [selectedOutfitId, setSelectedOutfitId] = useState<string | null>(null);
  const [recommendedOutfits, setRecommendedOutfits] = useState<RecommendedOutfit[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    const loadData = async () => {
      if (!user || Number.isNaN(eventId)) {
        if (mounted) {
          setLoading(false);
        }
        return;
      }

      try {
        const [nextDetail, nextOccasions, nextOutfits, nextRecommendations] = await Promise.all([
          fetchEventDetail(user.id, eventId),
          fetchOccasions(),
          fetchOutfits(user.id),
          fetchEventRecommendations(user.id, eventId),
        ]);

        if (!mounted) {
          return;
        }

        setDetail(nextDetail);
        setAllOccasions(nextOccasions);
        setAllOutfits(nextOutfits);
        setTitle(nextDetail.title);
        setScheduledDate(nextDetail.scheduledDate ?? '');
        setScheduledTime(nextDetail.scheduledTime ?? '');
        setNotes(nextDetail.notes ?? '');
        setSelectedOccasionId(nextDetail.occasion?.id ?? null);
        setSelectedOutfitId(nextDetail.outfit?.id ?? null);
        setRecommendedOutfits(nextRecommendations.recommendations);
      } catch (error) {
        if (!mounted) {
          return;
        }

        const message =
          error instanceof Error ? error.message : 'Unable to load this event right now.';
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
  }, [eventId, user]);

  const resetEditingState = () => {
    if (!detail) {
      return;
    }

    setTitle(detail.title);
    setScheduledDate(detail.scheduledDate ?? '');
    setScheduledTime(detail.scheduledTime ?? '');
    setNotes(detail.notes ?? '');
    setSelectedOccasionId(detail.occasion?.id ?? null);
    setSelectedOutfitId(detail.outfit?.id ?? null);
  };

  const handleSave = async () => {
    if (!user || Number.isNaN(eventId)) {
      setErrorMessage('Sign in again before editing this event.');
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
      await updateEvent({
        eventId,
        userId: user.id,
        title: title.trim(),
        scheduledDate: scheduledDate.trim(),
        scheduledTime: scheduledTime.trim(),
        notes,
        occasionId: selectedOccasionId,
        outfitId: selectedOutfitId,
      });

      const refreshedDetail = await fetchEventDetail(user.id, eventId);
      const refreshedRecommendations = await fetchEventRecommendations(user.id, eventId);
      setDetail(refreshedDetail);
      setRecommendedOutfits(refreshedRecommendations.recommendations);
      setEditing(false);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unable to save changes right now.';
      setErrorMessage(message);
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = () => {
    Alert.alert(
      'Delete event?',
      'This removes the event from your planning timeline.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            if (!user || Number.isNaN(eventId)) {
              return;
            }

            setDeleting(true);
            setErrorMessage(null);

            try {
              await deleteEvent(user.id, eventId);
              router.replace('/(tabs)/events');
            } catch (error) {
              const message =
                error instanceof Error ? error.message : 'Unable to delete this event right now.';
              setErrorMessage(message);
            } finally {
              setDeleting(false);
            }
          },
        },
      ]
    );
  };

  const assignRecommendedOutfit = async (outfitId: string) => {
    if (!user || !detail || Number.isNaN(eventId)) {
      return;
    }

    setSaving(true);
    setErrorMessage(null);

    try {
      await updateEvent({
        eventId,
        userId: user.id,
        title: detail.title,
        scheduledDate: detail.scheduledDate ?? '',
        scheduledTime: detail.scheduledTime ?? '',
        notes: detail.notes ?? '',
        occasionId: detail.occasion?.id ?? null,
        outfitId,
      });

      const [refreshedDetail, refreshedRecommendations] = await Promise.all([
        fetchEventDetail(user.id, eventId),
        fetchEventRecommendations(user.id, eventId),
      ]);
      setDetail(refreshedDetail);
      setRecommendedOutfits(refreshedRecommendations.recommendations);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unable to assign that outfit right now.';
      setErrorMessage(message);
    } finally {
      setSaving(false);
    }
  };

  const sortedOutfits = sortOutfits(allOutfits, selectedOccasionId);

  if (loading) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.centered}>
          <ActivityIndicator color="#8C5E3C" size="small" />
          <Text style={styles.helperText}>Loading event...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!detail) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.centered}>
          <Text style={styles.helperText}>Event not found.</Text>
          <Pressable onPress={() => router.replace('/(tabs)/events')} style={styles.secondaryButton}>
            <Text style={styles.secondaryButtonText}>Back to events</Text>
          </Pressable>
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

          {detail.outfit?.imageUrl ? (
            <Image source={{ uri: detail.outfit.imageUrl }} style={styles.heroImage} />
          ) : (
            <View style={styles.heroPlaceholder}>
              <Text style={styles.heroPlaceholderText}>No outfit assigned</Text>
            </View>
          )}

          {editing ? (
            <>
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
                placeholder="Notes"
                placeholderTextColor="#8B8B95"
                style={[styles.input, styles.textArea]}
                value={notes}
              />
            </>
          ) : (
            <>
              <Text style={styles.title}>{detail.title}</Text>
              <Text style={styles.meta}>
                {formatEventDate(detail.scheduledDate, detail.scheduledTime)}
              </Text>
              {detail.notes ? <Text style={styles.body}>{detail.notes}</Text> : null}
              {detail.created_at ? (
                <Text style={styles.secondaryMeta}>
                  Created {new Date(detail.created_at).toLocaleDateString()}
                </Text>
              ) : null}
            </>
          )}

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Occasion</Text>
            <View style={styles.chipWrap}>
              {editing ? (
                <>
                  <Pressable
                    onPress={() => setSelectedOccasionId(null)}
                    style={[styles.chip, !selectedOccasionId && styles.chipSelected]}
                  >
                    <Text style={[styles.chipText, !selectedOccasionId && styles.chipTextSelected]}>
                      None
                    </Text>
                  </Pressable>
                  {allOccasions.map((occasion) => (
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
                </>
              ) : detail.occasion ? (
                <View style={[styles.chip, styles.chipSelected]}>
                  <Text style={[styles.chipText, styles.chipTextSelected]}>{detail.occasion.name}</Text>
                </View>
              ) : (
                <Text style={styles.helperText}>No occasion assigned.</Text>
              )}
            </View>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Planned outfit</Text>
            {editing ? (
              <>
                <Pressable
                  onPress={() => setSelectedOutfitId(null)}
                  style={[styles.outfitCard, !selectedOutfitId && styles.outfitCardSelected]}
                >
                  <View style={styles.outfitPlaceholderSmall}>
                    <Text style={styles.outfitPlaceholderText}>None</Text>
                  </View>
                  <View style={styles.outfitCopy}>
                    <Text style={styles.outfitName}>No outfit assigned</Text>
                    <Text style={styles.outfitMeta}>Leave this event open-ended for now.</Text>
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
                        <View style={styles.outfitPlaceholderSmall}>
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
              </>
            ) : detail.outfit ? (
              <View style={styles.outfitCardStatic}>
                {detail.outfit.imageUrl ? (
                  <Image source={{ uri: detail.outfit.imageUrl }} style={styles.outfitImage} />
                ) : (
                  <View style={styles.outfitPlaceholderSmall}>
                    <Text style={styles.outfitPlaceholderText}>No preview</Text>
                  </View>
                )}
                <View style={styles.outfitCopy}>
                  <Text style={styles.outfitName}>{detail.outfit.name}</Text>
                  <Text style={styles.outfitMeta}>
                    {detail.outfit.occasions.length > 0
                      ? detail.outfit.occasions.map((occasion) => occasion.name).join(', ')
                      : `${detail.outfit.itemCount} items`}
                  </Text>
                </View>
              </View>
            ) : (
              <Text style={styles.helperText}>No outfit assigned yet.</Text>
            )}
          </View>

          {!editing ? (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Suggested outfits</Text>
              <Text style={styles.body}>
                Ranked by occasion fit, event wording, outfit completeness, and how often the look has already been planned.
              </Text>
              {recommendedOutfits.length > 0 ? (
                recommendedOutfits.map((recommendation) => (
                  <View key={recommendation.outfit.id} style={styles.recommendationCard}>
                    {recommendation.outfit.imageUrl ? (
                      <Image source={{ uri: recommendation.outfit.imageUrl }} style={styles.recommendationImage} />
                    ) : (
                      <View style={styles.outfitPlaceholderSmall}>
                        <Text style={styles.outfitPlaceholderText}>No preview</Text>
                      </View>
                    )}
                    <View style={styles.recommendationCopy}>
                      <Text style={styles.outfitName}>{recommendation.outfit.name}</Text>
                      {recommendation.reasons.map((reason) => (
                        <Text key={`${recommendation.outfit.id}-${reason}`} style={styles.recommendationReason}>
                          {reason}
                        </Text>
                      ))}
                      <Pressable
                        disabled={saving}
                        onPress={() => assignRecommendedOutfit(recommendation.outfit.id)}
                        style={[styles.assignButton, saving && styles.disabledButton]}
                      >
                        <Text style={styles.assignButtonText}>Assign this look</Text>
                      </Pressable>
                    </View>
                  </View>
                ))
              ) : (
                <Text style={styles.helperText}>
                  No strong alternative stands out yet. Adding more occasion-tagged outfits will sharpen these suggestions.
                </Text>
              )}
            </View>
          ) : null}

          {errorMessage ? <Text style={styles.error}>{errorMessage}</Text> : null}

          {!editing ? (
            <Pressable
              onPress={() => router.push(`/style-ai?eventId=${eventId}`)}
              style={styles.styleAiButton}
            >
              <Text style={styles.styleAiButtonText}>Ask Style AI about this event</Text>
            </Pressable>
          ) : null}

          {editing ? (
            <View style={styles.actionRow}>
              <Pressable
                disabled={saving}
                onPress={() => {
                  resetEditingState();
                  setEditing(false);
                }}
                style={styles.secondaryButton}
              >
                <Text style={styles.secondaryButtonText}>Cancel</Text>
              </Pressable>
              <Pressable
                disabled={saving}
                onPress={handleSave}
                style={[styles.primaryButton, saving && styles.disabledButton]}
              >
                <Text style={styles.primaryButtonText}>{saving ? 'Saving...' : 'Save changes'}</Text>
              </Pressable>
            </View>
          ) : (
            <View style={styles.actionRow}>
              <Pressable onPress={() => setEditing(true)} style={styles.secondaryButton}>
                <Text style={styles.secondaryButtonText}>Edit</Text>
              </Pressable>
              <Pressable
                disabled={deleting}
                onPress={confirmDelete}
                style={[styles.deleteButton, deleting && styles.disabledButton]}
              >
                <Text style={styles.deleteButtonText}>{deleting ? 'Deleting...' : 'Delete'}</Text>
              </Pressable>
            </View>
          )}
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
  heroImage: {
    width: '100%',
    height: 220,
    borderRadius: 24,
    backgroundColor: '#E8DDD2',
  },
  heroPlaceholder: {
    width: '100%',
    height: 220,
    borderRadius: 24,
    backgroundColor: '#EDE4DB',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroPlaceholderText: {
    color: '#7A6E66',
    fontWeight: '600',
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#201A17',
  },
  meta: {
    color: '#5E534A',
    fontSize: 15,
  },
  secondaryMeta: {
    color: '#847970',
    fontSize: 13,
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
  outfitCardStatic: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    borderRadius: 20,
    backgroundColor: '#FFFCF7',
    borderWidth: 1,
    borderColor: '#E3D2C4',
    padding: 12,
  },
  outfitImage: {
    width: 84,
    height: 84,
    borderRadius: 14,
    backgroundColor: '#E8DDD2',
  },
  outfitPlaceholderSmall: {
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
  recommendationCard: {
    flexDirection: 'row',
    gap: 14,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#E3D2C4',
    backgroundColor: '#FFFCF7',
    padding: 12,
  },
  recommendationImage: {
    width: 84,
    height: 84,
    borderRadius: 14,
    backgroundColor: '#E8DDD2',
  },
  recommendationCopy: {
    flex: 1,
    gap: 4,
  },
  recommendationReason: {
    color: '#4E443C',
    lineHeight: 19,
  },
  assignButton: {
    alignSelf: 'flex-start',
    marginTop: 6,
    backgroundColor: '#EFE3D6',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
  },
  assignButtonText: {
    color: '#5A361A',
    fontWeight: '700',
  },
  styleAiButton: {
    alignSelf: 'flex-start',
    backgroundColor: '#201A17',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 14,
  },
  styleAiButtonText: {
    color: '#F7F1EB',
    fontWeight: '700',
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
  actionRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
  },
  primaryButton: {
    flex: 1,
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
  secondaryButton: {
    flex: 1,
    borderRadius: 16,
    paddingVertical: 15,
    alignItems: 'center',
    backgroundColor: '#EFE3D6',
  },
  secondaryButtonText: {
    color: '#5A361A',
    fontWeight: '700',
    fontSize: 16,
  },
  deleteButton: {
    flex: 1,
    borderRadius: 16,
    paddingVertical: 15,
    alignItems: 'center',
    backgroundColor: '#F4D9D4',
  },
  deleteButtonText: {
    color: '#A13D30',
    fontWeight: '700',
    fontSize: 16,
  },
  disabledButton: {
    opacity: 0.7,
  },
  error: {
    color: '#A13D30',
    lineHeight: 20,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  helperText: {
    color: '#6A6058',
    textAlign: 'center',
  },
});
