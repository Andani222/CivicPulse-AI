const configuredApiUrl = process.env.EXPO_PUBLIC_API_URL?.trim();

if (!configuredApiUrl) {
  throw new Error(
    'EXPO_PUBLIC_API_URL is missing. Configure it in the project root .env file.'
  );
}

export const API_BASE_URL = configuredApiUrl.replace(/\/+$/, '');
