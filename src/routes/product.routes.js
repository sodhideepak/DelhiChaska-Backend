import { Router } from "express";
import {
    createProduct,
    getAllProducts,
    getProductById,
    updateProduct,
    deleteProduct,
    toggleProductAvailability,
    getProductsByCategory,
    getProductCategories
} from "../controllers/product.controller.js";
import { upload } from "../middlewares/multer.middleware.js";
import { verifyJWT } from "../middlewares/auth.middleware.js";
import { validateApiKey } from "../middlewares/validateapi.middleware.js";

const router = Router()

router.use(validateApiKey)

// Public routes (no authentication required)
router.route("/all").get(getAllProducts)
router.route("/categories").get(getProductCategories)
router.route("/category/:category").get(getProductsByCategory)
router.route("/:productId").get(getProductById)

// Super admin only routes (authentication required)
router.route("/create").post(verifyJWT, upload.single("image"), createProduct)
router.route("/update/:productId").patch(verifyJWT, upload.single("image"), updateProduct)
router.route("/delete/:productId").delete(verifyJWT, deleteProduct)
router.route("/toggle/:productId").patch(verifyJWT, toggleProductAvailability)

export default router;