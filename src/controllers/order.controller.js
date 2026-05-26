import { Cart } from "../models/cart.model.js";
import { Order } from "../models/order.model.js";
import { Product } from "../models/product.model.js";
import { Combo } from "../models/combo.model.js";
import { asynchandler } from "../utils/asynchandler.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { ApiError } from "../utils/ApiError.js";
import { Address } from "../models/address.model.js";
import { user } from "../models/user.model.js";
import { sendEmail } from "../utils/sendutilmail.js";
import mongoose from "mongoose";
 




const SUPER_ADMIN_EMAIL = process.env.SUPER_ADMIN_EMAIL || "deepaksodhi0023@gmail.com";
const HARD_CODED_SUPER_ADMIN_ROLE = "super_admin";


const adminEmails =
   process.env.SUPER_ADMIN_EMAILS

      ?.split(",")

      .map(email =>

        email
          .trim()
          .toLowerCase()
      ) || [];



const ensureSuperAdmin = (req) => {

  // ─────────────────────────────────────────────
  // GET EMAILS FROM ENV
  // ─────────────────────────────────────────────
  const superAdminEmails =

    process.env.SUPER_ADMIN_EMAILS

      ?.split(",")

      .map(email =>

        email
          .trim()
          .toLowerCase()
      ) || [];

  // ─────────────────────────────────────────────
  // CURRENT USER EMAIL
  // ─────────────────────────────────────────────
  const currentUserEmail =

    req.staff?.email
      ?.trim()
      ?.toLowerCase();

  // ─────────────────────────────────────────────
  // CHECK SUPER ADMIN
  // ─────────────────────────────────────────────
  const isSuperAdmin =

    superAdminEmails.includes(
      currentUserEmail
    );

  // ─────────────────────────────────────────────
  // NOT ALLOWED
  // ─────────────────────────────────────────────
  if (!isSuperAdmin) {

    throw new ApiError(
      403,
      "Only super admin can perform this action"
    );
  }

  // ─────────────────────────────────────────────
  // RETURN
  // ─────────────────────────────────────────────
  return {

    role:
      HARD_CODED_SUPER_ADMIN_ROLE,

    email:
      currentUserEmail
  };
};



// ============================================================
// 🛒 PLACE ORDER
// Converts current cart into a confirmed order
// Supports: combo + add-ons + standalone individual products
// ============================================================
const placeOrder = asynchandler(async (req, res) => {
    const userId = req.user._id;

    const { notes = "" } = req.body;

    // ==========================
    // 🔍 FETCH CART
    // ==========================
    const cart = await Cart.findOne({ userId });

    if (!cart) {
        throw new ApiError(404, "cart not found. please add items first");
    }

    const hasCombo = cart.combo?.comboId;
    const hasIndividual = cart.individualItems?.length > 0;

    if (!hasCombo && !hasIndividual) {
        throw new ApiError(400, "cart is empty");
    }

    // ==========================
    // 📊 BUILD PRODUCT SUMMARY
    // Merge combo items + individual items into flat qty map
    // ==========================
    const summaryMap = {};

    const addToSummary = (item) => {
        const key = `${item.productId}_${item.portion || "standard"}`;

        if (summaryMap[key]) {
            summaryMap[key].totalQuantity += item.quantity;
        } else {
            summaryMap[key] = {
                productId: item.productId,
                name: item.name,
                category: item.category,
                portion: item.portion || "standard",
                totalQuantity: item.quantity
            };
        }
    };

    // Add combo items to summary
    if (hasCombo) {
        cart.combo.items.forEach(addToSummary);
        cart.addOns.forEach(addToSummary);
    }

    // Add standalone individual items to summary
    if (hasIndividual) {
        cart.individualItems.forEach(addToSummary);
    }

    const productSummary = Object.values(summaryMap);

    // ==========================
    // 💰 CALCULATE TOTALS
    // ==========================
    const comboTotal    = cart.combo?.price || 0;
    const addOnTotal    = cart.addOns.reduce((sum, i) => sum + i.price * i.quantity, 0);
    const individualTotal = cart.individualItems.reduce(
        (sum, i) => sum + i.unitPrice * i.quantity, 0
    );
    const totalAmount = comboTotal + addOnTotal + individualTotal;

    // ==========================
    // 📦 CREATE ORDER
    // ==========================
    const order = await Order.create({
        userId,

        combo: hasCombo
            ? {
                comboId: cart.combo.comboId,
                name: cart.combo.name,
                items: cart.combo.items,
                price: cart.combo.price
            }
            : undefined,

        addOns: cart.addOns,

        individualItems: cart.individualItems,

        comboTotal,
        addOnTotal,
        individualTotal,
        totalAmount,

        productSummary,

        status: "pending",
        notes
    });

    // ==========================
    // 🗑️ CLEAR CART AFTER ORDER
    // ==========================
    await Cart.findOneAndUpdate(
        { userId },
        {
            combo: {},
            addOns: [],
            individualItems: [],
            comboTotal: 0,
            addOnTotal: 0,
            individualTotal: 0,
            totalAmount: 0
        }
    );

    return res.status(201).json(
        new ApiResponse(201, order, "order placed successfully")
    );
});


// ============================================================
// 📋 GET USER ORDERS
// Returns all orders for logged-in user
// ============================================================
const getUserOrders = asynchandler(async (req, res) => {
    const userId = req.user._id;

    const orders = await Order.find({ userId }).sort({ createdAt: -1 });

    if (!orders.length) {
        throw new ApiError(404, "no orders found");
    }

    return res.status(200).json(
        new ApiResponse(200, orders, "orders fetched successfully")
    );
});


// ============================================================
// 🔍 GET SINGLE ORDER DETAIL
// ============================================================
const getOrderById = asynchandler(async (req, res) => {
    const userId = req.user._id;
    const { orderId } = req.params;

    const order = await Order.findOne({ _id: orderId, userId });

    if (!order) {
        throw new ApiError(404, "order not found");
    }

    return res.status(200).json(
        new ApiResponse(200, order, "order fetched successfully")
    );
});


// ============================================================
// 📊 GET USER PRODUCT SUMMARY
// Final merged qty of each product tied to this userId
// Covers ALL confirmed orders — useful for admin/kitchen view
// ============================================================
const getUserProductSummary = asynchandler(async (req, res) => {
    const userId = req.user._id;

    // ==========================
    // 🔍 FETCH ALL ORDERS
    // ==========================
    const orders = await Order.find({
        userId,
        status: { $in: ["confirmed", "preparing", "delivered"] }
    });

    if (!orders.length) {
        throw new ApiError(404, "no confirmed orders found for this user");
    }

    // ==========================
    // 📊 AGGREGATE PRODUCT SUMMARY
    // Merge productSummary from ALL orders into one flat map
    // ==========================
    const globalSummaryMap = {};

    orders.forEach(order => {
        order.productSummary.forEach(item => {
            const key = `${item.productId}_${item.portion}`;

            if (globalSummaryMap[key]) {
                globalSummaryMap[key].totalQuantity += item.totalQuantity;
            } else {
                globalSummaryMap[key] = {
                    productId: item.productId,
                    name: item.name,
                    category: item.category,
                    portion: item.portion,
                    totalQuantity: item.totalQuantity
                };
            }
        });
    });

    const summary = Object.values(globalSummaryMap);

    return res.status(200).json(
        new ApiResponse(200,
            {
                userId,
                totalOrders: orders.length,
                summary
            },
            "user product summary fetched successfully"
        )
    );
});


// ============================================================
// ❌ CANCEL ORDER
// Only allowed if status is "pending"
// ============================================================
const cancelOrder = asynchandler(async (req, res) => {
    const userId = req.user._id;
    const { orderId } = req.params;

    // ==========================
    // 🔍 FIND ORDER
    // ==========================
    const order = await Order.findOne({ _id: orderId, userId });

    if (!order) {
        throw new ApiError(404, "order not found");
    }

    // ==========================
    // 🔐 VALIDATE STATUS
    // ==========================
    if (order.status !== "pending") {
        throw new ApiError(
            400,
            `cannot cancel order with status: ${order.status}`
        );
    }

    order.status = "cancelled";
    await order.save();

    return res.status(200).json(
        new ApiResponse(200, order, "order cancelled successfully")
    );
});


