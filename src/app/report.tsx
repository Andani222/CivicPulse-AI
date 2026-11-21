import * as FileSystem from 'expo-file-system/legacy';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import { router } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { WebView } from 'react-native-webview';
import { API_BASE_URL } from '../config/api';
import { useAuth } from '../context/AuthContext';

interface AddressResult {
  place_id: number;
  display_name: string;
  lat: string;
  lon: string;
  address?: {
    road?: string;
    suburb?: string;
    neighbourhood?: string;
    city?: string;
    town?: string;
    village?: string;
    state?: string;
    country?: string;
  };
}

const categories = [
  'Pothole',
  'Broken Streetlight',
  'Illegal Dumping',
  'Sewage Problem',
  'Water Leak',
  'Damaged Road',
  'Other',
];

const demoLocations = [
  {
    id: 'central',
    name: 'CivicPulse Demo Zone',
    address: 'Pretoria Central, Gauteng',
    latitude: -25.7479,
    longitude: 28.2293,
  },
  {
    id: 'north',
    name: 'CivicPulse North Zone',
    address: 'Hatfield, Pretoria, Gauteng',
    latitude: -25.7461,
    longitude: 28.2376,
  },
  {
    id: 'south',
    name: 'CivicPulse South Zone',
    address: 'Sunnyside, Pretoria, Gauteng',
    latitude: -25.7580,
    longitude: 28.2200,
  },
];


