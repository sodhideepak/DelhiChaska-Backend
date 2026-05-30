
import { Router } from "express";
// import { addToCart } from "../controllers/order.controller.js";
import { addToCart,
         viewCart,
         getNextDeliveryDate,
         removeFromCart,
         deleteCartItem,
         clearCart,
         ProceedToOrder,
         viewMyOrders,
            notifyPaymentDone,
            deleteAllOrdersOfUser,  
            getOrderAcceptanceStatus,
            getNextDeliveryDate2,
         viewAllOrders } from "../controllers/order.controller.js";
import { validateApiKey } from "../middlewares/validateapi.middleware.js";
import { verifyJWT } from "../middlewares/auth.middleware.js";
import { verifyStaffJWT } from "../middlewares/authstaff.middleware.js";

const router = Router();

router.use(validateApiKey)

router.route("/nextdeliverydate").get(getNextDeliveryDate)
router.route("/nextdeliverydate2").get(getNextDeliveryDate2)


router.route("/addtocart").post(verifyJWT,addToCart)
router.route("/viewcart").get(verifyJWT,viewCart)
router.route("/removefromcart").post(verifyJWT,removeFromCart)
router.route("/deletecartitem").post(verifyJWT,deleteCartItem)
router.route("/clearcart").post(verifyJWT,clearCart)


router.route("/proceedtoorder").post(verifyJWT,ProceedToOrder)
router.route("/myorders").get(verifyJWT,viewMyOrders)
router.route("/notifypaymentdone/:orderId").post(verifyJWT,notifyPaymentDone)




// admin routes
router.route("/allorders").get(verifyStaffJWT,viewAllOrders)

router.route("/deleteuserorders/:userId").delete(verifyStaffJWT,deleteAllOrdersOfUser)
router.route("/getorderacceptancestatus").get(verifyStaffJWT,getOrderAcceptanceStatus)




export default router;