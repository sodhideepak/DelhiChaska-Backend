
import { Router } from "express";
import { addToCart } from "../controllers/order.controller.js";
import { validateApiKey } from "../middlewares/validateapi.middleware.js";
import { verifyJWT } from "../middlewares/auth.middleware.js";

const router = Router();

router.use(validateApiKey)



router.route("/addtocart").post(verifyJWT,addToCart)


export default router;