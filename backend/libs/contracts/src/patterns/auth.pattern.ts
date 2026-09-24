export const AUTH_PATTERNS = {
  GET_PROFILE: 'auth.get_profile',
  REGISTER: 'auth.register',
  LOGIN: 'auth.login',
  SOCIAL_LOGIN: 'auth.social_login',
} as const;

export const AUTH_EVENTS = {
  USER_CREATED: 'auth.user_created',
} as const;
