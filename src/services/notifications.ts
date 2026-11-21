import { API_BASE_URL } from '../config/api';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

const API_URL = API_BASE_URL;

export async function registerForPushNotifications(
  authToken: string
) {
  try {
    if (!Device.isDevice) {
      console.log('Push notifications require a physical device.');
      return;
    }

    const projectId =
      Constants.easConfig?.projectId ||
      Constants.expoConfig?.extra?.eas?.projectId;

    if (!projectId) {
      console.warn('Expo project ID is not configured yet.');
      return;
    }

    if (Device.osName === 'Android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'CivicPulse Notifications',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#208AEF',
      });
    }

    const { status: existingStatus } =
      await Notifications.getPermissionsAsync();

    let finalStatus = existingStatus;

    if (existingStatus !== 'granted') {
      const permission = await Notifications.requestPermissionsAsync();
      finalStatus = permission.status;
    }

    if (finalStatus !== 'granted') {
      console.log('Notification permission was not granted.');
      return;
    }

    const tokenResponse =
      await Notifications.getExpoPushTokenAsync({ projectId });

    const pushToken = tokenResponse.data;

    const response = await fetch(
      `${API_URL}/api/notifications/register-token`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({ pushToken }),
      }
    );

    const result = await response.json();

    if (!response.ok) {
      throw new Error(
        result.message || 'Unable to register notification device.'
      );
    }

    console.log('CivicPulse notification device registered.');
  } catch (error) {
    console.error('Push notification registration failed:', error);
  }
}
