// httpOnly cookie helpers for the JWT session token.
const COOKIE_NAME = 'token';

function cookieOptions() {
  const isProd = process.env.NODE_ENV === 'production';
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure: isProd,
    maxAge: 8 * 60 * 60 * 1000, // 8h — matches JWT_EXPIRE
    path: '/',
  };
}

function setTokenCookie(res, token) {
  res.cookie(COOKIE_NAME, token, cookieOptions());
}

function clearTokenCookie(res) {
  res.clearCookie(COOKIE_NAME, { ...cookieOptions(), maxAge: undefined });
}

module.exports = { COOKIE_NAME, setTokenCookie, clearTokenCookie };
