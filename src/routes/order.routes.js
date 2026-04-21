
import { Router } from "express";
// import { addToCart } from "../controllers/order.controller.js";
import { addToCart,
         viewCart,
         getNextDeliveryDate,
         removeFromCart } from "../controllers/order.controller.js";
import { validateApiKey } from "../middlewares/validateapi.middleware.js";
import { verifyJWT } from "../middlewares/auth.middleware.js";

const router = Router();

router.use(validateApiKey)

router.route("/nextdeliverydate").get(getNextDeliveryDate)


router.route("/addtocart").post(verifyJWT,addToCart)
router.route("/viewcart").get(verifyJWT,viewCart)
router.route("/removefromcart").post(verifyJWT,removeFromCart)


export default router;