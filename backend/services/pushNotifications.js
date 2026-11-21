
const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

async function sendPushNotifications(pushTokens, notification) {
  try {
    if (!Array.isArray(pushTokens) || pushTokens.length === 0) {
      console.log('No registered devices available for notification.');
      return;
    }

    const validTokens = pushTokens.filter(
      (token) =>
        typeof token === 'string' &&
        (
          token.startsWith('ExponentPushToken[') ||
          token.startsWith('ExpoPushToken[')
        )
    );

    if (validTokens.length === 0) {
      console.log('No valid Expo push tokens found.');
      return;
    }

    // Expo accepts batches of notification messages.
    const messages = validTokens.map((token) => ({
      to: token,
      sound: 'default',
      title: notification.title,
      body: notification.body,
      data: notification.data || {},
      priority: 'high',
      channelId: 'default',
    }));

    const response = await fetch(EXPO_PUSH_URL, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Accept-Encoding': 'gzip, deflate',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(messages),
      signal: AbortSignal.timeout(15000),
    });

    const result = await response.json();

    if (!response.ok) {
      console.error('Expo push API error:', result);
      return;
    }

    const tickets = result.data || [];
    const successful = tickets.filter(
      (ticket) => ticket.status === 'ok'
    ).length;

    const failed = tickets.length - successful;

    console.log(
      `Push notification results: ${successful} accepted, ${failed} failed.`
    );

    if (failed > 0) {
      console.error(
        'Push notification delivery tickets:',
        tickets.filter((ticket) => ticket.status === 'error')
      );
    }
  } catch (error) {
    // Notification failures must never interrupt report operations.
    console.error('Push notification service error:', error.message);
  }
}

module.exports = { sendPushNotifications };
