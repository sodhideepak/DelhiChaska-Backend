import { Router } from "express";
import {
    registeruser,
    startEmployeeRegistration,
    getSuperAdminProfile,
    getAllEmployeesByStatus,
    verifyEmployeeRegistration,
    send_otp,
    loginuser,
    logout,
    delete_account,
    // verifyemail,
    refreshAccessToken,
    changeCurrentPassword,
    getCurrentuser,
    updateAccountDetails,
    updateUserAvatar,
    removeUserAvatar,
    // updateUsercoverImage,
    // getUserChannelProfile,
    // getWatchHistory,
    forgotpassword,
    resetpassword,
    contactformenquiry,
    bookingformenquiry,
    addZipPrefix,
    getZipPrefixes,
    deleteZipPrefix,
    getCityByZip
     } from "../controllers/admin.controller.js";
import { upload } from "../middlewares/multer.middleware.js";
import { verifyJWT } from "../middlewares/auth.middleware.js";
import { validateApiKey } from "../middlewares/validateapi.middleware.js";


const router =Router()

router.use(validateApiKey)


router.route("/register").post( registeruser)

router.route("/startRegistration").post(startEmployeeRegistration)
router.route("/employee/startRegistration").post(startEmployeeRegistration)
router.route("/superadmin/profile").get(verifyJWT,getSuperAdminProfile)
router.route("/employees/all").get(verifyJWT,getAllEmployeesByStatus)
router.route("/employee/verify/:tempEmployeeId").post(verifyJWT,verifyEmployeeRegistration)



router.route("/sendotp").post(send_otp)

// router.route("/verifyemail").post(verifyemail)

router.route("/login").post(loginuser)

router.route("/logout" ).post(verifyJWT,logout)

router.route("/delete_account" ).delete(delete_account)

router.route("/refresh-token" ).post(refreshAccessToken)

router.route("/change-password" ).post(verifyJWT,changeCurrentPassword)

router.route("/current-user" ).get(verifyJWT,getCurrentuser)

router.route("/update-account" ).patch(verifyJWT,updateAccountDetails)

router.route("/avatar" ).patch(verifyJWT,upload.single("avatar"),updateUserAvatar)

router.route("/removeavatar" ).patch(verifyJWT,removeUserAvatar)

// router.route("/coverimage" ).patch(verifyJWT,upload.single("coverimage"),updateUsercoverImage)

// router.route("/channel-profile").get(verifyJWT,getUserChannelProfile)

// router.route("/history").get(verifyJWT,getWatchHistory)

router.route("/forgotpassword").post(forgotpassword)

router.route("/resetpassword").post(resetpassword)






// contact and booking form 
router.route("/contactenquiry").post(contactformenquiry)


router.route("/bookingenquiry").post(bookingformenquiry)




// zip prefix routes
router.route("/zip-prefix").post(verifyJWT, addZipPrefix);
router.route("/zip-prefixes").get(verifyJWT, getZipPrefixes);
router.route("/zip-prefix/:id").delete(verifyJWT, deleteZipPrefix);
router.route("/zip/:zip/country/:country").get(verifyJWT, getCityByZip);







export default router 


