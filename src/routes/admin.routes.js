import { Router } from "express";
import {
    registeruser,
    startEmployeeRegistration,
    getSuperAdminProfile,
    getAllEmployeesByStatus,
    verifyEmployeeRegistration,
    send_otp,
    loginStaff,
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
    getCityByZip,
    adminViewAllOrders,
    adminUpdateOrderStatus,
    adminUpdatePaymentStatus
     } from "../controllers/admin.controller.js";
import { upload } from "../middlewares/multer.middleware.js";
import { verifyJWT } from "../middlewares/auth.middleware.js";
import { validateApiKey } from "../middlewares/validateapi.middleware.js";
import { verifyStaffJWT } from "../middlewares/authstaff.middleware.js";


const router =Router()

router.use(validateApiKey)


router.route("/register").post( registeruser)

router.route("/startRegistration").post(startEmployeeRegistration)
router.route("/employee/startRegistration").post(startEmployeeRegistration)
router.route("/superadmin/profile").get(verifyStaffJWT,getSuperAdminProfile)
router.route("/employees/all").get(verifyStaffJWT,getAllEmployeesByStatus)
router.route("/employee/verify/:tempEmployeeId").post(verifyStaffJWT,verifyEmployeeRegistration)
router.route("/employee/login").post(loginStaff)


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
router.route("/addzipprefix").post(verifyStaffJWT, addZipPrefix);
router.route("/zipprefixes").get(verifyStaffJWT, getZipPrefixes);
router.route("/zipprefix/:id").delete(verifyStaffJWT, deleteZipPrefix);
router.route("/zip/:zip/country/:country").get(verifyStaffJWT, getCityByZip);








// ─────── ORDER ROUTES ─────── 

router.route("/orders/all").get(verifyStaffJWT,adminViewAllOrders);
router.route("/order/:orderId/status").patch(verifyStaffJWT,adminUpdateOrderStatus);
router.route("/order/:orderId/payment").patch(verifyStaffJWT,adminUpdatePaymentStatus);



export default router 