// ============================================================
// 🔧 UPDATE ORDER STATUS  [ADMIN ONLY]
// ============================================================
const updateOrderStatus = asynchandler(async (req, res) => {
    const { orderId } = req.params;
    const { status } = req.body;

    const validStatuses = ["pending", "confirmed", "preparing", "delivered", "cancelled"];

    // ==========================
    // 🔐 VALIDATE STATUS
    // ==========================
    if (!validStatuses.includes(status)) {
        throw new ApiError(
            400,
            `invalid status. allowed: ${validStatuses.join(", ")}`
        );
    }

    // ==========================
    // 🔍 FIND & UPDATE ORDER
    // ==========================
    const order = await Order.findByIdAndUpdate(
        orderId,
        { status },
        { new: true }
    );

    if (!order) {
        throw new ApiError(404, "order not found");
    }

    return res.status(200).json(
        new ApiResponse(200, order, "order status updated successfully")
    );
});


// ============================================================
// 📋 GET ALL ORDERS  [ADMIN ONLY]
// With optional status filter
// ============================================================
const getAllOrders = asynchandler(async (req, res) => {
    const { status } = req.query;

    const filter = {};
    if (status) filter.status = status;

    const orders = await Order.find(filter)
        .populate("userId", "name email phone")
        .sort({ createdAt: -1 });

    return res.status(200).json(
        new ApiResponse(200, orders, "all orders fetched successfully")
    );
});



const addToCart = asynchandler(async (req, res) => {

  // ─────────────────────────────────────────────
  // AUTH CHECK
  // ─────────────────────────────────────────────
  if (!req.user || !req.user._id) {

    throw new ApiError(
      401,
      "Unauthorized user"
    );
  }

  const userId = req.user._id;

  const { items } = req.body;

  // ─────────────────────────────────────────────
  // VALIDATION
  // ─────────────────────────────────────────────
  if (
    !items ||
    !Array.isArray(items) ||
    items.length === 0
  ) {

    throw new ApiError(
      400,
      "Items are required"
    );
  }

  // ─────────────────────────────────────────────
  // FIND OR CREATE CART
  // ─────────────────────────────────────────────
  let cart =
    await Cart.findOneAndUpdate(

      { user: userId },

      {
        $setOnInsert: {
          user: userId,
          items: []
        }
      },

      {
        new: true,
        upsert: true
      }
    );

  // ─────────────────────────────────────────────
  // LOOP ITEMS
  // ─────────────────────────────────────────────
  for (const item of items) {

    const {

      type,

      productId,

      comboId,

      quantity = 1,

      size,

      selections = []

    } = item;

    // =====================================================
    // PRODUCT
    // =====================================================
    if (type === "product") {

      // VALID PRODUCT ID
      if (
        !mongoose.Types.ObjectId.isValid(
          productId
        )
      ) {

        throw new ApiError(
          400,
          "Invalid product ID"
        );
      }

      // FIND PRODUCT
      const product =
        await Product.findById(productId);

      if (
        !product ||
        !product.isAvailable
      ) {

        throw new ApiError(
          404,
          "Product not available"
        );
      }

      // SIZE REQUIRED
      if (!size) {

        throw new ApiError(
          400,
          `Size is required for ${product.name}`
        );
      }

      // =====================================================
      // NORMALIZE SIZE
      // =====================================================
      const normalizedSize =

        size
          ?.toString()
          .trim()
          .toLowerCase()
          .replace(/\s+/g, "");

      // =====================================================
      // FIND VARIANT
      // =====================================================
      const matchedVariant =
        product.variants.find(v => {

          const dbSize =

            v.size
              ?.toString()
              .trim()
              .toLowerCase()
              .replace(/\s+/g, "");

          return dbSize === normalizedSize;

        });

      // INVALID SIZE
      if (!matchedVariant) {

        throw new ApiError(

          400,

          `Invalid size selected for ${product.name}. Available sizes: ${
            product.variants
              ?.map(v => v.size)
              .join(", ")
          }`
        );
      }

      // =====================================================
      // FINAL VALUES
      // =====================================================
      const finalSize =
        matchedVariant.size;

      const finalPrice =
        matchedVariant.price;

      const subtotal =
        finalPrice * quantity;

      // =====================================================
      // FIND EXISTING ITEM
      // =====================================================
      const existingItem =
        cart.items.find(i =>

          i.type === "product" &&

          i.productId?.toString() ===
          productId &&

          i.selectedVariant?.size
            ?.toLowerCase()
            ?.trim() ===

          finalSize
            ?.toLowerCase()
            ?.trim()
        );

      // =====================================================
      // UPDATE EXISTING ITEM
      // =====================================================
      if (existingItem) {

        existingItem.quantity +=
          quantity;

        existingItem.subtotal =

          existingItem.quantity *

          existingItem.selectedVariant.price;
      }

      // =====================================================
      // ADD NEW ITEM
      // =====================================================
      else {

        cart.items.push({

          itemId:
            new mongoose.Types.ObjectId(),

          type:
            "product",

          productId,

          name:
            product.name,

          quantity,

          selectedVariant: {

            size:
              finalSize,

            price:
              finalPrice
          },

          subtotal
        });
      }
    }

    // =====================================================
    // COMBO
    // =====================================================
    else if (type === "combo") {

      // VALID COMBO ID
      if (
        !mongoose.Types.ObjectId.isValid(
          comboId
        )
      ) {

        throw new ApiError(
          400,
          "Invalid combo ID"
        );
      }

      // FIND COMBO
      const combo =
        await Combo.findById(comboId);

      if (
        !combo ||
        !combo.isActive
      ) {

        throw new ApiError(
          404,
          "Combo not available"
        );
      }

      const subtotal =
        combo.price * quantity;

      // =====================================================
      // PUSH COMBO
      // =====================================================
      cart.items.push({

        itemId:
          new mongoose.Types.ObjectId(),

        type:
          "combo",

        comboId,

        name:
          combo.name,

        quantity,

        selectedVariant: {

          size:
            combo.size || "",

          price:
            combo.price
        },

        subtotal,

        selections
      });
    }

    // =====================================================
    // INVALID TYPE
    // =====================================================
    else {

      throw new ApiError(
        400,
        "Invalid item type"
      );
    }
  }

  // ─────────────────────────────────────────────
  // SAVE CART
  // ─────────────────────────────────────────────
  await cart.save();

  // ─────────────────────────────────────────────
  // POPULATE
  // ─────────────────────────────────────────────
  await cart.populate([

    {
      path: "items.productId",

      select:
        "name category"
    },

    {
      path: "items.comboId",

      select:
        "name"
    }
  ]);

  // ─────────────────────────────────────────────
  // FORMAT RESPONSE
  // ─────────────────────────────────────────────
  let totalAmount = 0;

  const formattedItems = [];

  for (const item of cart.items) {

    totalAmount +=
      item.subtotal || 0;

    // =====================================================
    // PRODUCT RESPONSE
    // =====================================================
    if (item.type === "product") {

      formattedItems.push({

        itemId:
          item.itemId,

        type:
          item.type,

        productId:
          item.productId?._id,

        name:
          item.name,

        // ❌ IMAGE REMOVED

        category:
          item.productId?.category || "",

        quantity:
          item.quantity,

        variant: {

          size:
            item.selectedVariant?.size || "",

          price:
            item.selectedVariant?.price || 0
        },

        subtotal:
          item.subtotal || 0
      });
    }

    // =====================================================
    // COMBO RESPONSE
    // =====================================================
    else if (item.type === "combo") {

      // ===============================================
      // BUILD SELECTIONS
      // ===============================================
      const formattedSelections = [];

      for (const sel of item.selections || []) {

        // ===========================================
        // PRODUCT IDS
        // ===========================================
        const productIds =

          sel.products.map(
            p => p.productId
          );

        // ===========================================
        // FETCH PRODUCTS
        // ===========================================
        const products =
          await Product.find({

            _id: {
              $in: productIds
            }

          }).select(

            "name category"
          );

        // ===========================================
        // PRODUCT MAP
        // ===========================================
        const productMap = {};

        products.forEach(p => {

          productMap[
            p._id.toString()
          ] = p;
        });

        // ===========================================
        // FORMAT PRODUCTS
        // ===========================================
        const formattedProducts =

          sel.products.map(p => {

            const prod =

              productMap[
                p.productId.toString()
              ];

            return {

              productId:
                p.productId,

              name:
                prod?.name || "",

              category:
                prod?.category || "",

              quantity:
                p.quantity
            };
          });

        formattedSelections.push({

          ruleId:
            sel.ruleId,

          products:
            formattedProducts
        });
      }

      // ===============================================
      // PUSH COMBO
      // ===============================================
      formattedItems.push({

        itemId:
          item.itemId,

        type:
          item.type,

        comboId:
          item.comboId?._id,

        name:
          item.name,

        // ❌ IMAGE REMOVED

        quantity:
          item.quantity,

        variant: {

          size:
            item.selectedVariant?.size || "",

          price:
            item.selectedVariant?.price || 0
        },

        subtotal:
          item.subtotal || 0,

        // ✅ FORMATTED SELECTIONS
        selections:
          formattedSelections
      });
    }
  }

  // ─────────────────────────────────────────────
  // RESPONSE
  // ─────────────────────────────────────────────
  return res.status(200).json(

    new ApiResponse(

      200,

      {

        cartId:
          cart._id,

        totalItems:
          formattedItems.length,

        totalAmount,

        items:
          formattedItems,

        createdAt:
          cart.createdAt,

        updatedAt:
          cart.updatedAt
      },

      "Items added to cart successfully"
    )
  );
});




