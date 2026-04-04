import { router, useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AmbientBackground } from '../../lib/ambient-background';
import { fetchEvents } from '../../lib/events';
import { fetchOutfits } from '../../lib/outfits';
import { fetchAppSettings, fetchAppStorageDebug, updateAppSettings, type AppSettings, type AppStorageDebug } from '../../lib/app-settings';
import { fetchPersonalizationSnapshot, updateStyleProfilePreferences, type DerivedStyleProfile, type StyleVibe } from '../../lib/personalization';
import { fetchRecommendations } from '../../lib/recommendations';
import { useSession } from '../../lib/session';
import { supabase } from '../../lib/supabase';
import { type ThemeMode, useTheme } from '../../lib/theme';
import { fetchWardrobeItems } from '../../lib/wardrobe';

type SettingsStats = {
  itemCount: number;
  outfitCount: number;
  eventCount: number;
  favoriteItemCount: number;
  favoriteOutfitCount: number;
  likedOutfitCount: number;
  dislikedOutfitCount: number;
};

function truncateId(value: string | undefined | null) {
  if (!value) {
    return 'Unavailable';
  }

  if (value.length <= 12) {
    return value;
  }

  return `${value.slice(0, 6)}...${value.slice(-4)}`;
}

function formatJoinedDate(value: string | undefined) {
  if (!value) {
    return 'Unknown';
  }

  const candidate = new Date(value);
  if (Number.isNaN(candidate.getTime())) {
    return 'Unknown';
  }

  return candidate.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function countSignals(
  feedback: Record<string, 'like' | 'dislike'>,
  signal: 'like' | 'dislike'
) {
  return Object.values(feedback).filter((value) => value === signal).length;
}

export default function ProfileScreen() {
  const { user } = useSession();
  const { colors, isDark, resolvedTheme, setThemeMode, themeMode } = useTheme();
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [themeLoading, setThemeLoading] = useState(false);
  const [statsLoading, setStatsLoading] = useState(true);
  const [profileLoading, setProfileLoading] = useState(false);
  const [stats, setStats] = useState<SettingsStats>({
    itemCount: 0,
    outfitCount: 0,
    eventCount: 0,
    favoriteItemCount: 0,
    favoriteOutfitCount: 0,
    likedOutfitCount: 0,
    dislikedOutfitCount: 0,
  });
  const [styleSummaryLines, setStyleSummaryLines] = useState<string[]>([]);
  const [styleProfile, setStyleProfile] = useState<DerivedStyleProfile | null>(null);
  const [displayName, setDisplayName] = useState(user?.user_metadata?.full_name ?? '');
  const [appSettings, setAppSettings] = useState<AppSettings>({
    analyticsEnabled: true,
    notificationsEnabled: false,
    weatherAssistEnabled: true,
  });
  const [storageDebug, setStorageDebug] = useState<AppStorageDebug>({
    hasThemePreference: false,
    hasWeatherCache: false,
  });
  const styles = createStyles(colors);

  useFocusEffect(
    useCallback(() => {
      let mounted = true;

      const loadStats = async () => {
        if (!user) {
          if (mounted) {
            setStatsLoading(false);
          }
          return;
        }

        setStatsLoading(true);

        try {
          const [wardrobe, outfits, events, personalization, recommendations, nextAppSettings, nextStorageDebug] = await Promise.all([
            fetchWardrobeItems(user.id),
            fetchOutfits(user.id),
            fetchEvents(user.id),
            fetchPersonalizationSnapshot(user.id),
            fetchRecommendations(user.id),
            fetchAppSettings(),
            fetchAppStorageDebug(),
          ]);

          if (!mounted) {
            return;
          }

          setStats({
            itemCount: wardrobe.items.length,
            outfitCount: outfits.length,
            eventCount: events.length,
            favoriteItemCount: personalization.favoriteItemIds.length,
            favoriteOutfitCount: personalization.favoriteOutfitIds.length,
            likedOutfitCount: countSignals(personalization.outfitFeedback, 'like'),
            dislikedOutfitCount: countSignals(personalization.outfitFeedback, 'dislike'),
          });
          setStyleSummaryLines(recommendations.styleProfile.summaryLines.slice(0, 3));
          setStyleProfile(recommendations.styleProfile);
          setAppSettings(nextAppSettings);
          setStorageDebug(nextStorageDebug);
          setDisplayName(user.user_metadata?.full_name ?? '');
          setErrorMessage(null);
        } catch (error) {
          if (!mounted) {
            return;
          }

          const message =
            error instanceof Error
              ? error.message
              : 'Unable to load your settings details right now.';
          setErrorMessage(message);
        } finally {
          if (mounted) {
            setStatsLoading(false);
          }
        }
      };

      loadStats();

      return () => {
        mounted = false;
      };
    }, [user])
  );

  const handleSignOut = async () => {
    setLoading(true);
    setErrorMessage(null);

    const { error } = await supabase.auth.signOut();
    setLoading(false);

    if (error) {
      setErrorMessage(error.message);
    }
  };

  const handleThemeModeChange = async (mode: ThemeMode) => {
    setThemeLoading(true);
    setErrorMessage(null);

    try {
      await setThemeMode(mode);
    } catch {
      setErrorMessage('Unable to update the appearance setting right now.');
    } finally {
      setThemeLoading(false);
    }
  };

  const handleSaveProfile = async () => {
    setProfileLoading(true);
    setErrorMessage(null);

    try {
      const { error } = await supabase.auth.updateUser({
        data: {
          full_name: displayName.trim() || null,
        },
      });

      if (error) {
        throw error;
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unable to update your profile right now.';
      setErrorMessage(message);
    } finally {
      setProfileLoading(false);
    }
  };

  const handleToggleSetting = async (key: keyof AppSettings) => {
    const nextSettings = {
      ...appSettings,
      [key]: !appSettings[key],
    };

    setAppSettings(nextSettings);

    try {
      await updateAppSettings(nextSettings);
      const nextDebug = await fetchAppStorageDebug();
      setStorageDebug(nextDebug);
    } catch {
      setErrorMessage('Unable to save that setting right now.');
    }
  };

  const handlePreferredVibeChange = async (preferredVibe: StyleVibe | null) => {
    if (!user) {
      return;
    }

    setErrorMessage(null);

    try {
      await updateStyleProfilePreferences(user.id, { preferredVibe });
      const recommendations = await fetchRecommendations(user.id);
      setStyleProfile(recommendations.styleProfile);
      setStyleSummaryLines(recommendations.styleProfile.summaryLines.slice(0, 3));
    } catch {
      setErrorMessage('Unable to update your style direction right now.');
    }
  };

  const accountRows = useMemo(
    () => [
      { label: 'Email', value: user?.email ?? 'Not available' },
      { label: 'Auth', value: 'Email + password' },
      { label: 'Joined', value: formatJoinedDate(user?.created_at) },
      { label: 'User ID', value: truncateId(user?.id) },
    ],
    [user]
  );

  const statCards = [
    { label: 'Items', value: stats.itemCount },
    { label: 'Outfits', value: stats.outfitCount },
    { label: 'Events', value: stats.eventCount },
  ];

  return (
    <SafeAreaView style={styles.safeArea}>
      <AmbientBackground />
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <Text style={styles.title}>Settings</Text>
          <Text style={styles.body}>
            Manage your account, appearance, and the style signals Studio Wardrobe is learning.
          </Text>
        </View>

        <View style={styles.panel}>
          <Text style={styles.sectionTitle}>Profile</Text>
          {accountRows.map((row) => (
            <View key={row.label} style={styles.settingRow}>
              <Text style={styles.settingLabel}>{row.label}</Text>
              <Text style={styles.settingValue}>{row.value}</Text>
            </View>
          ))}
          <View style={styles.editBlock}>
            <Text style={styles.settingLabel}>Display name</Text>
            <TextInput
              onChangeText={setDisplayName}
              placeholder="Add a display name"
              placeholderTextColor={colors.placeholder}
              style={styles.input}
              value={displayName}
            />
            <Pressable
              disabled={profileLoading}
              onPress={handleSaveProfile}
              style={[styles.inlineButton, profileLoading && styles.buttonDisabled]}
            >
              <Text style={styles.inlineButtonText}>
                {profileLoading ? 'Saving...' : 'Save profile'}
              </Text>
            </Pressable>
          </View>
        </View>

        <View style={styles.panel}>
          <View style={styles.panelHeader}>
            <Text style={styles.sectionTitle}>Wardrobe snapshot</Text>
            {statsLoading ? <ActivityIndicator color={colors.accent} size="small" /> : null}
          </View>
          <Text style={styles.helperText}>
            Quick stats for the pieces, outfits, and plans currently in your studio.
          </Text>
          <View style={styles.statsGrid}>
            {statCards.map((card) => (
              <View key={card.label} style={styles.statCard}>
                <Text style={styles.statValue}>{card.value}</Text>
                <Text style={styles.statLabel}>{card.label}</Text>
              </View>
            ))}
          </View>
        </View>

        <View style={styles.panel}>
          <Text style={styles.sectionTitle}>Style profile</Text>
          <Text style={styles.helperText}>
            Favorites and feedback help the recommendation engine understand what feels like you.
          </Text>
          <Text style={styles.settingLabel}>Style direction</Text>
          <View style={styles.vibeRow}>
            {([
              { id: null, label: 'Auto' },
              { id: 'casual', label: 'Casual' },
              { id: 'streetwear', label: 'Streetwear' },
              { id: 'business', label: 'Business' },
            ] as { id: StyleVibe | null; label: string }[]).map((entry) => {
              const selected = (styleProfile?.preferredVibe ?? null) === entry.id;

              return (
                <Pressable
                  key={entry.label}
                  onPress={() => handlePreferredVibeChange(entry.id)}
                  style={[styles.vibeChip, selected && styles.vibeChipActive]}
                >
                  <Text style={[styles.vibeChipText, selected && styles.vibeChipTextActive]}>
                    {entry.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          <View style={styles.preferenceRow}>
            <View style={styles.preferenceChip}>
              <Text style={styles.preferenceValue}>{stats.favoriteItemCount}</Text>
              <Text style={styles.preferenceLabel}>Favorite items</Text>
            </View>
            <View style={styles.preferenceChip}>
              <Text style={styles.preferenceValue}>{stats.favoriteOutfitCount}</Text>
              <Text style={styles.preferenceLabel}>Favorite outfits</Text>
            </View>
          </View>
          <View style={styles.preferenceRow}>
            <View style={styles.preferenceChip}>
              <Text style={styles.preferenceValue}>{stats.likedOutfitCount}</Text>
              <Text style={styles.preferenceLabel}>Liked looks</Text>
            </View>
            <View style={styles.preferenceChip}>
              <Text style={styles.preferenceValue}>{stats.dislikedOutfitCount}</Text>
              <Text style={styles.preferenceLabel}>Skipped looks</Text>
            </View>
          </View>
          {styleSummaryLines.length > 0 ? (
            <View style={styles.summaryBox}>
              {styleSummaryLines.map((line) => (
                <Text key={line} style={styles.summaryText}>
                  {line}
                </Text>
              ))}
            </View>
          ) : null}
          {styleProfile ? (
            <>
              <View style={styles.styleMiniSection}>
                <Text style={styles.settingLabel}>Most-worn colors</Text>
                <View style={styles.vibeRow}>
                  {(styleProfile.preferredColors.length > 0 ? styleProfile.preferredColors : ['Still learning']).map((value) => (
                    <View key={value} style={styles.statPill}>
                      <Text style={styles.statPillText}>{value}</Text>
                    </View>
                  ))}
                </View>
              </View>
              <View style={styles.styleMiniSection}>
                <Text style={styles.settingLabel}>Favorite categories</Text>
                <View style={styles.vibeRow}>
                  {(styleProfile.preferredCategoryNames.length > 0
                    ? styleProfile.preferredCategoryNames
                    : ['Still learning']).map((value) => (
                    <View key={value} style={styles.statPill}>
                      <Text style={styles.statPillText}>{value}</Text>
                    </View>
                  ))}
                </View>
              </View>
            </>
          ) : null}
        </View>

        <View style={styles.panel}>
          <Text style={styles.sectionTitle}>Appearance</Text>
          <Text style={styles.helperText}>
            Current look: {resolvedTheme === 'dark' ? 'Dark mode' : 'Light mode'}
          </Text>
          <View style={styles.themeRow}>
            {(['system', 'light', 'dark'] as ThemeMode[]).map((mode) => {
              const selected = themeMode === mode;
              const label =
                mode === 'system' ? 'Use system' : mode === 'light' ? 'Light' : 'Dark';

              return (
                <Pressable
                  key={mode}
                  disabled={themeLoading}
                  onPress={() => handleThemeModeChange(mode)}
                  style={[styles.themeButton, selected && styles.themeButtonActive]}
                >
                  <Text
                    style={[styles.themeButtonText, selected && styles.themeButtonTextActive]}
                  >
                    {label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        <View style={styles.panel}>
          <Text style={styles.sectionTitle}>Notifications & privacy</Text>
          <Text style={styles.helperText}>
            Keep these lightweight controls local while the account system stays minimal.
          </Text>
          <Pressable onPress={() => handleToggleSetting('notificationsEnabled')} style={styles.toggleRow}>
            <View>
              <Text style={styles.toggleTitle}>Outfit reminders</Text>
              <Text style={styles.toggleBody}>Prepare for event-day reminders later.</Text>
            </View>
            <Text style={styles.toggleValue}>{appSettings.notificationsEnabled ? 'On' : 'Off'}</Text>
          </Pressable>
          <Pressable onPress={() => handleToggleSetting('weatherAssistEnabled')} style={styles.toggleRow}>
            <View>
              <Text style={styles.toggleTitle}>Weather assist</Text>
              <Text style={styles.toggleBody}>Allow local weather to tune outfit suggestions.</Text>
            </View>
            <Text style={styles.toggleValue}>{appSettings.weatherAssistEnabled ? 'On' : 'Off'}</Text>
          </Pressable>
          <Pressable onPress={() => handleToggleSetting('analyticsEnabled')} style={styles.toggleRow}>
            <View>
              <Text style={styles.toggleTitle}>Local usage insights</Text>
              <Text style={styles.toggleBody}>Keep richer on-device intelligence helpers enabled.</Text>
            </View>
            <Text style={styles.toggleValue}>{appSettings.analyticsEnabled ? 'On' : 'Off'}</Text>
          </Pressable>
        </View>

        <View style={styles.panel}>
          <Text style={styles.sectionTitle}>Quick links</Text>
          <Text style={styles.helperText}>
            Jump back into the parts of the app you use most often.
          </Text>
          <View style={styles.linkGrid}>
            <Pressable onPress={() => router.push('/(tabs)/wardrobe')} style={styles.linkCard}>
              <Text style={styles.linkTitle}>Wardrobe</Text>
              <Text style={styles.linkBody}>Browse and manage your closet.</Text>
            </Pressable>
            <Pressable onPress={() => router.push('/(tabs)/outfits')} style={styles.linkCard}>
              <Text style={styles.linkTitle}>Outfits</Text>
              <Text style={styles.linkBody}>Open saved looks and build new ones.</Text>
            </Pressable>
            <Pressable onPress={() => router.push('/(tabs)/events')} style={styles.linkCard}>
              <Text style={styles.linkTitle}>Events</Text>
              <Text style={styles.linkBody}>Plan upcoming looks around your schedule.</Text>
            </Pressable>
            <Pressable onPress={() => router.push('/style-ai')} style={styles.linkCard}>
              <Text style={styles.linkTitle}>Style AI</Text>
              <Text style={styles.linkBody}>Ask for grounded outfit suggestions.</Text>
            </Pressable>
          </View>
        </View>

        <View style={styles.panel}>
          <Text style={styles.sectionTitle}>App</Text>
          <Text style={styles.helperText}>
            {isDark
              ? 'Dark mode keeps the styling studio mood from the original app.'
              : 'Light mode keeps the app bright while preserving the same structure.'}
          </Text>
          <View style={styles.settingRow}>
            <Text style={styles.settingLabel}>Theme in use</Text>
            <Text style={styles.settingValue}>
              {resolvedTheme === 'dark' ? 'Dark' : 'Light'}
            </Text>
          </View>
          <View style={styles.settingRow}>
            <Text style={styles.settingLabel}>Session state</Text>
            <Text style={styles.settingValue}>{user ? 'Signed in' : 'Signed out'}</Text>
          </View>
          <View style={styles.settingRow}>
            <Text style={styles.settingLabel}>Weather cache</Text>
            <Text style={styles.settingValue}>{storageDebug.hasWeatherCache ? 'Available' : 'Empty'}</Text>
          </View>
          <View style={styles.settingRow}>
            <Text style={styles.settingLabel}>Stored theme pref</Text>
            <Text style={styles.settingValue}>{storageDebug.hasThemePreference ? 'Saved' : 'System only'}</Text>
          </View>
        </View>

        {errorMessage ? <Text style={styles.error}>{errorMessage}</Text> : null}

        <Pressable
          disabled={loading}
          onPress={handleSignOut}
          style={[styles.button, loading && styles.buttonDisabled]}
        >
          <Text style={styles.buttonText}>{loading ? 'Signing out...' : 'Sign out'}</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const createStyles = (colors: ReturnType<typeof useTheme>['colors']) =>
  StyleSheet.create({
    safeArea: {
      flex: 1,
      backgroundColor: colors.background,
    },
    content: {
      alignSelf: 'center',
      width: '100%',
      maxWidth: 980,
      paddingHorizontal: 24,
      paddingTop: 18,
      paddingBottom: 40,
      gap: 16,
    },
    header: {
      gap: 8,
      marginBottom: 4,
    },
    title: {
      color: colors.text,
      fontSize: 34,
      fontWeight: '800',
    },
    body: {
      color: colors.textMuted,
      fontSize: 16,
      lineHeight: 24,
    },
    panel: {
      backgroundColor: colors.surface,
      borderColor: colors.border,
      borderRadius: 22,
      borderWidth: 1,
      padding: 18,
      gap: 12,
    },
    panelHeader: {
      alignItems: 'center',
      flexDirection: 'row',
      justifyContent: 'space-between',
      gap: 12,
    },
    sectionTitle: {
      color: colors.text,
      fontSize: 18,
      fontWeight: '700',
    },
    helperText: {
      color: colors.textMuted,
      fontSize: 14,
      lineHeight: 20,
    },
    settingRow: {
      alignItems: 'center',
      flexDirection: 'row',
      justifyContent: 'space-between',
      gap: 16,
    },
    settingLabel: {
      color: colors.textSubtle,
      fontSize: 14,
      fontWeight: '600',
    },
    settingValue: {
      color: colors.text,
      flexShrink: 1,
      fontSize: 14,
      fontWeight: '700',
      textAlign: 'right',
    },
    editBlock: {
      gap: 10,
      marginTop: 4,
    },
    input: {
      backgroundColor: colors.input,
      borderColor: colors.border,
      borderRadius: 16,
      borderWidth: 1,
      color: colors.text,
      fontSize: 15,
      paddingHorizontal: 16,
      paddingVertical: 14,
    },
    inlineButton: {
      alignItems: 'center',
      alignSelf: 'flex-start',
      backgroundColor: colors.accentMuted,
      borderRadius: 14,
      paddingHorizontal: 16,
      paddingVertical: 12,
    },
    inlineButtonText: {
      color: colors.accent,
      fontSize: 14,
      fontWeight: '700',
    },
    statsGrid: {
      flexDirection: 'row',
      gap: 12,
    },
    statCard: {
      backgroundColor: colors.surfaceMuted,
      borderColor: colors.border,
      borderRadius: 18,
      borderWidth: 1,
      flex: 1,
      gap: 4,
      paddingHorizontal: 14,
      paddingVertical: 16,
    },
    statValue: {
      color: colors.text,
      fontSize: 24,
      fontWeight: '800',
    },
    statLabel: {
      color: colors.textMuted,
      fontSize: 13,
      fontWeight: '600',
    },
    preferenceRow: {
      flexDirection: 'row',
      gap: 12,
    },
    preferenceChip: {
      backgroundColor: colors.surfaceMuted,
      borderColor: colors.border,
      borderRadius: 18,
      borderWidth: 1,
      flex: 1,
      gap: 4,
      paddingHorizontal: 14,
      paddingVertical: 14,
    },
    preferenceValue: {
      color: colors.accent,
      fontSize: 22,
      fontWeight: '800',
    },
    preferenceLabel: {
      color: colors.textMuted,
      fontSize: 13,
      fontWeight: '600',
    },
    vibeRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 10,
    },
    vibeChip: {
      backgroundColor: colors.surfaceMuted,
      borderColor: colors.border,
      borderRadius: 999,
      borderWidth: 1,
      paddingHorizontal: 14,
      paddingVertical: 10,
    },
    vibeChipActive: {
      backgroundColor: colors.accent,
      borderColor: colors.accent,
    },
    vibeChipText: {
      color: colors.textMuted,
      fontSize: 14,
      fontWeight: '700',
    },
    vibeChipTextActive: {
      color: colors.accentText,
    },
    summaryBox: {
      backgroundColor: colors.surfaceMuted,
      borderColor: colors.border,
      borderRadius: 18,
      borderWidth: 1,
      gap: 8,
      padding: 14,
    },
    summaryText: {
      color: colors.textMuted,
      lineHeight: 20,
    },
    styleMiniSection: {
      gap: 10,
      marginTop: 4,
    },
    statPill: {
      backgroundColor: colors.overlay,
      borderColor: colors.border,
      borderRadius: 999,
      borderWidth: 1,
      paddingHorizontal: 12,
      paddingVertical: 8,
    },
    statPillText: {
      color: colors.text,
      fontSize: 13,
      fontWeight: '600',
    },
    themeRow: {
      gap: 10,
    },
    themeButton: {
      backgroundColor: colors.surfaceMuted,
      borderColor: colors.border,
      borderRadius: 16,
      borderWidth: 1,
      paddingHorizontal: 16,
      paddingVertical: 14,
    },
    themeButtonActive: {
      backgroundColor: colors.accent,
      borderColor: colors.accent,
    },
    themeButtonText: {
      color: colors.textMuted,
      fontSize: 15,
      fontWeight: '700',
    },
    themeButtonTextActive: {
      color: colors.accentText,
    },
    linkGrid: {
      gap: 12,
    },
    linkCard: {
      backgroundColor: colors.surfaceMuted,
      borderColor: colors.border,
      borderRadius: 18,
      borderWidth: 1,
      gap: 4,
      padding: 14,
    },
    linkTitle: {
      color: colors.text,
      fontSize: 15,
      fontWeight: '700',
    },
    linkBody: {
      color: colors.textMuted,
      lineHeight: 20,
    },
    toggleRow: {
      alignItems: 'center',
      backgroundColor: colors.surfaceMuted,
      borderColor: colors.border,
      borderRadius: 18,
      borderWidth: 1,
      flexDirection: 'row',
      justifyContent: 'space-between',
      gap: 16,
      padding: 14,
    },
    toggleTitle: {
      color: colors.text,
      fontSize: 15,
      fontWeight: '700',
    },
    toggleBody: {
      color: colors.textMuted,
      lineHeight: 20,
      maxWidth: 220,
    },
    toggleValue: {
      color: colors.accent,
      fontSize: 14,
      fontWeight: '800',
    },
    error: {
      color: colors.danger,
      fontSize: 14,
      lineHeight: 20,
    },
    button: {
      alignItems: 'center',
      alignSelf: 'flex-start',
      backgroundColor: colors.text,
      borderRadius: 16,
      paddingHorizontal: 18,
      paddingVertical: 14,
    },
    buttonText: {
      color: colors.accentText,
      fontSize: 15,
      fontWeight: '700',
    },
    buttonDisabled: {
      opacity: 0.7,
    },
  });
