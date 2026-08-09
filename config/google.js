import { google } from 'googleapis';
import { env } from './env.js';

export const GOOGLE_SCOPES = [
  'https://www.googleapis.com/auth/userinfo.profile',
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/spreadsheets',
  'https://www.googleapis.com/auth/drive.file',
  'https://www.googleapis.com/auth/gmail.send'
];

export function getOAuth2Client(customRedirectUri) {
  return new google.auth.OAuth2(
    env.GOOGLE_CLIENT_ID,
    env.GOOGLE_CLIENT_SECRET,
    customRedirectUri || env.GOOGLE_REDIRECT_URI
  );
}

export function getGoogleServices(tokens = {}) {
  const client = getOAuth2Client();

  if (tokens && (tokens.access_token || tokens.refresh_token)) {
    client.setCredentials(tokens);
  }

  const sheets = google.sheets({ version: 'v4', auth: client });
  const drive = google.drive({ version: 'v3', auth: client });
  const gmail = google.gmail({ version: 'v1', auth: client });

  return { oauth2Client: client, sheets, drive, gmail };
}