// const viewCart = asynchandler(async (req, res) => {
//   const userId = req.user?._id;

//   if (!userId) {
//     throw new ApiError(401, "Unauthorized");
//   }

//   const cart = await Cart.findOne({ user: userId })
//     .populate("items.productId", "name category variants isAvailable")
//     .populate("items.comboId", "name price size isActive rules")
//     .lean();

//   // =========================
//   // 🛒 EMPTY CART
//   // =========================
//   if (!cart || !cart.items || cart.items.length === 0) {
//     return res.status(200).json(
//       new ApiResponse(
//         200,
//         { items: [], totalAmount: 0, summary: {} },
//         "Cart is empty"
//       )
//     );
//   }

//   let totalAmount = 0;
//   const formattedItems = [];

//   // 🔥 AGGREGATE SUMMARY
//   const summary = {
//     roti: 0,
//     dal: 0,
//     veg: 0,
//     paneer: 0,
//     chicken: 0
//   };

//   // =========================
//   // 🔁 LOOP ITEMS
//   // =========================
//   for (const item of cart.items) {

//     // =========================
//     // 🛒 PRODUCT ITEM
//     // =========================
//     if (item.type === "product") {
//       const product = item.productId;

//       if (!product || !product.isAvailable) continue;

//       const selectedVariant =
//         product.variants?.find(v => v.size === item.variant) ||
//         product.variants?.[0];

//       const price = selectedVariant?.price || 0;
//       const itemTotal = price * item.quantity;

//       totalAmount += itemTotal;

//       // 🔥 SUMMARY UPDATE
//       summary[product.category] =
//         (summary[product.category] || 0) + item.quantity;

//       formattedItems.push({
//         itemId: item._id, 
//         type: "product",
//         productId: product._id,
//         name: product.name,
//         size: selectedVariant?.size || "default",
//         price,
//         quantity: item.quantity,
//         total: itemTotal
//       });
//     }

//     // =========================
//     // 🍽️ COMBO ITEM
//     // =========================
//     else if (item.type === "combo") {
//       const combo = item.comboId;

//       if (!combo || !combo.isActive) continue;

//       const comboTotal = combo.price * item.quantity;
//       totalAmount += comboTotal;

//       // =========================
//       // 🔥 FIXED ITEMS (ROTIS)
//       // =========================
//       const fixedItems = (combo.rules || [])
//         .filter(rule => rule.isFixed)
//         .map(rule => {
//           const category = rule.category?.[0];

//           // 🔥 SUMMARY UPDATE (fixed items)
//           summary[category] =
//             (summary[category] || 0) + (rule.quantity * item.quantity);

//           return {
//             title: rule.title,
//             quantity: rule.quantity
//           };
//         });

//       // =========================
//       // 🔥 USER SELECTIONS
//       // =========================
//       const formattedSelections = [];

//       for (const sel of item.selections || []) {

//         const productIds = sel.products.map(p => p.productId);

//         const products = await Product.find({
//           _id: { $in: productIds }
//         }).select("name category");

//         const productMap = {};
//         products.forEach(p => {
//           productMap[p._id.toString()] = p;
//         });

//         const detailedProducts = sel.products.map(p => {
//           const prod = productMap[p.productId.toString()];
//           if (!prod) return null;

//           // 🔥 SUMMARY UPDATE (selected items)
//           summary[prod.category] =
//             (summary[prod.category] || 0) +
//             (p.quantity * item.quantity);

//           return {
//             productId: prod._id,
//             name: prod.name,
//             quantity: p.quantity
//           };
//         }).filter(Boolean);

//         formattedSelections.push({
//           ruleId: sel.ruleId,
//           products: detailedProducts
//         });
//       }

//       formattedItems.push({
//         itemId: item._id, 
//         type: "combo",
//         comboId: combo._id,
//         name: combo.name,
//         quantity: item.quantity,
//         basePrice: combo.price,
//         total: comboTotal,
//         fixedItems,
//         selections: formattedSelections
//       });
//     }
//   }

//   // =========================
//   // 🔥 CLEAN SUMMARY (REMOVE ZERO VALUES)
//   // =========================
//   const cleanSummary = Object.fromEntries(
//     Object.entries(summary).filter(([_, v]) => v > 0)
//   );

//   // =========================
//   // ✅ FINAL RESPONSE
//   // =========================
//   return res.status(200).json(
//     new ApiResponse(
//       200,
//       {
//         items: formattedItems,
//         totalAmount,
//         summary: cleanSummary
//       },
//       "Cart fetched successfully"
//     )
//   );
// });



