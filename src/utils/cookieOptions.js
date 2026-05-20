// utils/cookieOptions.js

export const cookieOptions = {
    httpOnly: true,
    secure: true,      // true in production
    sameSite: "none",
    path: "/"
}