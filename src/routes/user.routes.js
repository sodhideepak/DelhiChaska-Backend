import { Router } from "express";
import {
    registeruser,
    startRegistration,
    send_otp,
    loginuser,
    logout,
    delete_account,
    // verifyemail,
    refreshAccessToken,
    changeCurrentPassword,
    addAddress,
    editAddress,
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
    verifyEmail_registeruser,
    deleteUser,
    deleteAllAddresses,
    deleteAddress
     } from "../controllers/user.controller.js";
import { upload } from "../middlewares/multer.middleware.js";
import { verifyJWT } from "../middlewares/auth.middleware.js";
import { validateApiKey } from "../middlewares/validateapi.middleware.js";


const router =Router()

router.use(validateApiKey)


router.route("/register").post( registeruser)

router.route("/startRegistration").post( startRegistration)


router.route("/verifyEmail_registeruser").post( verifyEmail_registeruser)

router.route("/sendotp").post(send_otp)

// router.route("/verifyemail").post(verifyemail)

router.route("/login").post(loginuser)

router.route("/logout" ).post(verifyJWT,logout)

router.route("/delete_account" ).delete(delete_account)

router.route("/refresh-token" ).post(refreshAccessToken)

router.route("/change-password" ).post(verifyJWT,changeCurrentPassword)

router.route("/address/add").post(verifyJWT,addAddress)
router.route("/address/:addressId").patch(verifyJWT,editAddress)
router.route("/address/:addressId").delete(verifyJWT,deleteAddress)

router.route("/current-user" ).get(verifyJWT,getCurrentuser)

router.route("/update-account" ).patch(verifyJWT,updateAccountDetails)

router.route("/avatar" ).patch(verifyJWT,upload.single("avatar"),updateUserAvatar)

router.route("/removeavatar" ).patch(verifyJWT,removeUserAvatar)

// router.route("/coverimage" ).patch(verifyJWT,upload.single("coverimage"),updateUsercoverImage)

// router.route("/channel-profile").get(verifyJWT,getUserChannelProfile)

// router.route("/history").get(verifyJWT,getWatchHistory)

router.route("/forgotpassword").post(forgotpassword)

router.route("/resetpassword").post(resetpassword)




router.route("/deleteuser/:userId").delete(deleteUser)






// contact and booking form 
router.route("/contactenquiry").post(contactformenquiry)


router.route("/bookingenquiry").post(bookingformenquiry)



router.route("/deletealladdress").delete(verifyJWT, deleteAllAddresses);




export default router 




// POST /register
// POST /verify-otp
// POST /login
// POST /address/add
// PATCH /address/update
// DELETE /address/:id
