export interface UserIdentity {
  id: string;
  browserUuid: string;
  displayName?: string;
  createdAt: string;
}

export interface OAuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
  scopes: string[];
}

export interface EncryptedTokens {
  encryptedAccessToken: string;
  encryptedRefreshToken: string;
  tokenExpiry: string;
  scopes: string[];
}

export interface CalendarEvent {
  id: string;
  summary: string;
  description?: string;
  start: { dateTime?: string; date?: string; timeZone?: string };
  end: { dateTime?: string; date?: string; timeZone?: string };
  colorId?: string;
  recurrence?: string[];
  htmlLink?: string;
}

export interface FreeBusySlot {
  start: string;
  end: string;
}

export interface HomeAgentSession {
  id: string;
  userId: string;
  title?: string;
  messages: unknown[];
  createdAt: string;
  updatedAt: string;
}