const viewCart = asynchandler(async (req, res) => {

  // ─────────────────────────────────────────────
  // AUTH CHECK
  // ─────────────────────────────────────────────
  const userId = req.user?._id;

  if (!userId) {

    throw new ApiError(
      401,
      "Unauthorized"
    );
  }

  // ─────────────────────────────────────────────
  // FETCH CART
  // ─────────────────────────────────────────────
  const cart = await Cart.findOne({
    user: userId
  })

    .populate(
      "items.productId",
      "name description category  variants isAvailable"
    )

    .populate(
      "items.comboId",
      "name price size isActive rules"
    )

    .lean();

  // ─────────────────────────────────────────────
  // EMPTY CART
  // ─────────────────────────────────────────────
  if (
    !cart ||
    !cart.items ||
    cart.items.length === 0
  ) {

    return res.status(200).json(

      new ApiResponse(

        200,

        {

          items: [],

          totalAmount: 0,

          totalItems: 0
        },

        "Cart is empty"
      )
    );
  }

  // ─────────────────────────────────────────────
  // VARIABLES
  // ─────────────────────────────────────────────
  let totalAmount = 0;

  const formattedItems = [];

  // ─────────────────────────────────────────────
  // LOOP ITEMS
  // ─────────────────────────────────────────────
  for (const item of cart.items) {

    // =====================================================
    // PRODUCT
    // =====================================================
    if (item.type === "product") {

      const product =
        item.productId;

      // SKIP INVALID PRODUCT
      if (
        !product ||
        !product.isAvailable
      ) continue;

      // =====================================================
      // SUBTOTAL
      // =====================================================
      const subtotal =

        item.subtotal ||

        (
          (item.selectedVariant?.price || 0) *
          item.quantity
        );

      totalAmount += subtotal;

      // =====================================================
      // PRODUCT RESPONSE
      // =====================================================
      formattedItems.push({

        itemId:
          item.itemId,

        type:
          "product",

        productId:
          product._id,

        name:
          item.name ||
          product.name ||
          "",

        description:
          product.description || "",

        category:
          product.category || "",

        quantity:
          item.quantity,

        // ✅ STORED VARIANT
        variant: {

          size:
            item.selectedVariant?.size || "",

          price:
            item.selectedVariant?.price || 0
        },

        subtotal
      });
    }

    // =====================================================
    // COMBO
    // =====================================================
    else if (item.type === "combo") {

      const combo =
        item.comboId;

      // SKIP INVALID COMBO
      if (
        !combo ||
        !combo.isActive
      ) continue;

      // =====================================================
      // SUBTOTAL
      // =====================================================
      const subtotal =

        item.subtotal ||

        (
          (item.selectedVariant?.price || 0) *
          item.quantity
        );

      totalAmount += subtotal;

      // =====================================================
      // BUILD SELECTIONS WITH PRODUCT NAMES
      // =====================================================
      const formattedSelections = [];

      for (const sel of item.selections || []) {

        // ===============================================
        // GET PRODUCT IDS
        // ===============================================
        const productIds =

          sel.products.map(
            p => p.productId
          );

        // ===============================================
        // FETCH PRODUCTS
        // ===============================================
        const products =
          await Product.find({

            _id: {
              $in: productIds
            }

          }).select(

            "name category"
          );

        // ===============================================
        // PRODUCT MAP
        // ===============================================
        const productMap = {};

        products.forEach(p => {

          productMap[
            p._id.toString()
          ] = p;
        });

        // ===============================================
        // FORMAT PRODUCTS
        // ===============================================
        const formattedProducts =

          sel.products.map(p => {

            const prod =

              productMap[
                p.productId.toString()
              ];

            return {

              productId:
                p.productId,

              name:
                prod?.name || "",

              category:
                prod?.category || "",

              quantity:
                p.quantity
            };
          });

        formattedSelections.push({

          ruleId:
            sel.ruleId,

          products:
            formattedProducts
        });
      }

      // =====================================================
      // COMBO RESPONSE
      // =====================================================
      formattedItems.push({

        itemId:
          item.itemId,

        type:
          "combo",

        comboId:
          combo._id,

        name:
          item.name ||
          combo.name ||
          "",

        quantity:
          item.quantity,

        variant: {

          size:
            item.selectedVariant?.size ||
            combo.size ||
            "",

          price:
            item.selectedVariant?.price ||
            combo.price ||
            0
        },

        subtotal,

        // ✅ FORMATTED SELECTIONS
        selections:
          formattedSelections
      });
    }
  }

  // ─────────────────────────────────────────────
  // RESPONSE
  // ─────────────────────────────────────────────
  return res.status(200).json(

    new ApiResponse(

      200,

      {

        cartId:
          cart._id,

        totalItems:
          formattedItems.length,

        totalAmount,

        items:
          formattedItems,

        createdAt:
          cart.createdAt,

        updatedAt:
          cart.updatedAt
      },

      "Cart fetched successfully"
    )
  );
});



// const removeFromCart = asynchandler(async (req, res) => {
//   const userId = req.user?._id;

//   if (!userId) {
//     throw new ApiError(401, "Unauthorized");
//   }

//   const { itemId, removeAll = false } = req.body;

//   if (!itemId) {
//     throw new ApiError(400, "itemId is required");
//   }

//   const cart = await Cart.findOne({ user: userId });

//   if (!cart || !cart.items || cart.items.length === 0) {
//     throw new ApiError(404, "Cart is empty");
//   }

//   // =========================
//   // 🔍 FIND ITEM
//   // =========================
//   const itemIndex = cart.items.findIndex(
//     item => item._id.toString() === itemId
//   );

//   if (itemIndex === -1) {
//     throw new ApiError(404, "Item not found in cart");
//   }

//   const item = cart.items[itemIndex];

//   // =========================
//   // ❌ REMOVE LOGIC
//   // =========================

//   if (removeAll || item.quantity === 1) {
//     // 👉 Remove entire item
//     cart.items.splice(itemIndex, 1);
//   } else {
//     // 👉 Decrease quantity
//     cart.items[itemIndex].quantity -= 1;
//   }

//   await cart.save();

//   return res.status(200).json(
//     new ApiResponse(200, cart, "Item removed from cart")
//   );
// });



const removeFromCart = asynchandler(async (req, res) => {

  // ─────────────────────────────────────────────
  // AUTH CHECK
  // ─────────────────────────────────────────────
  const userId =
    req.user?._id;

  if (!userId) {

    throw new ApiError(
      401,
      "Unauthorized"
    );
  }

  // ─────────────────────────────────────────────
  // BODY
  // ─────────────────────────────────────────────
  const {

    itemId,

    removeAll = false

  } = req.body;

  // ─────────────────────────────────────────────
  // VALIDATION
  // ─────────────────────────────────────────────
  if (!itemId) {

    throw new ApiError(
      400,
      "itemId is required"
    );
  }

  // ─────────────────────────────────────────────
  // FIND CART
  // ─────────────────────────────────────────────
  const cart =
    await Cart.findOne({

      user: userId
    })

    .populate(
      "items.productId",
      "name image category"
    )

    .populate(
      "items.comboId",
      "name image"
    );

  // ─────────────────────────────────────────────
  // EMPTY CART
  // ─────────────────────────────────────────────
  if (
    !cart ||
    !cart.items ||
    cart.items.length === 0
  ) {

    throw new ApiError(
      404,
      "Cart is empty"
    );
  }

  // ─────────────────────────────────────────────
  // FIND ITEM
  // ─────────────────────────────────────────────
  const itemIndex =

    cart.items.findIndex(

      item =>

        item.itemId
          ?.toString() ===
        itemId
    );

  // ITEM NOT FOUND
  if (itemIndex === -1) {

    throw new ApiError(
      404,
      "Item not found in cart"
    );
  }

  // ─────────────────────────────────────────────
  // TARGET ITEM
  // ─────────────────────────────────────────────
  const item =
    cart.items[itemIndex];

  // ─────────────────────────────────────────────
  // REMOVE LOGIC
  // ─────────────────────────────────────────────

  // =====================================================
  // REMOVE COMPLETE ITEM
  // =====================================================
  if (
    removeAll ||

    item.quantity <= 1
  ) {

    cart.items.splice(
      itemIndex,
      1
    );
  }

  // =====================================================
  // DECREASE QUANTITY
  // =====================================================
  else {

    item.quantity -= 1;

    // ✅ UPDATE SUBTOTAL
    item.subtotal =

      (
        item.selectedVariant?.price || 0
      ) *

      item.quantity;
  }

  // ─────────────────────────────────────────────
  // SAVE CART
  // ─────────────────────────────────────────────
  await cart.save();

  // ─────────────────────────────────────────────
  // CALCULATE TOTALS
  // ─────────────────────────────────────────────
  let totalAmount = 0;

  const formattedItems = [];

  // ─────────────────────────────────────────────
  // FORMAT ITEMS
  // ─────────────────────────────────────────────
  for (const cartItem of cart.items) {

    const subtotal =

      cartItem.subtotal ||

      (
        (
          cartItem.selectedVariant?.price || 0
        ) *

        cartItem.quantity
      );

    totalAmount += subtotal;

    // =====================================================
    // PRODUCT
    // =====================================================
    if (
      cartItem.type === "product"
    ) {

      formattedItems.push({

        itemId:
          cartItem.itemId,

        type:
          cartItem.type,

        productId:
          cartItem.productId?._id,

        name:
          cartItem.name ||

          cartItem.productId?.name ||

          "",

        image:
          cartItem.productId?.image || "",

        category:
          cartItem.productId?.category || "",

        quantity:
          cartItem.quantity,

        variant: {

          size:
            cartItem.selectedVariant?.size || "",

          price:
            cartItem.selectedVariant?.price || 0
        },

        subtotal
      });
    }

    // =====================================================
    // COMBO
    // =====================================================
    else if (
      cartItem.type === "combo"
    ) {

      formattedItems.push({

        itemId:
          cartItem.itemId,

        type:
          cartItem.type,

        comboId:
          cartItem.comboId?._id,

        name:
          cartItem.name ||

          cartItem.comboId?.name ||

          "",

        image:
          cartItem.comboId?.image || "",

        quantity:
          cartItem.quantity,

        variant: {

          size:
            cartItem.selectedVariant?.size || "",

          price:
            cartItem.selectedVariant?.price || 0
        },

        subtotal,

        selections:
          cartItem.selections || []
      });
    }
  }

  // ─────────────────────────────────────────────
  // RESPONSE
  // ─────────────────────────────────────────────
  return res.status(200).json(

    new ApiResponse(

      200,

      {

        cartId:
          cart._id,

        totalItems:
          formattedItems.length,

        totalAmount,

        items:
          formattedItems,

        createdAt:
          cart.createdAt,

        updatedAt:
          cart.updatedAt
      },

      "Item removed from cart successfully"
    )
  );
});






