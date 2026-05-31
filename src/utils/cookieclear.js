export const clearAuthCookies = (res) => {
    const cookieOptions = {
        httpOnly: true,
        secure: true,
        sameSite: "none"
    };

    return res
        .clearCookie("accesstoken", cookieOptions)
        .clearCookie("refreshtoken", cookieOptions);
};