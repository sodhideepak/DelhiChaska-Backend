import { Cart } from "../models/cart.model.js";
import { Combo } from "../models/combo.model.js";
import { Product } from "../models/product.model.js";
import { asynchandler } from "../utils/asynchandler.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { ApiError } from "../utils/ApiError.js";

const addToCart = asynchandler(async (req, res) => {
    const userId = req.user._id;

    const {
        comboId,
        mode,
        selectedItems = [],
        addOns = []
    } = req.body;

    if (!comboId) {
        throw new ApiError(400, "comboId is required");
    }

    // ==========================
    // 🔍 FETCH COMBO
    // ==========================
    const combo = await Combo.findById(comboId);
    if (!combo) {
        throw new ApiError(404, "combo not found");
    }

    // ==========================
    // 🔍 FETCH PRODUCTS
    // ==========================
    const productIds = [
        ...selectedItems.map(i => i.productId),
        ...addOns.map(i => i.productId)
    ];

    const products = await Product.find({
        _id: { $in: productIds }
    });

    const productMap = {};
    products.forEach(p => {
        productMap[p._id.toString()] = p;
    });

    // ==========================
    // 🔐 VALIDATE COMBO RULES
    // ==========================
    const grouped = {};

    selectedItems.forEach(item => {
        const product = productMap[item.productId];

        if (!product) throw new ApiError(400, "invalid product");

        grouped[product.category] =
            (grouped[product.category] || 0) + item.quantity;
    });

    combo.rules.forEach(rule => {
        let total = 0;

        rule.category.forEach(cat => {
            total += grouped[cat] || 0;
        });

        if (total !== rule.quantity) {
            throw new ApiError(
                400,
                `Invalid selection for ${rule.category.join(", ")}`
            );
        }
    });

    // ==========================
    // 🥦 VEG MODE
    // ==========================
    if (mode === "veg") {
        selectedItems.forEach(item => {
            const product = productMap[item.productId];

            if (product.type === "nonveg") {
                throw new ApiError(400, "non-veg not allowed");
            }
        });
    }

    // ==========================
    // ➕ VALIDATE ADD-ONS
    // ==========================
    addOns.forEach(item => {
        const product = productMap[item.productId];

        if (!product || !product.isAddOnAvailable) {
            throw new ApiError(400, "invalid add-on");
        }
    });

    // ==========================
    // 💰 PRICING
    // ==========================
    let comboPrice = combo.price;

    let addOnTotal = addOns.reduce((sum, item) => {
        const product = productMap[item.productId];
        return sum + product.price * item.quantity;
    }, 0);

    const totalAmount = comboPrice + addOnTotal;

    // ==========================
    // 📦 BUILD STRUCTURED DATA
    // ==========================
    const comboItems = selectedItems.map(item => {
        const product = productMap[item.productId];

        return {
            productId: product._id,
            name: product.name,
            category: product.category,
            quantity: item.quantity,
            price: product.price
        };
    });

    const addOnItems = addOns.map(item => {
        const product = productMap[item.productId];

        return {
            productId: product._id,
            name: product.name,
            quantity: item.quantity,
            price: product.price
        };
    });

    // ==========================
    // 🛒 UPSERT CART
    // ==========================
    const cart = await Cart.findOneAndUpdate(
        { userId },
        {
            combo: {
                comboId: combo._id,
                name: combo.name,
                items: comboItems,
                price: comboPrice
            },
            addOns: addOnItems,
            totalAmount
        },
        { new: true, upsert: true }
    );

    return res.status(200).json(
        new ApiResponse(200, cart, "cart updated successfully")
    );
});


export {
    addToCart
}