const deleteCartItem = asynchandler(async (req, res) => {
  const userId = req.user?._id;

  if (!userId) {
    throw new ApiError(401, "Unauthorized");
  }

  const { itemId } = req.body;

  if (!itemId) {
    throw new ApiError(400, "itemId is required");
  }

  // =========================
  // 🔥 ATOMIC REMOVE
  // =========================
  const updatedCart = await Cart.findOneAndUpdate(
    { user: userId },
    {
      $pull: {
        items: {
          itemId: new mongoose.Types.ObjectId(itemId)
        }
      }
    },
    { new: true }
  );

  if (!updatedCart) {
    throw new ApiError(404, "Cart not found");
  }

  return res.status(200).json(
    new ApiResponse(200, updatedCart, "Item removed completely")
  );
});



const clearCart = asynchandler(async (req, res) => {
  const userId = req.user?._id;

  if (!userId) {
    throw new ApiError(401, "Unauthorized");
  }

  // =========================
  // 🔥 CLEAR ALL ITEMS
  // =========================
  const updatedCart = await Cart.findOneAndUpdate(
    { user: userId },
    { $set: { items: [] } },
    { new: true }
  );

  if (!updatedCart) {
    throw new ApiError(404, "Cart not found");
  }

  return res.status(200).json(
    new ApiResponse(200, updatedCart, "Cart cleared successfully")
  );
});


const getNextDeliveryDate = asynchandler(async (req, res) => {

    // ==========================
    // 🔥 CONFIG
    // ==========================
    const deliveryDays = [1,4]; // Monday & Thursday
    const cutoffHour = 22; // 10 PM

    // ==========================
    // 🕒 CURRENT LA TIME
    // ==========================
    const now = new Date();

    const laDate = new Date(
        now.toLocaleString("en-US", {
            timeZone: "America/Los_Angeles"
        })
    );

    const today = laDate.getDay();
    const currentHour = laDate.getHours();

    // ==========================
    // 🔍 FIND NEXT DELIVERY DAY
    // ==========================
    let daysToAdd = null;
    let nextDeliveryDay = null;

    for (let i = 1; i <= 7; i++) {

        const nextDay = (today + i) % 7;

        if (deliveryDays.includes(nextDay)) {
            daysToAdd = i;
            nextDeliveryDay = nextDay;
            break;
        }
    }

    if (daysToAdd === null) {
        throw new ApiError(
            500,
            "No delivery days configured"
        );
    }

    // ==========================
    // 🔥 CUTOFF LOGIC
    // ==========================
    let isAcceptingOrders = true;

    // If today is delivery day
    if (deliveryDays.includes(today)) {
        isAcceptingOrders = false;
    }

    // Day before delivery
    const previousDay =
        (nextDeliveryDay + 6) % 7;

    // After cutoff on previous day
    if (
        today === previousDay &&
        currentHour >= cutoffHour
    ) {
        isAcceptingOrders = false;
    }

    // ==========================
    // ❌ NOT ACCEPTING
    // ==========================
    if (!isAcceptingOrders) {

        return res.status(200).json(
            new ApiResponse(
                200,
                {
                    acceptingOrders: false
                },
                "Currently not accepting orders"
            )
        );
    }

    // ==========================
    // 📅 NEXT DELIVERY DATE
    // ==========================
    const nextDeliveryDate = new Date(laDate);

    nextDeliveryDate.setDate(
        nextDeliveryDate.getDate() + daysToAdd
    );

    // ==========================
    // ✅ FORMAT RESPONSE
    // ==========================
    const formattedDate =
        nextDeliveryDate.toLocaleDateString(
            "en-US",
            {
                weekday: "long",
                year: "numeric",
                month: "long",
                day: "numeric"
            }
        );

    const day =
        nextDeliveryDate.toLocaleDateString(
            "en-US",
            {
                weekday: "long"
            }
        );

    // ==========================
    // ✅ RESPONSE
    // ==========================
    return res.status(200).json(
        new ApiResponse(
            200,
            {
                acceptingOrders: true,
                date: nextDeliveryDate,
                formatted: formattedDate,
                day
            },
            "Next delivery date fetched successfully"
        )
    );
});



