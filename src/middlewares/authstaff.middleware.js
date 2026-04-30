import { ApiError } from "../utils/ApiError.js";
import { asynchandler } from "../utils/asynchandler.js";
import Jwt from "jsonwebtoken";
import { Employee } from "../models/employee.model.js";

// ==========================
// 🔐 VERIFY STAFF JWT (STRICT)
// ==========================
const verifyStaffJWT = asynchandler(async (req, _, next) => {
    try {
        const accessToken = req.headers.cookie?.match(/accesstoken=([^;]+)/)?.[1];

        const token =
            accessToken ||
            req.headers.cookie?.accesstoken ||
            req.header("Authorization")?.replace("Bearer ", "");

        console.log("headers cookie:", accessToken);

        if (!token) {
            throw new ApiError(401, "unauthorized staff request");
        }

        const decodedtoken = Jwt.verify(token, process.env.Access_Token_Secret);

        const staff = await Employee.findById(decodedtoken?._id)
            .select("-password -refreshtoken");

        if (!staff) {
            throw new ApiError(401, "invalid access token (staff)");
        }

        // optional but useful: block unapproved staff
        if (staff.status !== "verified") {
            throw new ApiError(403, "staff not approved");
        }

        req.staff = staff; // 🔥 separate from req.user
        next();

    } catch (error) {
        throw new ApiError(401, error?.message || "invalid staff access token");
    }
});


// ==========================
// 🧠 OPTIONAL STAFF AUTH
// ==========================
const getLoggedInStaffOrIgnore = asynchandler(async (req, res, next) => {

    const token =
        req.cookies?.accesstoken ||
        req.header("Authorization")?.replace("Bearer ", "");

    try {
        const decodedtoken = Jwt.verify(token, process.env.Access_Token_Secret);

        const staff = await Employee.findById(decodedtoken?._id)
            .select("-password -refreshToken");

        req.staff = staff;
        next();

    } catch (error) {
        // fail silently
        next();
    }
});


// ==========================
// 🛡️ ROLE BASED ACCESS
// ==========================
const allowRoles = (...roles) => {
    return (req, res, next) => {
        if (!req.staff) {
            throw new ApiError(401, "unauthorized");
        }

        if (!roles.includes(req.staff.role)) {
            throw new ApiError(403, "access denied");
        }

        next();
    };
};

export {
    verifyStaffJWT,
    getLoggedInStaffOrIgnore,
    allowRoles
};