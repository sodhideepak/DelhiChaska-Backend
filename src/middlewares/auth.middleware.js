import { ApiError } from "../utils/ApiError.js";
import { asynchandler } from "../utils/asynchandler.js";
import  Jwt  from "jsonwebtoken";
import { user } from "../models/user.model.js";


const verifyJWT= asynchandler(async(req,_,next)=>{
    try {
      const accessToken = req.headers.cookie?.match(/accesstoken=([^;]+)/)?.[1];
        const token=accessToken || req.headers.cookie.accestoken ||  req.header("Authorization")?.replace("Bearer ","")
        // console.log("cookies:", req.cookies);
        console.log("headers cookie:", accessToken);
        // console.log("access token:", req.cookies?.accesstoken);
    
        if (!token) {
            throw new ApiError(401,"unauthorized request")
            
        }
    
        const decodedtoken= Jwt.verify(token,process.env.Access_Token_Secret)
    
        const User = await user.findById(decodedtoken?._id).select("-password -refreshtoken")
    
        if (!User) {
            throw new ApiError(401,"invalid access token")
            
        }
    
        req.user =User;
        next()
    
    } catch (error) {
        throw new ApiError(401,error?.message || "inavalid access token")
    }
})

 const getLoggedInUserOrIgnore = asynchandler(async (req, res, next) => {
    const token =
      req.cookies?.accessToken ||
      req.header("Authorization")?.replace("Bearer ", "");
  
    try {
        const decodedtoken= Jwt.verify(token,process.env.Access_Token_Secret)
      const User = await user.findById(decodedtoken?._id).select(
        "-password -refreshToken"
      );
      req.user = User;
      next();
    } catch (error) {
      // Fail silently with req.user being falsy
      next();
    }
  });
export {verifyJWT,getLoggedInUserOrIgnore}