const ProceedToOrder = asynchandler(async (req, res) => {

  // ─────────────────────────────────────────────
  // AUTH CHECK
  // ─────────────────────────────────────────────
  const userId = req.user?._id;

  if (!userId) {

    throw new ApiError(
      401,
      "Unauthorized"
    );
  }

  const { addressId, payment } = req.body;

  // ─────────────────────────────────────────────
  // VALIDATE ADDRESS
  // ─────────────────────────────────────────────
  if (!addressId) {

    throw new ApiError(
      400,
      "Please select a delivery address"
    );
  }

  const address = await Address.findOne({

    _id: addressId,

    user: userId

  });

  if (!address) {

    throw new ApiError(

      404,

      "Address not found or does not belong to you"
    );
  }

  // ─────────────────────────────────────────────
  // FETCH USER
  // ─────────────────────────────────────────────
  const User = await user.findById(userId)

    .select(
      "name email phone_number full_name username"
    );

  // ─────────────────────────────────────────────
  // FETCH CART
  // ─────────────────────────────────────────────
  const cart = await Cart.findOne({

    user: userId

  })

    .populate(
      "items.productId",
      "name category variants isAvailable"
    )

    .populate(
      "items.comboId",
      "name price size isActive rules"
    )

    .lean();

  // EMPTY CART
  if (
    !cart ||
    !cart.items ||
    cart.items.length === 0
  ) {

    throw new ApiError(
      400,
      "Cart is empty"
    );
  }

  // ─────────────────────────────────────────────
  // BUILD ORDER ITEMS
  // ─────────────────────────────────────────────
  let totalAmount = 0;

  const orderItems = [];

  // ─────────────────────────────────────────────
  // LOOP CART ITEMS
  // ─────────────────────────────────────────────
  for (const item of cart.items) {

    // =====================================================
    // PRODUCT
    // =====================================================
    if (item.type === "product") {

      const product =
        item.productId;

      // SKIP INVALID PRODUCT
      if (
        !product ||
        !product.isAvailable
      ) continue;

      const price =

        item.selectedVariant?.price || 0;

      const size =

        item.selectedVariant?.size || "";

      const subtotal =

        item.subtotal ||

        (
          price *
          item.quantity
        );

      totalAmount += subtotal;

      // =====================================================
      // PUSH PRODUCT
      // =====================================================
      orderItems.push({

        productId:
          product._id,

        name:
          item.name ||
          product.name,

        quantity:
          item.quantity,

        selectedVariant: {

          size,

          price
        },

        subtotal,

        type:
          "product"
      });
    }

    // =====================================================
    // COMBO
    // =====================================================
    else if (item.type === "combo") {

      const combo =
        item.comboId;

      // SKIP INVALID COMBO
      if (
        !combo ||
        !combo.isActive
      ) continue;

      const price =

        item.selectedVariant?.price ||

        combo.price ||

        0;

      const size =

        item.selectedVariant?.size ||

        combo.size ||

        "";

      const subtotal =

        item.subtotal ||

        (
          price *
          item.quantity
        );

      totalAmount += subtotal;

      // =====================================================
      // BUILD SELECTIONS WITH PRODUCT DETAILS
      // =====================================================
      const formattedSelections = [];

      for (const sel of item.selections || []) {

        const productIds =

          sel.products.map(
            p => p.productId
          );

        const products =
          await Product.find({

            _id: {
              $in: productIds
            }

          }).select(

            "name category variants"
          );

        const productMap = {};

        products.forEach(p => {

          productMap[
            p._id.toString()
          ] = p;
        });

        const formattedProducts =

          sel.products.map(p => {

            const prod =

              productMap[
                p.productId.toString()
              ];

            return {

              productId:
                p.productId,

              name:
                prod?.name || "",

              category:
                prod?.category || "",

              quantity:
                p.quantity
            };
          });

        formattedSelections.push({

          ruleId:
            sel.ruleId,

          products:
            formattedProducts
        });
      }

      // =====================================================
      // PUSH COMBO
      // =====================================================
      orderItems.push({

        comboId:
          combo._id,

        name:
          item.name ||
          combo.name,

        quantity:
          item.quantity,

        selectedVariant: {

          size,

          price
        },

        subtotal,

        type:
          "combo",

        selections:
          formattedSelections
      });
    }
  }

  // ─────────────────────────────────────────────
  // NO VALID ITEMS
  // ─────────────────────────────────────────────
  if (orderItems.length === 0) {

    throw new ApiError(

      400,

      "No valid items found in cart"
    );
  }

  // ─────────────────────────────────────────────
  // DELIVERY DETAILS
  // ─────────────────────────────────────────────
  const deliveryDetails = {

    addressId:
      address._id,

    addressLine1:
      address.addressLine1,

    addressLine2:
      address.addressLine2 || "",

    city:
      address.city,

    state:
      address.state,

    zipCode:
      address.zipCode,

    country:
      address.country,

    area:
      address.area || "bay_area",

    location:
      address.location || {},

    phone:
      User?.phone_number || ""
  };

  // ─────────────────────────────────────────────
  // CREATE ORDER
  // ─────────────────────────────────────────────
  const order = await Order.create({

    userId,

    items:
      orderItems,

    totalAmount,

    status:
      "pending",

    deliveryDetails,

    payment: {

      method:
        payment?.method ||
        "Pay Later",

      status:
        "pending"
    }
  });

  // ─────────────────────────────────────────────
  // PAYMENT DETAILS
  // ─────────────────────────────────────────────
  let paymentDetails = {};

  let area = "bay_area";

  const city =
    address.city?.trim()?.toLowerCase();

  if (
    [
      "seattle",
      "bellevue",
      "redmond",
      "kirkland",
      "bothell",
      "lynnwood",
      "everett",
      "mill creek",
      "woodinville",
      "sammamish",
      "issaquah",
      "newcastle",
      "renton",
      "kent",
      "kenmore",
      "Lake Forest Park"
    ].includes(city)
  ) {

    area = "seattle";
  }

  if (
    area === "bay_area"
  ) {

    paymentDetails = {

      venmoId:
        "https://venmo.com/u/Delhi-Chaska",

      Zelle_name:
        "Neelam Gogna",

      zell_number:
        "3176032757",
    };
  }

  else {

    paymentDetails = {

      venmoId:
        "https://venmo.com/u/Delhi-Chaska",

      Zelle_name:
        "Parminder singh",

      zell_number:
        "+1 (206) 913-9361",

      // ✅ Seattle QR
      zelleQrImage:
        "https://res.cloudinary.com/ddvloqbxp/image/upload/v1779797522/Screenshot_2026-05-26_at_5.41.44_PM_is6awu.png"
    };
  }

  // ─────────────────────────────────────────────
  // ORDER HTML
  // ─────────────────────────────────────────────
  const orderItemsHtml = orderItems.map(item => {

    return `

      <tr>

        <td>${item.name}</td>

        <td>${item.selectedVariant?.size || "-"}</td>

        <td>${item.quantity}</td>

        <td>$${item.selectedVariant?.price || 0}</td>

        <td>$${item.subtotal || 0}</td>

      </tr>
    `;
  }).join("");

  // ─────────────────────────────────────────────
  // ADMIN EMAIL
  // ─────────────────────────────────────────────
  const adminHtml = `

    <h2>New Order Received</h2>

    <p>
      <strong>Order ID:</strong>
      ${order._id}
    </p>

    <h3>User Details</h3>

    <p>
      Name:
      ${User?.full_name || ""}

      <br/>

      Username:
      ${User?.username || ""}

      <br/>

      Email:
      ${User?.email || ""}

      <br/>

      Phone:
      ${User?.phone_number || ""}
    </p>

    <h3>Delivery Address</h3>

    <p>
      ${deliveryDetails.addressLine1}

      ${deliveryDetails.addressLine2}

      <br/>

      ${deliveryDetails.city},

      ${deliveryDetails.state}

      ${area}

      <br/>

      ${deliveryDetails.zipCode},

      ${deliveryDetails.country}
    </p>

    <h3>Items</h3>

    <table border="1" cellpadding="10">

      <thead>

        <tr>

          <th>Item</th>

          <th>Size</th>

          <th>Qty</th>

          <th>Price</th>

          <th>Subtotal</th>

        </tr>

      </thead>

      <tbody>

        ${orderItemsHtml}

      </tbody>

    </table>

    <h3>Total: $${totalAmount}</h3>
  `;

  // ─────────────────────────────────────────────
  // USER EMAIL
  // ─────────────────────────────────────────────
const userHtml = `

  <h2 style="color:#111827; font-size:28px;">
    🎉 Thank You For Your Order
  </h2>

  <p style="font-size:16px; color:#374151;">
    Hello <strong>${User?.name || "Customer"}</strong> 👋
  </p>

  <p style="font-size:15px; color:#4B5563;">
    Your order has been placed successfully and is currently being processed.
  </p>

  <div 
    style="
      background:#F9FAFB;
      padding:15px;
      border-radius:10px;
      margin:20px 0;
      border:1px solid #E5E7EB;
    "
  >

    <p>
      <strong>Username:</strong>
      ${User?.username || "N/A"}
    </p>

    <p>
      <strong>Order ID:</strong>
      ${order._id}
    </p>

    <p>
      <strong>Total Amount:</strong>
      <span style="color:#059669; font-size:18px; font-weight:bold;">
        $${totalAmount}
      </span>
    </p>

  </div>

  <div
    style="
      background:#FEF3C7;
      border:1px solid #F59E0B;
      padding:18px;
      border-radius:12px;
      margin:25px 0;
    "
  >

    <h3 style="margin-top:0; color:#92400E;">
      ⚠️ Important Payment Notice
    </h3>

    <p style="color:#78350F; line-height:1.7; margin-bottom:12px;">

      Your order will be confirmed only after the payment is completed.

    </p>

    <p style="color:#78350F; line-height:1.7; margin-bottom:0;">

      After completing the payment, please send the payment screenshot to 
      <strong>WhatsApp: +1 (661) 863-8001</strong>

      <br/><br/>

      Kindly include your:
      <br/>
      • Username
      <br/>
      • Full Name

    </p>

  </div>

  <h3 style="color:#111827;">
    🛒 Order Summary
  </h3>

  <table 
    border="1" 
    cellpadding="12"
    cellspacing="0"
    width="100%"
    style="
      border-collapse:collapse;
      border:1px solid #E5E7EB;
      overflow:hidden;
    "
  >

    <thead>

      <tr style="background:#111827; color:white;">

        <th>Item</th>

        <th>Size</th>

        <th>Qty</th>

        <th>Price</th>

        <th>Subtotal</th>

      </tr>

    </thead>

    <tbody>

      ${orderItemsHtml}

    </tbody>

  </table>

  <div 
    style="
      background:#F3F4F6;
      padding:20px;
      border-radius:12px;
      margin-top:30px;
    "
  >

    <h3 style="margin-top:0; color:#111827;">
      💳 Payment Instructions
    </h3>

    <p>
      <strong>Venmo:</strong>
      ${paymentDetails.venmoId}
    </p>

    <p>

      <strong>Zelle Name:</strong>
      ${paymentDetails.Zelle_name}

      <br/><br/>

      <strong>Zelle Number:</strong>
      ${paymentDetails.zell_number}

    </p>

    ${
      paymentDetails?.zelleQrImage
        ? `
          <div style="margin-top:20px;">

            <p>
              <strong>Zelle QR Code:</strong>
            </p>

            <img
              src="${paymentDetails.zelleQrImage}"
              alt="Zelle QR"
              style="
                width:220px;
                height:auto;
                border-radius:12px;
                border:1px solid #E5E7EB;
              "
            />

          </div>
        `
        : ""
    }

    <p style="color:#4B5563; line-height:1.6;">

      Please complete the payment at your earliest convenience.

      <br/><br/>

      Your order confirmation email will be sent once the admin confirms your payment and order.

    </p>

  </div>

  <p 
    style="
      margin-top:30px;
      text-align:center;
      color:#6B7280;
      font-size:14px;
    "
  >
    ❤️ Thank you.
  </p>

`;
  // ─────────────────────────────────────────────
  // SEND EMAILS
  // ─────────────────────────────────────────────
  await sendEmail({

    to:
      adminEmails,

    subject:
      `New Order Received - ${order._id}`,

    html:
      adminHtml
  });

  if (User?.email) {

    await sendEmail({

      to:
        User.email,

      subject:
        `Your Order is Placed - ${order._id}`,

      html:
        userHtml
    });
  }

  // ─────────────────────────────────────────────
  // CLEAR CART
  // ─────────────────────────────────────────────
  await Cart.findOneAndUpdate(

    { user: userId },

    {
      $set: {
        items: []
      }
    }
  );

  // ─────────────────────────────────────────────
  // RESPONSE
  // ─────────────────────────────────────────────
  return res.status(201).json(

    new ApiResponse(

      201,

      {

        order,

        paymentDetails
      },

      "Order placed successfully"
    )
  );
});


