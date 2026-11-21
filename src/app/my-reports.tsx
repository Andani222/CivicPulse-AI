import { API_BASE_URL } from '../config/api';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  RefreshControl,
  SafeAreaView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { router } from 'expo-router';
import { useAuth } from '../context/AuthContext';

const API_URL = API_BASE_URL;

type Report = {
  _id: string;
  category: string;
  description: string;
  location?: {
    address?: string;
  };
  submissionStatus?: string;
  createdAt: string;
};

export default function MyReportsScreen() {
  const { token } = useAuth();
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [activeFilter, setActiveFilter] = useState<
    'all' | 'active' | 'resolved'
  >('all');
  const loadReports = useCallback(async () => {
    try {
      const response = await fetch(
        `${API_URL}/api/reports/my-reports`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.message || 'Could not load reports.');
      }

      setReports(result.reports || []);
    } catch (error) {
      Alert.alert(
        'Unable to load reports',
        error instanceof Error ? error.message : 'Please try again.'
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [token]);

  useEffect(() => {
    loadReports();
  }, [loadReports]);

  const filteredReports = reports.filter((report) => {
    const status = (report.submissionStatus || 'received')
      .replaceAll('_', ' ')
      .toLowerCase();

    if (activeFilter === 'resolved') {
      return status === 'resolved';
    }

    if (activeFilter === 'active') {
      return status !== 'resolved';
    }

    return true;
  });  

  const statusColor = (status: string) => {
    switch (status.toLowerCase()) {
      case 'resolved':
        return '#176B45';
      case 'in progress':
        return '#B76E00';
      default:
        return '#1769AA';
    }
  };

  const renderReport = ({ item }: { item: Report }) => {
    const status = item.submissionStatus || 'Pending';

    return (
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <Text style={styles.category}>{item.category}</Text>
          <Text
            style={[
              styles.status,
              { color: statusColor(status) },
            ]}
          >
            {status}
          </Text>
        </View>

        <Text style={styles.description}>
          {item.description}
        </Text>

        <Text style={styles.location}>
          Location: {item.location?.address || 'GPS location submitted'}
        </Text>

        <Text style={styles.date}>
          Submitted: {new Date(item.createdAt).toLocaleDateString()}
        </Text>

        <Text style={styles.reference}>
          Reference: {item._id}
        </Text>
      </View>
    );
  };

  if (loading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color="#1769AA" />
        <Text style={styles.loadingText}>Loading your reports...</Text>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()}>
          <Text style={styles.back}>‹ Back</Text>
        </Pressable>

        <Text style={styles.title}>My Reports</Text>
        <Text style={styles.subtitle}>
          Track the progress of your submitted reports.
        </Text>

        <View style={styles.filterContainer}>
          {[
            { label: 'All', value: 'all' },
            { label: 'Active', value: 'active' },
            { label: 'Resolved', value: 'resolved' },
          ].map((filter) => (
            <Pressable
              key={filter.value}
              style={[
                styles.filterButton,
                activeFilter === filter.value && styles.activeFilter,
              ]}
              onPress={() => setActiveFilter(filter.value as typeof activeFilter)}
            >
              <Text
                style={[
                  styles.filterText,
                  activeFilter === filter.value && styles.activeFilterText,
                ]}
              >
                {filter.label}
              </Text>
            </Pressable>
          ))}
        </View>

      </View>

      <FlatList
        data={filteredReports}
        keyExtractor={(item) => item._id}
        renderItem={renderReport}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              loadReports();
            }}
          />
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>
              {activeFilter === 'resolved'
                ? 'No completed reports yet'
                : activeFilter === 'active'
                  ? 'No active reports'
                  : 'No reports yet'}
            </Text>

            <Text style={styles.emptyText}>
              {activeFilter === 'resolved'
                ? 'Completed municipal reports will appear here.'
                : 'Reports you submit will appear here.'}
            </Text>
          </View>
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F7F9FC',
  },
  header: {
    padding: 24,
  },
  back: {
    color: '#1769AA',
    fontSize: 16,
    marginBottom: 20,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#172B4D',
  },
  subtitle: {
    fontSize: 14,
    color: '#667085',
    marginTop: 8,
  },
  list: {
    padding: 20,
    paddingTop: 0,
    flexGrow: 1,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#E4E7EC',
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  category: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#172B4D',
    flex: 1,
  },
  status: {
    fontSize: 13,
    fontWeight: 'bold',
  },
  description: {
    fontSize: 14,
    color: '#344054',
    lineHeight: 21,
    marginBottom: 12,
  },
  location: {
    fontSize: 13,
    color: '#667085',
  },
  date: {
    fontSize: 12,
    color: '#667085',
    marginTop: 8,
  },
  reference: {
    fontSize: 11,
    color: '#98A2B3',
    marginTop: 8,
  },
  empty: {
    alignItems: 'center',
    marginTop: 70,
  },
  emptyTitle: {
    fontSize: 19,
    fontWeight: 'bold',
    color: '#172B4D',
  },
  emptyText: {
    color: '#667085',
    marginTop: 8,
  },
  loading: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F7F9FC',
  },
  loadingText: {
    color: '#667085',
    marginTop: 12,
  },
  filterContainer: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    paddingBottom: 16,
    gap: 10,
  },

  filterButton: {
    paddingVertical: 9,
    paddingHorizontal: 18,
    borderRadius: 20,
    backgroundColor: '#E9EEF5',
  },

  activeFilter: {
    backgroundColor: '#1769AA',
  },

  filterText: {
    color: '#344054',
    fontWeight: '600',
    fontSize: 13,
  },

  activeFilterText: {
    color: '#FFFFFF',
  },

});
