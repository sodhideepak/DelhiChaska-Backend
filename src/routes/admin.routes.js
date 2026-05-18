import { Router } from "express";
import {
    registeruser,
    startEmployeeRegistration,
    getSuperAdminProfile,
    getAllEmployeesByStatus,
    verifyEmployeeRegistration,
    send_otp,
    loginStaff,
    logoutStaff,
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
    adminUpdatePaymentStatus,
    adminViewOrdersByArea,
        getAllUsers,
        kitchenViewOrdersByArea,
        assignAreaToDriver,
        getAllDrivers,
        deleteEmployee,
        getUnverifiedDrivers,
        getAllDriversfull,
            resetAllDrivers,
        createDeliveryBatch,
        getDeliveryBatchDetails,
        reorderDeliveryBatch,
        finalizeDeliveryBatch,
        driverViewMyBatches,
        getUnassignedConfirmedOrders,
        resetConfirmedOrders,
        adminPaymentHistoryByArea,
        sendPaymentReminder,
        sendBulkPaymentRemindersByArea,
        deleteAllOrders,
        getOrderUserDetailsForAdmin,
        markOrderAsDelivered,
        getAllDeliveryBatches,
        editEmployeeDetails,
        setDriverForNextDelivery
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
router.route("/employee/logout").post(verifyStaffJWT,logoutStaff)
router.route("/employee/edit/:employeeId").patch(verifyStaffJWT,editEmployeeDetails)

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
router.route("/order/orderstatus/:orderId").patch(verifyStaffJWT,adminUpdateOrderStatus);
router.route("/order/updatepaymentstatus/:orderId").patch(verifyStaffJWT,adminUpdatePaymentStatus);
router.route("/orders/area").get(verifyStaffJWT,adminViewOrdersByArea);





// kitchen routes
router.route("/orders/kitchen/area").get(verifyStaffJWT,kitchenViewOrdersByArea)
router.route("/orders/getuserdetails/:orderId").get(verifyStaffJWT,getOrderUserDetailsForAdmin)
    


router.route("/orders/unassigned-confirmed").get(verifyStaffJWT,getUnassignedConfirmedOrders)


// Driver assignment route
router.route("/drivers").get(verifyStaffJWT,getAllDrivers)
router.route("/assignarea/driver").post(verifyStaffJWT,assignAreaToDriver)
router.route("/resetdrivers").post(verifyStaffJWT,resetAllDrivers)







router.route("/allusers").get(verifyStaffJWT,getAllUsers)








router.route("/unverifieddrivers").get(verifyStaffJWT,getUnverifiedDrivers)






router.route("/alldriversfull").get(verifyStaffJWT,getAllDriversfull)




router.route('/getallbatches').get(verifyStaffJWT,getAllDeliveryBatches)


router.route("/employee/:employeeId").delete(verifyStaffJWT,deleteEmployee)






router.route("/resetConfirmedOrders").post(verifyStaffJWT,resetConfirmedOrders)









router.route("/createdeliverybatch").post(verifyStaffJWT,createDeliveryBatch)
router.route("/deliverybatch/:batchId").get(verifyStaffJWT,getDeliveryBatchDetails) 
router.route("/deliverybatch/reorder/:batchId").patch(verifyStaffJWT,reorderDeliveryBatch)
router.route("/deliverybatch/finalize/:batchId").patch(verifyStaffJWT,finalizeDeliveryBatch)
router.route("/driver/batches").get(verifyStaffJWT,driverViewMyBatches)
router.route("/driver/markorderdelivered/:orderId").post(verifyStaffJWT,upload.single("deliveryImage"),markOrderAsDelivered)  
router.route("/setdriverfornextdelivery").post(verifyStaffJWT,setDriverForNextDelivery)








// Payment routes
router.route("/paymenthistory/area").get(verifyStaffJWT,adminPaymentHistoryByArea)
router.route("/paymentreminder/:orderId").post(verifyStaffJWT,sendPaymentReminder)
router.route("/bulkpaymentreminders/area/:area").post(verifyStaffJWT,sendBulkPaymentRemindersByArea)
















router.route("/deleteallorders").delete(verifyStaffJWT,deleteAllOrders)
export default router 