const viewMyOrders = asynchandler(async (req, res) => {

  // ─────────────────────────────────────────────
  // AUTH CHECK
  // ─────────────────────────────────────────────
  const userId = req.user?._id;

  if (!userId) {

    throw new ApiError(
      401,
      "Unauthorized"
    );
  }

  // ─────────────────────────────────────────────
  // QUERY PARAMS
  // ─────────────────────────────────────────────
  const {

    status,

    paymentStatus,

    paymentMethod,

    isorderdelivered

  } = req.query;

  // ─────────────────────────────────────────────
  // BUILD FILTER
  // ─────────────────────────────────────────────
  const filter = {

    userId
  };

  // STATUS
  if (status) {

    filter.status = status;
  }

  // PAYMENT STATUS
  if (paymentStatus) {

    filter["payment.status"] =
      paymentStatus;
  }

  // PAYMENT METHOD
  if (paymentMethod) {

    filter["payment.method"] =
      paymentMethod;
  }

  // DELIVERED FILTER
  if (
    isorderdelivered === "true"
  ) {

    filter.isorderdelivered =
      true;
  }

  else if (
    isorderdelivered === "false"
  ) {

    filter.isorderdelivered =
      false;
  }

  // ─────────────────────────────────────────────
  // LIMIT
  // ─────────────────────────────────────────────
  const LIMIT = 16;

  // ─────────────────────────────────────────────
  // FETCH ORDERS
  // ─────────────────────────────────────────────
  const orders = await Order.find(
    filter
  )

    // ✅ POPULATE USER
    .populate(
      "userId",
      "username full_name email"
    )

    .sort({
      createdAt: -1
    })

    .limit(LIMIT)

    .lean();

  // ─────────────────────────────────────────────
  // TOTAL COUNT
  // ─────────────────────────────────────────────
  const totalOrders =
    await Order.countDocuments(
      filter
    );

  // ─────────────────────────────────────────────
  // EMPTY RESPONSE
  // ─────────────────────────────────────────────
  if (
    !orders ||
    orders.length === 0
  ) {

    return res.status(200).json(

      new ApiResponse(

        200,

        {

          orders: [],

          totalOrders: 0
        },

        "No orders found"
      )
    );
  }

  // ─────────────────────────────────────────────
  // FORMAT ORDERS
  // ─────────────────────────────────────────────
  const formattedOrders =

    orders.map(order => {

      // =====================================================
      // FORMAT ITEMS
      // =====================================================
      const formattedItems =

        order.items.map(item => {

          const price =

            item.selectedVariant?.price || 0;

          const size =

            item.selectedVariant?.size || "";

          const subtotal =

            item.subtotal ||

            (
              price *
              item.quantity
            );

          // =================================================
          // PRODUCT
          // =================================================
          if (item.type === "product") {

            return {

              productId:
                item.productId || null,

              name:
                item.name || "",

              quantity:
                item.quantity || 0,

              type:
                item.type || "",

              variant: {

                size,

                price
              },

              subtotal
            };
          }

          // =================================================
          // COMBO
          // =================================================
          else if (item.type === "combo") {

            return {

              comboId:
                item.comboId || null,

              name:
                item.name || "",

              quantity:
                item.quantity || 0,

              type:
                item.type || "",

              variant: {

                size,

                price
              },

              subtotal,

              // ✅ COMBO SELECTIONS
              selections:

                item.selections?.map(sel => ({

                  ruleId:
                    sel.ruleId,

                  products:

                    sel.products?.map(prod => ({

                      productId:
                        prod.productId || null,

                      name:
                        prod.name || "",

                      category:
                        prod.category || "",

                      quantity:
                        prod.quantity || 0
                    }))
                })) || []
            };
          }

          // =================================================
          // FALLBACK
          // =================================================
          return {

            name:
              item.name || "",

            quantity:
              item.quantity || 0,

            type:
              item.type || "",

            subtotal
          };
        });

      // =====================================================
      // RETURN ORDER
      // =====================================================
      return {

        orderId:
          order._id,

        // ✅ USER DETAILS
        user: {

          userId:
            order.userId?._id || null,

          username:
            order.userId?.username || "",

          full_name:
            order.userId?.full_name || "",

          email:
            order.userId?.email || ""
        },

        status:
          order.status,

        totalAmount:
          order.totalAmount || 0,

        payment: {

          method:
            order.payment?.method || "",

          status:
            order.payment?.status || ""
        },

        deliveryDetails:
          order.deliveryDetails || {},

        deliveryDate:
          order.deliveryDate || null,

        deliveredAt:
          order.deliveredAt || null,

        isorderdelivered:
          order.isorderdelivered || false,

        paymentRequested:
          order.paymentRequested || false,

        itemCount:
          formattedItems.length,

        items:
          formattedItems,

        placedAt:
          order.createdAt
      };
    });

  // ─────────────────────────────────────────────
  // RESPONSE
  // ─────────────────────────────────────────────
  return res.status(200).json(

    new ApiResponse(

      200,

      {

        filters: {

          status:
            status || null,

          paymentStatus:
            paymentStatus || null,

          paymentMethod:
            paymentMethod || null,

          isorderdelivered:
            isorderdelivered || null
        },

        totalOrders,

        orders:
          formattedOrders
      },

      "Last 16 orders fetched successfully"
    )
  );
});





