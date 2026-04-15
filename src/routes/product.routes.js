import { Router } from "express";
import {
    createProduct,
    getAllProducts,
    getProductById,
    updateProduct,
    deleteProduct,
    toggleProductAvailability,
    getProductsByCategory,
    getProductCategories,
    createCombo,
    getCombos,
    getComboById,
    deleteCombo,
    updateCombo,
    updateComboStatus

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


// Super admin only routes (authentication required)
router.route("/create").post(verifyJWT, upload.single("image"), createProduct)
router.route("/createcombo").post(verifyJWT, createCombo)
router.route("/update/:productId").patch(verifyJWT, upload.single("image"), updateProduct)
router.route("/delete/:productId").delete(verifyJWT, deleteProduct)
router.route("/toggle/:productId").patch(verifyJWT, toggleProductAvailability)


router.route("/combos").get(getCombos);
router.route("/singlecombo/:comboId").get(getComboById);
router.route("/updatecombo/:comboId").patch(verifyJWT, updateCombo);
router.route("/deletecombo/:comboId").delete(verifyJWT, deleteCombo);
router.route("/updatecombostatus/:comboId").patch(verifyJWT, updateComboStatus);









router.route("/:productId").get(getProductById)
export default router;