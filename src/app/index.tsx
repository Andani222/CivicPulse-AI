
import { router } from 'expo-router';
import {
  SafeAreaView,
  StyleSheet,
  Text,
  View,
  Pressable,
} from 'react-native';
import { useAuth } from '../context/AuthContext';

export default function HomeScreen() {
  const { user, logout } = useAuth();

  const handleLogout = async () => {
    await logout();
    router.replace('/login');
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.topBar}>
        <View style={styles.header}>
          <Text style={styles.logo}>CivicPulse</Text>
          <Text style={styles.tagline}>
            Your community. Your voice.
          </Text>
        </View>

        <View style={styles.account}>
          <Text style={styles.username} numberOfLines={1}>
            {user?.name || 'Resident'}
          </Text>

          <Pressable
            style={styles.logoutButton}
            onPress={handleLogout}
          >
            <Text style={styles.logoutText}>Logout</Text>
          </Pressable>
        </View>
      </View>

      <View style={styles.welcome}>
        <Text style={styles.title}>
          What's happening near you?
        </Text>
        <Text style={styles.description}>
          Report municipal problems and help make
          your community a better place.
        </Text>
      </View>

      <Pressable
        style={styles.primaryButton}
        onPress={() => router.push('/report')}
      >
        <Text style={styles.primaryButtonText}>
          + Report an Issue
        </Text>
      </Pressable>

      <Pressable
        style={styles.secondaryButton}
        onPress={() => router.push('/map')}
      >
        <Text style={styles.secondaryButtonText}>
          View Live Map
        </Text>
      </Pressable>

      <Pressable
        style={styles.secondaryButton}
        onPress={() => router.push('/my-reports')}
      >
        <Text style={styles.secondaryButtonText}>
          My Reports
        </Text>
      </Pressable>

      <View style={styles.info}>
        <Text style={styles.infoTitle}>
          How CivicPulse works
        </Text>
        <Text style={styles.infoText}>
          1. Report a municipal issue
        </Text>
        <Text style={styles.infoText}>
          2. Add a photo and location
        </Text>
        <Text style={styles.infoText}>
          3. Follow the report's progress
        </Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F7F9FC',
    padding: 24,
    justifyContent: 'center',
  },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 48,
  },
  header: {
    flex: 1,
  },
  logo: {
    fontSize: 34,
    fontWeight: 'bold',
    color: '#1769AA',
  },
  tagline: {
    fontSize: 15,
    color: '#667085',
    marginTop: 5,
  },
  account: {
    alignItems: 'flex-end',
    marginLeft: 8,
    maxWidth: '42%',
  },
  username: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#172B4D',
    marginBottom: 8,
  },
  logoutButton: {
    backgroundColor: '#FEECEC',
    paddingHorizontal: 13,
    paddingVertical: 7,
    borderRadius: 8,
  },
  logoutText: {
    color: '#B42318',
    fontSize: 12,
    fontWeight: 'bold',
  },
  welcome: {
    marginBottom: 28,
  },
  title: {
    fontSize: 27,
    fontWeight: 'bold',
    color: '#172B4D',
    marginBottom: 12,
  },
  description: {
    fontSize: 16,
    lineHeight: 24,
    color: '#596579',
  },
  primaryButton: {
    backgroundColor: '#1769AA',
    padding: 17,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 12,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: 'bold',
  },
  secondaryButton: {
    backgroundColor: '#FFFFFF',
    padding: 17,
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#1769AA',
    marginBottom: 12,
  },
  secondaryButtonText: {
    color: '#1769AA',
    fontSize: 16,
    fontWeight: 'bold',
  },
  info: {
    marginTop: 28,
    padding: 20,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
  },
  infoTitle: {
    fontSize: 17,
    fontWeight: 'bold',
    marginBottom: 12,
    color: '#172B4D',
  },
  infoText: {
    fontSize: 14,
    color: '#596579',
    marginBottom: 8,
  },
});
