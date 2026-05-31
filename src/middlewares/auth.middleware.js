import Jwt from "jsonwebtoken";
import { user } from "../models/user.model.js";
import { asynchandler } from "../utils/asynchandler.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { clearAuthCookies } from "../utils/cookieclear.js";

const verifyJWT = asynchandler(async (req, res, next) => {

    try {

        const token =
            req.cookies?.accesstoken ||
            req.header("Authorization")?.replace("Bearer ", "");

        if (!token) {

            clearAuthCookies(res);

            return res.status(401).json(
                new ApiResponse(
                    401,
                    {},
                    "Please login again"
                )
            );
        }

        const decodedToken = Jwt.verify(
            token,
            process.env.Access_Token_Secret
        );

        const User = await user
            .findById(decodedToken?._id)
            .select("-password -refreshToken");

        if (!User) {

            clearAuthCookies(res);

            return res.status(401).json(
                new ApiResponse(
                    401,
                    {},
                    "Please login again"
                )
            );
        }

        req.user = User;

        next();

    } catch (error) {

        clearAuthCookies(res);

        return res.status(401).json(
            new ApiResponse(
                401,
                {},
                error?.name === "TokenExpiredError"
                    ? "Session expired. Please login again."
                    : "Invalid access token"
            )
        );
    }

});


const getLoggedInUserOrIgnore = asynchandler(async (req, res, next) => {

    try {

        const token =
            req.cookies?.accesstoken ||
            req.header("Authorization")?.replace("Bearer ", "");

        if (!token) {
            return next();
        }

        const decodedToken = Jwt.verify(
            token,
            process.env.Access_Token_Secret
        );

        const User = await user
            .findById(decodedToken?._id)
            .select("-password -refreshToken");

        if (User) {
            req.user = User;
        }

        return next();

    } catch (error) {

        clearAuthCookies(res);

        req.user = null;

        return next();
    }

});

export {
    verifyJWT,
    getLoggedInUserOrIgnore
};