function createMapHtml(latitude: number, longitude: number) {
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta name="viewport"
        content="width=device-width, initial-scale=1.0, maximum-scale=1.0" />

      <link
        rel="stylesheet"
        href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"
      />

      <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>

      <style>
        html, body, #map {
          height: 100%;
          width: 100%;
          margin: 0;
          padding: 0;
          overflow: hidden;
        }

        .center-pin {
          position: absolute;
          z-index: 1000;
          left: 50%;
          top: 50%;
          transform: translate(-50%, -100%);
          font-size: 38px;
          pointer-events: none;
          filter: drop-shadow(0 2px 3px #555);
        }

        .confirm-button {
          position: absolute;
          z-index: 1000;
          bottom: 24px;
          left: 5%;
          width: 90%;
          padding: 16px;
          background: #1769AA;
          color: white;
          border: none;
          border-radius: 12px;
          font-size: 16px;
          font-weight: bold;
        }
      </style>
    </head>

    <body>
      <div id="map"></div>
      <div class="center-pin">📍</div>

      <button class="confirm-button" onclick="confirmLocation()">
        Confirm this location
      </button>

      <script>
        const map = L.map('map', {
          zoomControl: true
        }).setView([${latitude}, ${longitude}], 17);

        L.tileLayer(
          'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
          {
            maxZoom: 19,
            attribution: '&copy; OpenStreetMap contributors'
          }
        ).addTo(map);

        function confirmLocation() {
          const center = map.getCenter();

          window.ReactNativeWebView.postMessage(
            JSON.stringify({
              latitude: center.lat,
              longitude: center.lng
            })
          );
        }

        setTimeout(() => map.invalidateSize(), 500);
      </script>
    </body>
    </html>
  `;
}

export default function ReportScreen() {
  const { token } = useAuth();
  const [mapExpanded, setMapExpanded] = useState(false);
  const [category, setCategory] = useState('');
  const [description, setDescription] = useState('');
  const [address, setAddress] = useState('');
  const [addressResults, setAddressResults] = useState<AddressResult[]>([]);
  const [searchingAddress, setSearchingAddress] = useState(false);
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [gps, setGps] = useState<Location.LocationObject | null>(null);
  const [loadingLocation, setLoadingLocation] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiScore, setAiScore] = useState<number | null>(null);
  const [aiMessage, setAiMessage] = useState('');
  const [aiScores, setAiScores] = useState<Record<string, number>>({});
  const [aiDescription, setAiDescription] = useState('');
  const [aiRelevance, setAiRelevance] = useState('');
  const [aiFeedback, setAiFeedback] = useState('');


  
  async function captureLocation() {
    try {
      setLoadingLocation(true);

      const permission =
        await Location.requestForegroundPermissionsAsync();

      if (permission.status !== 'granted') {
        Alert.alert(
          'Location permission required',
          'Allow CivicPulse to access your location.'
        );
        return;
      }

      const currentLocation =
        await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.High,
        });

      setGps(currentLocation);

      const { latitude, longitude } = currentLocation.coords;


      const results = await Location.reverseGeocodeAsync({
        latitude,
        longitude,
      });

      if (results.length > 0) {
        const place = results[0];

        const readableAddress = [
          place.name,
          place.street,
          place.subregion,
          place.city,
          place.region,
          place.country,
        ]
          .filter(Boolean)
          .filter((value, index, array) =>
            array.indexOf(value) === index
          )
          .join(', ');

        setAddress(readableAddress);
      } else {
        setAddress('GPS location captured');
      }

      Alert.alert(
        'Location captured',
        'Your current location has been added to the report.'
      );

    } catch (error) {
      console.error('GPS error:', error);

      Alert.alert(
        'Location unavailable',
        'Could not obtain your location. Please try again.'
      );

    } finally {
      setLoadingLocation(false);
    }
  }

  async function searchAddress() {
    if (!address.trim()) {
      Alert.alert('Address required', 'Please enter an address.');
      return;
    }

    try {
      setSearchingAddress(true);
      setAddressResults([]);

      const query = encodeURIComponent(address.trim());

      const response = await fetch(
        `${API_BASE_URL}/api/location/search?q=${query}`
      );

      if (!response.ok) {
        const errorBody = await response.text();

        console.log('Address API status:', response.status);
        console.log('Address API response:', errorBody);

        throw new Error(
          `Address search failed. HTTP ${response.status}`
        );
      }

      const data = await response.json();

      const results: AddressResult[] = data.results || [];

      if (results.length === 0) {
        Alert.alert(
          'No addresses found',
          'Try another search using a street name, suburb or town.'
        );
        return;
      }

      setAddressResults(results);

    } catch (error) {
      console.error('Address search error:', error);

      Alert.alert(
        'Search failed',
        'Unable to search for addresses. Please check your internet connection.'
      );

    } finally {
      setSearchingAddress(false);
    }
  }

  function selectAddressLocation(result: AddressResult) {
    const latitude = Number(result.lat);
    const longitude = Number(result.lon);

    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      Alert.alert('Invalid location', 'This address has invalid coordinates.');
      return;
    }

    setGps({
      coords: {
        latitude,
        longitude,
        altitude: null,
        accuracy: null,
        altitudeAccuracy: null,
        heading: null,
        speed: null,
      },
      timestamp: Date.now(),
    });

    setAddress(result.display_name);
    setAddressResults([]);
  }

  function handleMapDrag(latitude: number, longitude: number) {
    setGps({
      coords: {
        latitude,
        longitude,
        altitude: null,
        accuracy: null,
        altitudeAccuracy: null,
        heading: null,
        speed: null,
      },
      timestamp: Date.now(),
    });



    setAddress('Selected map location');

    Location.reverseGeocodeAsync({
      latitude,
      longitude,
    }).then((results) => {
      if (results.length > 0) {
        const place = results[0];

        setAddress([
          place.name,
          place.street,
          place.subregion,
          place.city,
          place.region,
        ].filter(Boolean).join(', '));
      }
    }).catch((error) => {
      console.log('Reverse geocoding failed:', error);
    });
  }

  
  async function analysePhoto(uri: string) {
    if (!token) {
      setAiMessage('Please sign in before analysing a photograph.');
      return;
    }

    setAiLoading(true);
    setAiScore(null);
    setAiScores({});
    setAiDescription('');
    setAiRelevance('');
    setAiFeedback('');
    setAiMessage('CivicPulse AI is analysing your photograph...');

    try {
      const filename =
        uri.split('/').pop()?.split('?')[0] || 'report-photo.jpg';

      const extension = filename.split('.').pop()?.toLowerCase();

      const mimeType =
        extension === 'png'
          ? 'image/png'
          : extension === 'webp'
            ? 'image/webp'
            : 'image/jpeg';

      const uploadResult = await FileSystem.uploadAsync(
        `${API_BASE_URL}/api/ai/classify-image`,
        uri,
        {
          httpMethod: 'POST',
          uploadType: FileSystem.FileSystemUploadType.MULTIPART,
          fieldName: 'file',
          mimeType,
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      console.log('AI HTTP Status:', uploadResult.status);
      console.log('AI Raw Response:', uploadResult.body);

      let result;

      try {
        result = JSON.parse(uploadResult.body);
      } catch {
        throw new Error(
          `Server returned non-JSON response: ${uploadResult.body.slice(0, 300)}`
        );
      }

      if (uploadResult.status < 200 || uploadResult.status >= 300) {
        throw new Error(result.message || 'Image classification failed.');
      }

      const analysis = result.analysis ?? result;

      const prediction = analysis.predicted_category;
      const visualAssessment = analysis.visual_assessment ?? {};

      setCategory(prediction);
      setAiScore(analysis.score ?? null);
      setAiScores(analysis.scores || {});

      // Support both the current classification response
      // and the newer resident-facing assessment fields.
      setAiDescription(
        visualAssessment.resident_image_description ||
        visualAssessment.description ||
        ''
      );

      setAiRelevance(
        visualAssessment.relevance ||
        analysis.relevance?.status ||
        ''
      );

      setAiFeedback(
        visualAssessment.resident_feedback ||
        visualAssessment.feedback ||
        analysis.relevance?.message ||
        ''
      );

      setAiMessage(
        `AI suggests: ${prediction}. You can change this category if needed.`
      );

    } catch (error) {
      console.error('CivicPulse AI classification error:', error);

      setAiMessage(
        'We could not analyse this photograph. Please select a category manually.'
      );

    } finally {
      setAiLoading(false);
    }
  }

  async function takePhoto() {
    try {
      const permission =
        await ImagePicker.requestCameraPermissionsAsync();

      if (!permission.granted) {
        Alert.alert(
          'Camera permission required',
          'Open your phone Settings, find Expo Go, and allow Camera access.',
        );
        return;
      }

      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ['images'],
        allowsEditing: false,
        quality: 0.8,
      });

      if (!result.canceled && result.assets.length > 0) {
        const uri = result.assets[0].uri;
        setPhotoUri(uri);

        await Promise.all([
          analysePhoto(uri),
          //captureLocation(true),
        ]);
      }
    } catch (error) {
      console.error('Camera error:', error);
      Alert.alert(
        'Unable to open camera',
        'Please check camera permission and try again.',
      );
    }
  }


  async function choosePhoto() {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: false,
      quality: 0.8,
    });
    
    if (!result.canceled && result.assets.length > 0) {
      const uri = result.assets[0].uri;

      setPhotoUri(uri);

      await Promise.all([
        analysePhoto(uri),
        //captureLocation(true),
      ]);
    }
   
  }
  
  
  async function submitReport() {
    if (!category) {
      Alert.alert('Missing category', 'Please select a problem category.');
      return;
    }

    if (!description.trim()) {
      Alert.alert('Missing description', 'Please describe the problem.');
      return;
    }

    if (description.trim().length < 10) {
      Alert.alert(
        'Description too short',
        'Please provide at least 10 characters so the problem can be understood.',
      );
      return;
    }

    if (!gps) {
      Alert.alert(
        'Location needed',
        'Please capture your location or select a location on the map.'
      );
      return;
    }

    const reportData = {
      category,
      description: description.trim(),
      location: JSON.stringify({
        address,
        latitude: gps.coords.latitude,
        longitude: gps.coords.longitude,
      }),
    };

    console.log('Authentication token available:', Boolean(token));

    try {
      let responseStatus: number;
      let responseBody: string;

      const apiUrl = `${API_BASE_URL}/api/reports`;
      if (photoUri) {
        // Upload the actual photograph and report details together.
        const filename =
          photoUri.split('/').pop()?.split('?')[0] || 'report-photo.jpg';

        const extension = filename.split('.').pop()?.toLowerCase();

        const mimeType =
          extension === 'png'
            ? 'image/png'
            : extension === 'webp'
              ? 'image/webp'
              : 'image/jpeg';

        const uploadResult = await FileSystem.uploadAsync(
          apiUrl,
          photoUri,
          {
            httpMethod: 'POST',
            uploadType: FileSystem.FileSystemUploadType.MULTIPART,
            fieldName: 'file',
            mimeType,
            parameters: reportData,
            headers: {
              Authorization: `Bearer ${token}`,
            },
          },
        );

        responseStatus = uploadResult.status;
        responseBody = uploadResult.body;

      } else {
        // Preserve the ability to submit a report without a photograph.
        const response = await fetch(apiUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            category: reportData.category,
            description: reportData.description,
            location: JSON.parse(reportData.location),
          }),
        });

        responseStatus = response.status;
        responseBody = await response.text();
      }

      console.log('Report HTTP Status:', responseStatus);
      console.log('Report Raw Response:', responseBody);

      let result;

      try {
        result = JSON.parse(responseBody);
      } catch {
        throw new Error('The server returned an invalid response.');
      }

      if (responseStatus < 200 || responseStatus >= 300 || !result.success) {
        throw new Error(result.message || 'The report could not be submitted.');
      }

      Alert.alert(
        'Report submitted!',
        `Your report was received by CivicPulse.\n\nReference: ${result.report.id}`,
        [
          {
            text: 'Continue editing',
            style: 'cancel',
          },
          {
            text: 'Back to Home',
            onPress: () => router.replace('/'),
          },
        ],
      );

    } catch (error) {
      console.error('CivicPulse submission error:', error);

      Alert.alert(
        'Submission failed',
        error instanceof Error
          ? error.message
          : 'CivicPulse could not submit your report. Check your network and try again.',
      );
    }
  }



  
  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        <Pressable
          onPress={() => router.back()}
          accessibilityRole="button"
        >
          <Text style={styles.back}>‹ Back</Text>
        </Pressable>

        <Text style={styles.logo}>CivicPulse</Text>
        <Text style={styles.title}>Report a problem</Text>
        <Text style={styles.subtitle}>
          Help improve your community by reporting a municipal problem.
        </Text>

        <View style={styles.notice}>
          <Text style={styles.noticeTitle}>How reporting works</Text>
          <Text style={styles.noticeText}>
            Start by taking a photograph or choosing one from your gallery.
            CivicPulse AI will suggest a problem category, and your phone
            will automatically capture your location.
          </Text>
        </View>

        {/* STEP 1: PHOTOGRAPH */}

        <Text style={styles.label}>1. Add a photograph *</Text>

        <View style={styles.placeholder}>
          <Text style={styles.placeholderTitle}>Photo evidence</Text>
          <Text style={styles.placeholderText}>
            Take a photograph of the problem or choose one from your gallery.
          </Text>

          <View style={{ gap: 10, marginTop: 14 }}>
            <Pressable
              style={styles.locationButton}
              onPress={takePhoto}
            >
              <Text style={styles.locationButtonText}>
                Take a photo
              </Text>
            </Pressable>

            <Pressable
              style={styles.locationButton}
              onPress={choosePhoto}
            >
              <Text style={styles.locationButtonText}>
                Choose from gallery
              </Text>
            </Pressable>
          </View>

          {photoUri && (
            <View style={{ marginTop: 14 }}>
              <Image
                source={{ uri: photoUri }}
                style={{
                  width: '100%',
                  height: 220,
                  borderRadius: 10,
                }}
                resizeMode="cover"
              />

              <Pressable
                onPress={() => {
                  setPhotoUri(null);
                  setAiScore(null);
                  setAiMessage('');
                  setAiDescription('');
                  setAiRelevance('');
                  setAiFeedback('');
                  setAiScores({});
                }}
              >
                <Text style={styles.removeLocation}>
                  Remove photo
                </Text>
              </Pressable>
            </View>
          )}
        </View>

        {/* AI FEEDBACK */}

        
        {/* AI FEEDBACK */}

        {aiLoading && (
          <View style={styles.aiStatus}>
            <ActivityIndicator size="small" color="#1769AA" />
            <Text style={styles.aiStatusText}>
              CivicPulse AI is analysing your photograph...
            </Text>
          </View>
        )}

        {!aiLoading && aiDescription !== '' && (
          <View style={styles.aiAssessment}>
            <Text style={styles.aiAssessmentTitle}>
              AI image assessment
            </Text>

            <Text style={styles.aiDescription}>
              {aiDescription}
            </Text>

            <View
              style={[
                styles.aiRelevanceBadge,
                aiRelevance === 'relevant'
                  ? styles.aiRelevant
                  : aiRelevance === 'unrelated'
                    ? styles.aiUnrelated
                    : styles.aiNeedsReview,
              ]}
            >
              <Text
                style={[
                  styles.aiRelevanceText,
                  aiRelevance === 'relevant'
                    ? styles.aiRelevantText
                    : aiRelevance === 'unrelated'
                      ? styles.aiUnrelatedText
                      : styles.aiNeedsReviewText,
                ]}
              >
                {aiRelevance === 'relevant'
                  ? 'Relevant image'
                  : aiRelevance === 'unrelated'
                    ? 'Unrelated image'
                    : 'Needs review'}
              </Text>
            </View>

            {aiFeedback !== '' && (
              <Text style={styles.aiFeedback}>
                {aiFeedback}
              </Text>
            )}
          </View>
        )}

        {!aiLoading && aiDescription === '' && aiMessage !== '' && (
          <View style={styles.aiStatus}>
            <Text style={styles.aiStatusText}>
              {aiMessage}
            </Text>
          </View>
        )}


        {/* CLIP CATEGORY STATISTICS */}

        {Object.keys(aiScores).length > 0 && (
          <View style={styles.aiStatistics}>
            <Text style={styles.aiStatisticsTitle}>
              AI Category Comparison
            </Text>

            <Text style={styles.aiStatisticsDescription}>
              See how closely the photograph matches each municipal
              problem category.
            </Text>

            {Object.entries(aiScores)
              .sort((a, b) => b[1] - a[1])
              .map(([name, score]) => (
                <View key={name} style={styles.scoreRow}>
                  <View style={styles.scoreHeader}>
                    <Text style={styles.scoreCategory}>
                      {name}
                    </Text>

                    <Text style={styles.scoreValue}>
                      {(score * 100).toFixed(2)}%
                    </Text>
                  </View>

                  <View style={styles.scoreTrack}>
                    <View
                      style={[
                        styles.scoreFill,
                        {
                          width: `${Math.max(0, Math.min(100, score * 100))}%`,
                        },
                      ]}
                    />
                  </View>
                </View>
              ))}

            <Text style={styles.statisticsNote}>
              These are CLIP similarity scores, not verified accuracy
              percentages or probabilities.
            </Text>
          </View>
        )}

        {/* STEP 2: CATEGORY */}

        <Text style={styles.label}>2. Confirm problem category *</Text>

        <Text style={styles.helper}>
          CivicPulse AI suggests a category based on your photograph.
          You can change it if the suggestion is incorrect.
        </Text>

        <View style={styles.categories}>
          {categories.map((item) => {
            const selected = category === item;

            return (
              <Pressable
                key={item}
                onPress={() => setCategory(item)}
                accessibilityRole="radio"
                accessibilityState={{ selected }}
                style={[
                  styles.category,
                  selected && styles.selectedCategory,
                ]}
              >
                <Text
                  style={[
                    styles.categoryText,
                    selected && styles.selectedCategoryText,
                  ]}
                >
                  {selected ? '✓  ' : ''}
                  {item}
                </Text>
              </Pressable>
            );
          })}
        </View>

        
        {/* STEP 3: LOCATION */}

        <Text style={styles.label}>
          3. Select problem location *
        </Text>

        <Text style={styles.helper}>
          Capture your current location or move the map pin to where
          the municipal problem occurred.
        </Text>

        <Text style={styles.helper}>
          Or enter the address where the problem occurred.
        </Text>

        <TextInput
          style={styles.address}
          placeholder="Enter street, suburb, town or landmark..."
          placeholderTextColor="#7B8494"
          value={address}
          onChangeText={(value) => {
            setAddress(value);
            setGps(null);
            setAddressResults([]);
          }}
        />

        <Pressable
          style={styles.locationButton}
          onPress={searchAddress}
          disabled={searchingAddress}
        >
          {searchingAddress ? (
            <ActivityIndicator color="#1769AA" />
          ) : (
            <Text style={styles.locationButtonText}>
              Search address
            </Text>
          )}
        </Pressable>

        {addressResults.length > 0 && (
          <View style={styles.gpsCard}>
            <Text style={styles.gpsTitle}>
              Choose the correct address
            </Text>

            {addressResults.map((result) => (
              <Pressable
                key={result.place_id}
                onPress={() => selectAddressLocation(result)}
                style={{
                  paddingVertical: 12,
                  borderBottomWidth: 1,
                  borderBottomColor: '#D9E0EA',
                }}
              >
                <Text style={styles.gpsText}>
                  {result.display_name}
                </Text>

                <Text style={styles.locationButtonText}>
                  Select this address
                </Text>
              </Pressable>
            ))}
          </View>
        )}

        <Pressable
          style={styles.locationButton}
          onPress={() => captureLocation()}
          disabled={loadingLocation}
        >
          {loadingLocation ? (
            <ActivityIndicator color="#1769AA" />
          ) : (
            <Text style={styles.locationButtonText}>
              Use my current location
            </Text>
          )}
        </Pressable>
              

        {gps && (
          <>
            <View style={styles.mapContainer}>
              <WebView
                key={`preview-${gps.coords.latitude}-${gps.coords.longitude}`}
                originWhitelist={['*']}
                javaScriptEnabled
                domStorageEnabled
                source={{
                  html: createMapHtml(
                    gps.coords.latitude,
                    gps.coords.longitude
                  ),
                }}
                onMessage={(event) => {
                  try {
                    const coordinates = JSON.parse(event.nativeEvent.data);

                    handleMapDrag(
                      coordinates.latitude,
                      coordinates.longitude
                    );
                  } catch (error) {
                    console.log('Map selection error:', error);
                  }
                }}
                style={{ flex: 1 }}
              />
            </View>

            <Pressable
              style={styles.expandMapButton}
              onPress={() => setMapExpanded(true)}
            >
              <Text style={styles.expandMapButtonText}>
                ⛶ Expand map to full screen
              </Text>
            </Pressable>

            <Modal
              visible={mapExpanded}
              animationType="slide"
              presentationStyle="fullScreen"
              onRequestClose={() => setMapExpanded(false)}
            >
              <View style={styles.fullScreenMap}>
                <WebView
                  key={`fullscreen-${gps.coords.latitude}-${gps.coords.longitude}`}
                  originWhitelist={['*']}
                  javaScriptEnabled
                  domStorageEnabled
                  source={{
                    html: createMapHtml(
                      gps.coords.latitude,
                      gps.coords.longitude
                    ),
                  }}
                  onMessage={(event) => {
                    try {
                      const coordinates = JSON.parse(event.nativeEvent.data);

                      handleMapDrag(
                        coordinates.latitude,
                        coordinates.longitude
                      );

                      setMapExpanded(false);
                    } catch (error) {
                      console.log('Map selection error:', error);
                    }
                  }}
                  style={{ flex: 1 }}
                />

                <Pressable
                  style={styles.closeMapButton}
                  onPress={() => setMapExpanded(false)}
                >
                  <Text style={styles.closeMapButtonText}>
                    ✕ Close map
                  </Text>
                </Pressable>
              </View>
            </Modal>
          </>
        )}


        {gps && (
          <View style={styles.gpsCard}>
            <Text style={styles.gpsTitle}>
              Issue location
            </Text>

            <Text style={styles.gpsText}>
              {address || 'GPS location captured'}
            </Text>

            <Text style={styles.gpsText}>
              Latitude: {gps.coords.latitude.toFixed(6)}
            </Text>

            <Text style={styles.gpsText}>
              Longitude: {gps.coords.longitude.toFixed(6)}
            </Text>
          </View>
        )}


        {/* STEP 4: DESCRIPTION */}

        <Text style={styles.label}>4. Describe the problem *</Text>

        <Text style={styles.helper}>
          Explain what happened, how serious the problem appears,
          and any useful nearby landmarks. Do not include private
          personal information.
        </Text>

        <TextInput
          style={styles.description}
          placeholder="Example: A large pothole is damaging vehicles near the entrance to..."
          placeholderTextColor="#7B8494"
          multiline
          textAlignVertical="top"
          value={description}
          onChangeText={setDescription}
          maxLength={1000}
          accessibilityLabel="Problem description"
        />

        <Text style={styles.counter}>
          {description.length}/1000 characters
        </Text>

        {/* STEP 5: REVIEW */}

        <View style={styles.notice}>
          <Text style={styles.noticeTitle}>
            What happens next?
          </Text>

          <Text style={styles.noticeText}>
            Your report will be prepared for submission. Future AI
            analysis will assess the photograph and description,
            recommend a priority, and identify potentially duplicate
            reports for administrator review.
          </Text>
        </View>

        <Pressable
          style={styles.submit}
          onPress={submitReport}
          accessibilityRole="button"
        >
          <Text style={styles.submitText}>
            Submit report
          </Text>
        </Pressable>

        <Text style={styles.footer}>
          Your report is not submitted to the municipality yet.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );

}

const styles = StyleSheet.create({
  aiStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EAF3FB',
    padding: 12,
    borderRadius: 10,
    marginTop: 12,
    gap: 8,
  },

  aiStatusText: {
    fontSize: 13,
    color: '#1769AA',
    flexShrink: 1,
  },

  aiScoreText: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 5,
  },
  container: {
    flex: 1,
    backgroundColor: '#F7F9FC',
  },
  content: {
    padding: 24,
    paddingBottom: 48,
  },
  back: {
    fontSize: 16,
    color: '#1769AA',
    marginBottom: 22,
  },
  logo: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#1769AA',
    marginBottom: 8,
  },
  title: {
    fontSize: 29,
    fontWeight: 'bold',
    color: '#172B4D',
  },
  subtitle: {
    fontSize: 15,
    color: '#667085',
    marginTop: 8,
    marginBottom: 22,
    lineHeight: 23,
  },
  notice: {
    backgroundColor: '#EAF3FC',
    borderRadius: 12,
    padding: 15,
    marginBottom: 18,
  },
  noticeTitle: {
    fontSize: 15,
    fontWeight: 'bold',
    color: '#1769AA',
    marginBottom: 6,
  },
  noticeText: {
    fontSize: 14,
    lineHeight: 21,
    color: '#344054',
  },
  label: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#172B4D',
    marginTop: 20,
    marginBottom: 10,
  },
  helper: {
    fontSize: 13,
    color: '#667085',
    lineHeight: 19,
    marginBottom: 10,
  },
  categories: {
    gap: 9,
  },
  category: {
    padding: 14,
    borderRadius: 10,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#D9E0EA',
  },
  selectedCategory: {
    backgroundColor: '#E5F1FC',
    borderColor: '#1769AA',
  },
  categoryText: {
    fontSize: 15,
    color: '#344054',
  },
  selectedCategoryText: {
    color: '#1769AA',
    fontWeight: 'bold',
  },
  description: {
    minHeight: 140,
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#D9E0EA',
    padding: 14,
    fontSize: 15,
    lineHeight: 22,
    color: '#172B4D',
  },
  counter: {
    textAlign: 'right',
    color: '#667085',
    marginTop: 6,
    fontSize: 12,
  },
  placeholder: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#D9E0EA',
    borderRadius: 10,
    padding: 16,
  },
  placeholderTitle: {
    fontSize: 15,
    fontWeight: 'bold',
    color: '#172B4D',
  },
  placeholderText: {
    fontSize: 14,
    color: '#667085',
    marginTop: 7,
    lineHeight: 21,
  },
  locationButton: {
    minHeight: 50,
    backgroundColor: '#E5F1FC',
    padding: 14,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#1769AA',
  },
  locationButtonText: {
    color: '#1769AA',
    fontSize: 15,
    fontWeight: 'bold',
  },
  gpsCard: {
    marginTop: 12,
    backgroundColor: '#EAF7EF',
    padding: 14,
    borderRadius: 10,
  },
  gpsTitle: {
    color: '#176B45',
    fontWeight: 'bold',
    marginBottom: 6,
  },
  gpsText: {
    color: '#344054',
    fontSize: 14,
    marginTop: 4,
  },
  removeLocation: {
    color: '#B42318',
    fontSize: 13,
    marginTop: 10,
  },
  address: {
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#D9E0EA',
    padding: 14,
    fontSize: 15,
    color: '#172B4D',
  },
  submit: {
    marginTop: 26,
    backgroundColor: '#1769AA',
    padding: 17,
    borderRadius: 12,
    alignItems: 'center',
  },
  submitText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: 'bold',
  },
  footer: {
    textAlign: 'center',
    color: '#667085',
    fontSize: 12,
    marginTop: 14,
    lineHeight: 18,
  },

  aiStatistics: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    marginTop: 14,
    borderWidth: 1,
    borderColor: '#D9E0EA',
  },

  aiStatisticsTitle: {
    fontSize: 17,
    fontWeight: 'bold',
    color: '#172B4D',
    marginBottom: 6,
  },

  aiStatisticsDescription: {
    fontSize: 13,
    color: '#667085',
    lineHeight: 19,
    marginBottom: 18,
  },

  scoreRow: {
    marginBottom: 15,
  },

  scoreHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 7,
  },

  scoreCategory: {
    fontSize: 14,
    color: '#344054',
    fontWeight: '500',
  },

  scoreValue: {
    fontSize: 14,
    color: '#1769AA',
    fontWeight: 'bold',
  },

  scoreTrack: {
    height: 9,
    backgroundColor: '#E9EEF5',
    borderRadius: 10,
    overflow: 'hidden',
  },

  scoreFill: {
    height: '100%',
    backgroundColor: '#1769AA',
    borderRadius: 10,
  },

  statisticsNote: {
    fontSize: 11,
    color: '#667085',
    lineHeight: 17,
    marginTop: 4,
  },

  aiAssessment: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 15,
    marginTop: 14,
    borderWidth: 1,
    borderColor: '#D9E0EA',
  },

  aiAssessmentTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#1769AA',
    marginBottom: 10,
  },

  aiDescription: {
    fontSize: 16,
    fontWeight: '600',
    color: '#172B4D',
    lineHeight: 23,
    marginBottom: 10,
  },

  aiRelevanceBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
    marginBottom: 9,
  },

  aiRelevant: {
    backgroundColor: '#E5F6EC',
  },

  aiUnrelated: {
    backgroundColor: '#FDECEC',
  },

  aiNeedsReview: {
    backgroundColor: '#FFF4DF',
  },

  aiRelevanceText: {
    fontSize: 12,
    fontWeight: 'bold',
  },

  aiRelevantText: {
    color: '#176B45',
  },

  aiUnrelatedText: {
    color: '#B42318',
  },

  aiNeedsReviewText: {
    color: '#946200',
  },

  aiFeedback: {
    fontSize: 13,
    color: '#475467',
    lineHeight: 19,
  },
  
  mapContainer: {
    marginTop: 14,
    height: 340,
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#D9E0EA',
    backgroundColor: '#FFFFFF',
  },
  map: {
    width: '100%',
    height: '100%',
  },

  expandMapButton: {
    marginTop: 10,
    padding: 14,
    backgroundColor: '#1769AA',
    borderRadius: 10,
    alignItems: 'center',
  },

  expandMapButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: 'bold',
  },

  fullScreenMap: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },

  closeMapButton: {
    position: 'absolute',
    top: 45,
    right: 16,
    backgroundColor: '#FFFFFF',
    paddingVertical: 12,
    paddingHorizontal: 18,
    borderRadius: 10,
    elevation: 5,
  },

  closeMapButtonText: {
    color: '#172B4D',
    fontWeight: 'bold',
    fontSize: 14,
  },

});
