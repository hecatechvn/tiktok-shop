export interface JwtPayload {
  sub: string;
  userName: string;
  role: string;
  iat?: number;
  exp?: number;
}
