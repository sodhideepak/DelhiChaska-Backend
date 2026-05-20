// utils/cookieOptions.js

export const cookieOptions = {
    httpOnly: true,
    secure: true,      // true in production
    sameSite: "none",
    path: "/",
    maxAge: 7 * 24 * 60 * 60 * 1000
}