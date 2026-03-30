import { Redirect, Tabs } from 'expo-router';
import { ActivityIndicator, SafeAreaView, StyleSheet, View } from 'react-native';

import { useSession } from '../../lib/session';

export default function TabsLayout() {
  const { initialized, session } = useSession();

  if (!initialized) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.loading}>
          <ActivityIndicator color="#8C5E3C" size="small" />
        </View>
      </SafeAreaView>
    );
  }

  if (!session) {
    return <Redirect href="/(auth)/sign-in" />;
  }

  return (
    <Tabs
      screenOptions={{
        headerStyle: {
          backgroundColor: '#F6F1EA',
        },
        headerTitleStyle: {
          color: '#201A17',
          fontWeight: '700',
        },
        headerTintColor: '#201A17',
        tabBarActiveTintColor: '#8C5E3C',
        tabBarInactiveTintColor: '#8E837A',
        tabBarStyle: {
          backgroundColor: '#FFFDF9',
          borderTopColor: '#E7D8CA',
        },
        sceneStyle: {
          backgroundColor: '#F6F1EA',
        },
      }}
    >
      <Tabs.Screen
        name="wardrobe"
        options={{
          title: 'Wardrobe',
        }}
      />
      <Tabs.Screen
        name="add-item"
        options={{
          title: 'Add Item',
        }}
      />
      <Tabs.Screen
        name="outfits"
        options={{
          title: 'Outfits',
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#F6F1EA',
  },
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