const deleteAllOrdersOfUser = asynchandler(async (req, res) => {

  // ─────────────────────────────────────────────
  // SUPER ADMIN CHECK
  // ─────────────────────────────────────────────
  ensureSuperAdmin(req);

  // ─────────────────────────────────────────────
  // GET USER ID
  // ─────────────────────────────────────────────
  const { userId } = req.params;

  // ─────────────────────────────────────────────
  // VALIDATE USER ID
  // ─────────────────────────────────────────────
  if (
    !mongoose.Types.ObjectId.isValid(
      userId
    )
  ) {

    throw new ApiError(
      400,
      "Invalid user ID"
    );
  }

  // ─────────────────────────────────────────────
  // DELETE USER ORDERS
  // ─────────────────────────────────────────────
  const result =
    await Order.deleteMany({
      userId
    });

  // ─────────────────────────────────────────────
  // RESPONSE
  // ─────────────────────────────────────────────
  return res.status(200).json(

    new ApiResponse(

      200,

      {

        userId,

        deletedOrders:
          result.deletedCount

      },

      "All orders of user deleted successfully"

    )

  );

});




const notifyPaymentDone = asynchandler(async (req, res) => {

    const userId = req.user?._id;

    if (!userId) {
        throw new ApiError(401, "Unauthorized");
    }

    const { orderId } = req.params;

    if (!orderId) {
        throw new ApiError(400, "Order ID is required");
    }

    // ─────────────────────────────────────────────
    // FIND ORDER + USER DETAILS
    // ─────────────────────────────────────────────
    const order = await Order.findOne({
        _id: orderId,
        userId
    }).populate("userId", "name username city");

    if (!order) {
        throw new ApiError(404, "Order not found");
    }

    // ─────────────────────────────────────────────
    // CHECK PAYMENT METHOD
    // ─────────────────────────────────────────────
    if (order.payment?.method !== "Pay Later") {
        throw new ApiError(
            400,
            "This action is only allowed for Pay Later orders"
        );
    }

    // ─────────────────────────────────────────────
    // ALREADY PAID
    // ─────────────────────────────────────────────
    if (order.payment?.status === "paid") {
        throw new ApiError(
            400,
            "Payment already approved"
        );
    }

    // ─────────────────────────────────────────────
    // ALREADY REQUESTED
    // ─────────────────────────────────────────────
    if (order.paymentRequested === true) {
        throw new ApiError(
            400,
            "Payment request already sent"
        );
    }

    // ─────────────────────────────────────────────
    // UPDATE ORDER
    // ─────────────────────────────────────────────
    order.paymentRequested = true;

    console.log(
        order.paymentRequested,
        "this is payment requested"
    );

    await order.save();

    // ─────────────────────────────────────────────
    // USER DETAILS
    // ─────────────────────────────────────────────
    const user = order.userId;

    // ─────────────────────────────────────────────
    // SEND EMAIL TO ADMIN
    // ─────────────────────────────────────────────
    await sendEmail({
        to: adminEmails,

        subject: "Payment Approval Request",

        html: `
            <h2>Payment Submitted By User</h2>

            <p>
                User has marked payment as completed
                and is waiting for admin approval.
            </p>

            <hr />

            <p>
                <strong>Order ID:</strong>
                ${order._id}
            </p>

            <p>
                <strong>Total Amount:</strong>
                $${order.totalAmount}
            </p>

            <hr />

            <h3>User Details</h3>

            <p>
                <strong>Name:</strong>
                ${user?.name || "N/A"}
            </p>

            <p>
                <strong>Username:</strong>
                ${user?.username || "N/A"}
            </p>

            <p>
                <strong>City:</strong>
                ${user?.city || "N/A"}
            </p>

            <p>
                <strong>Amount:</strong>
                $${order.totalAmount}
            </p>

            <hr />

            <p>
                Please verify the payment from admin panel.
            </p>
        `
    });

    // ─────────────────────────────────────────────
    // RESPONSE
    // ─────────────────────────────────────────────
    return res.status(200).json(
        new ApiResponse(
            200,
            {
                paymentRequested: true
            },
            "Payment notification sent successfully"
        )
    );
});
// admin routes





const viewAllOrders = asynchandler(async (req, res) => {

  ensureSuperAdmin(req);

  // ─────────────────────────────────────────────
  // QUERY PARAMS
  // ─────────────────────────────────────────────
  const {
    status,
    paymentStatus,
    paymentMethod,
    startDate,
    endDate,
    area, // ✅ NEW
    page = 1,
    limit = 10,
    search
  } = req.query;

  // ─────────────────────────────────────────────
  // FILTER
  // ─────────────────────────────────────────────
  const filter = {};

  // ORDER STATUS
  if (status) {
    filter.status = status;
  }

  // PAYMENT STATUS
  if (paymentStatus) {
    filter["payment.status"] = paymentStatus;
  }

  // PAYMENT METHOD
  if (paymentMethod) {
    filter["payment.method"] = paymentMethod;
  }

  // ✅ AREA FILTER
  // matches city / state / zip / address
  if (area) {

    filter.$or = [

      {
        "deliveryDetails.city": {
          $regex: area,
          $options: "i"
        }
      },

      {
        "deliveryDetails.area": {
          $regex: area,
          $options: "i"
        }
      }

    ];
  }

  // DATE RANGE
  if (startDate || endDate) {

    filter.createdAt = {};

    if (startDate) {
      filter.createdAt.$gte = new Date(startDate);
    }

    if (endDate) {

      const end = new Date(endDate);

      end.setHours(23, 59, 59, 999);

      filter.createdAt.$lte = end;
    }
  }

  // SEARCH BY ORDER ID
  if (search) {
    filter._id = search;
  }

  // ─────────────────────────────────────────────
  // PAGINATION
  // ─────────────────────────────────────────────
  const currentPage = Number(page) || 1;

  const perPage = Number(limit) || 10;

  const skip = (currentPage - 1) * perPage;

  // ─────────────────────────────────────────────
  // FETCH ORDERS
  // ─────────────────────────────────────────────
  const orders = await Order.find(filter)
    .populate("userId", "name email phone_number")
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(perPage)
    .lean();

  // ─────────────────────────────────────────────
  // TOTAL COUNT
  // ─────────────────────────────────────────────
  const totalOrders = await Order.countDocuments(filter);

  // ─────────────────────────────────────────────
  // FORMAT RESPONSE
  // ─────────────────────────────────────────────
  const formattedOrders = orders.map(order => ({

    orderId: order._id,

    customer: {
      userId: order.userId?._id,
      name: order.userId?.name,
      email: order.userId?.email,
      phone: order.userId?.phone_number
    },

    status: order.status,

    totalAmount: order.totalAmount,

    payment: order.payment,

    paymentRequested: order.paymentRequested || false,

    deliveryDetails: order.deliveryDetails,

    itemCount: order.items.length,

    items: order.items.map(item => ({
      productId: item.productId,
      name: item.name,
      quantity: item.quantity,
      price: item.price,
      type: item.type,
      total: item.quantity * item.price
    })),

    placedAt: order.createdAt

  }));

  // ─────────────────────────────────────────────
  // RESPONSE
  // ─────────────────────────────────────────────
  return res.status(200).json(
    new ApiResponse(
      200,
      {
        orders: formattedOrders,

        filters: {
          status: status || null,
          paymentStatus: paymentStatus || null,
          paymentMethod: paymentMethod || null,
          startDate: startDate || null,
          endDate: endDate || null,
          area: area || null
        },

        pagination: {
          totalOrders,
          currentPage,
          totalPages: Math.ceil(totalOrders / perPage),
          limit: perPage
        }

      },
      "Orders fetched successfully"
    )
  );
});


export {
    placeOrder,
    getUserOrders,
    getOrderById,
    getUserProductSummary,
    cancelOrder,
    updateOrderStatus,
    getAllOrders,
    addToCart,
    viewCart,
    removeFromCart,
    getNextDeliveryDate,
    deleteCartItem,
    clearCart,
     ProceedToOrder,
     viewMyOrders,
      notifyPaymentDone,
      viewAllOrders,
        deleteAllOrdersOfUser
};