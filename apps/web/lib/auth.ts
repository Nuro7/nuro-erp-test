export type AuthUser = {
  id: string;
  email: string;
  roles: string[];
};

export type LoginResponse = {
  accessToken: string;
  refreshToken: string;
  user: AuthUser;
};
