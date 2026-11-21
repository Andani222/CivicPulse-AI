import * as Location from 'expo-location';
import { API_BASE_URL } from '../config/api';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { WebView } from 'react-native-webview';
import { useAuth } from '../context/AuthContext';

const API_URL = `${API_BASE_URL}/api/reports/map`;

type Report = {
  category: string;
  submissionStatus?: string;
  location: {
    latitude: number;
    longitude: number;
  };
};

export default function MapScreen() {
  const { token, loading: authLoading } = useAuth();
  const [reports, setReports] = useState<Report[]>([]);
  const [loadingReports, setLoadingReports] = useState(true);
  const [reportError, setReportError] = useState('');

  const [mapLocation, setMapLocation] = useState<{
    latitude: number;
    longitude: number;
  } | null>(null);

  const [loadingLocation, setLoadingLocation] = useState(false);

  // Retrieve municipal reports from the backend
  useEffect(() => {
    if (authLoading) return;

    if (!token) {
      setReportError('Please log in to view live reports.');
      setLoadingReports(false);
      return;
    }

    const fetchReports = async () => {
      try {
        setLoadingReports(true);

        const response = await fetch(API_URL, {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        });

        const result = await response.json();

        if (!response.ok || !result.success) {
          throw new Error(
            result.message || 'Unable to retrieve reports.'
          );
        }

        setReports(result.reports || []);
        setReportError('');
      } catch (error) {
        console.error('Map report error:', error);

        setReportError(
          error instanceof Error
            ? error.message
            : 'Unable to load reported locations.'
        );
      } finally {
        setLoadingReports(false);
      }
    };

    fetchReports();
  }, [token, authLoading]);

  // Only use reports with valid GPS coordinates
  const validReports = reports.filter((report) => {
    const latitude = Number(report.location?.latitude);
    const longitude = Number(report.location?.longitude);

    const status = (report.submissionStatus || 'received')
      .replaceAll('_', ' ')
      .toLowerCase();

    return (
      status !== 'resolved' &&
      Number.isFinite(latitude) &&
      Number.isFinite(longitude) &&
      latitude >= -90 &&
      latitude <= 90 &&
      longitude >= -180 &&
      longitude <= 180
    );
  });

  // Safely pass report information into the map HTML
  const reportsJson = JSON.stringify(validReports)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026');

  const currentLocationJson = JSON.stringify(mapLocation);

  // Build the interactive OpenStreetMap
  const mapHtml = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <link
          rel="stylesheet"
          href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"
        />

        <style>
          html, body, #map {
            margin: 0;
            padding: 0;
            width: 100%;
            height: 100%;
          }

          .report-pin {
            width: 20px;
            height: 20px;
            background: #e53935;
            border: 3px solid white;
            border-radius: 50% 50% 50% 0;
            transform: rotate(-45deg);
            box-shadow: 0 2px 6px rgba(0,0,0,0.35);
          }

          .current-pin {
            width: 18px;
            height: 18px;
            background: #208AEF;
            border: 3px solid white;
            border-radius: 50%;
            box-shadow: 0 2px 6px rgba(0,0,0,0.35);
          }

          .leaflet-popup-content {
            font-family: Arial, sans-serif;
            min-width: 180px;
          }

          .popup-category {
            font-size: 15px;
            font-weight: bold;
            margin-bottom: 8px;
          }

          .popup-description {
            font-size: 13px;
            line-height: 1.5;
            margin-bottom: 8px;
          }

          .popup-status {
            font-size: 12px;
            color: #64748b;
            margin-bottom: 5px;
          }

          .popup-address {
            font-size: 12px;
            color: #64748b;
          }
        </style>
      </head>

      <body>
        <div id="map"></div>

        <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>

        <script>
          const reports = ${reportsJson};
          const currentLocation = ${currentLocationJson};

          const map = L.map('map');

          L.tileLayer(
            'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
            {
              attribution: '&copy; OpenStreetMap contributors',
              maxZoom: 19
            }
          ).addTo(map);

          function escapeHtml(value) {
            return String(value ?? '').replace(/[&<>"']/g, (char) => ({
              '&': '&amp;',
              '<': '&lt;',
              '>': '&gt;',
              '"': '&quot;',
              "'": '&#039;'
            })[char]);
          }

          const reportIcon = L.divIcon({
            className: '',
            html: '<div class="report-pin"></div>',
            iconSize: [26, 26],
            iconAnchor: [13, 26],
            popupAnchor: [0, -25]
          });

          const currentIcon = L.divIcon({
            className: '',
            html: '<div class="current-pin"></div>',
            iconSize: [24, 24],
            iconAnchor: [12, 12]
          });

          const reportMarkers = [];

          reports.forEach((report) => {
            const latitude = Number(report.location.latitude);
            const longitude = Number(report.location.longitude);

            const marker = L.marker(
              [latitude, longitude],
              { icon: reportIcon }
            ).addTo(map);

            const status = (report.submissionStatus || 'received')
              .replaceAll('_', ' ')
              .replace(/\b\w/g, char => char.toUpperCase());

            
            const popup =
              '<div>' +
                '<div class="popup-category">' +
                  escapeHtml(report.category) +
                '</div>' +

                '<div class="popup-status">' +
                  'Status: ' + escapeHtml(status) +
                '</div>' +
              '</div>';

            marker.bindPopup(popup);
            reportMarkers.push(marker);
          });

          if (currentLocation) {
            L.marker(
              [currentLocation.latitude, currentLocation.longitude],
              { icon: currentIcon }
            )
              .addTo(map)
              .bindPopup('Your current location');
          }

          if (currentLocation) {
            map.setView(
              [currentLocation.latitude, currentLocation.longitude],
              15
            );
          } else if (reportMarkers.length > 0) {
            const group = L.featureGroup(reportMarkers);
            map.fitBounds(group.getBounds(), {
              padding: [40, 40],
              maxZoom: 13
            });
          } else {
            map.setView([-29, 24], 5);
          }
        </script>
      </body>
    </html>
  `;

  const findMyLocation = async () => {
    try {
      setLoadingLocation(true);

      const { status } =
        await Location.requestForegroundPermissionsAsync();

      if (status !== 'granted') {
        Alert.alert(
          'Location Permission',
          'Please allow CivicPulse to access your location.'
        );
        return;
      }

      const location = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });

      setMapLocation({
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
      });
    } catch (error) {
      console.error('Location error:', error);

      Alert.alert(
        'Location Error',
        'Unable to retrieve your current location.'
      );
    } finally {
      setLoadingLocation(false);
    }
  };

  return (
    <View style={styles.container}>
      <WebView
        key={`${reports.length}-${mapLocation?.latitude ?? 'default'}-${mapLocation?.longitude ?? 'default'}`}
        source={{ html: mapHtml }}
        style={styles.map}
        originWhitelist={['*']}
        javaScriptEnabled
        domStorageEnabled
        startInLoadingState
        renderLoading={() => (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#208AEF" />
            <Text>Loading CivicPulse map...</Text>
          </View>
        )}
      />

      {reportError !== '' && (
        <View style={styles.errorBanner}>
          <Text style={styles.errorText}>{reportError}</Text>
        </View>
      )}

      <View style={styles.buttonContainer}>
        <TouchableOpacity
          style={styles.locationButton}
          onPress={findMyLocation}
          disabled={loadingLocation}
        >
          {loadingLocation ? (
            <ActivityIndicator color="#208AEF" />
          ) : (
            <Text style={styles.locationButtonText}>
              Find My Location
            </Text>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },

  map: {
    flex: 1,
  },

  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 10,
  },

  errorBanner: {
    position: 'absolute',
    top: 15,
    left: 15,
    right: 15,
    backgroundColor: '#FEE2E2',
    padding: 12,
    borderRadius: 10,
  },

  errorText: {
    color: '#991B1B',
    fontSize: 12,
    textAlign: 'center',
  },

  buttonContainer: {
    position: 'absolute',
    bottom: 30,
    left: 20,
    right: 20,
  },

  locationButton: {
    backgroundColor: 'white',
    paddingVertical: 15,
    paddingHorizontal: 20,
    borderRadius: 12,
    alignItems: 'center',
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 4,
  },

  locationButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
});
