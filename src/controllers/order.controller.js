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

const ensureSuperAdmin = (req) => {
        const isSuperAdmin = req.staff?.email?.toLowerCase() === SUPER_ADMIN_EMAIL.toLowerCase();
console.log(req.staff?.email?.toLowerCase());
console.log(SUPER_ADMIN_EMAIL.toLowerCase());

    if (!isSuperAdmin) {
        throw new ApiError(403, "only super admin can perform this action");
    }

    return {
        role: HARD_CODED_SUPER_ADMIN_ROLE,
        email: req.staff.email
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







// const addToCart = asynchandler(async (req, res) => {
//   const userId = req.user._id;
//   console.log(userId);

//   const { items } = req.body;

//   if (!items || !Array.isArray(items) || items.length === 0) {
//     throw new ApiError(400, "Items are required");
//   }

//   let cart = await Cart.findOne({ user: userId });

//   if (!cart) {
//     cart = await Cart.create({ user: userId, items: [] });
//   }

//   // =========================
//   // 🔁 LOOP THROUGH ITEMS
//   // =========================
//   for (const item of items) {

//     const { type, productId, comboId, quantity = 1, selections = [] } = item;

//     // =========================
//     // 🛒 PRODUCT
//     // =========================
//     if (type === "product") {

//       if (!mongoose.Types.ObjectId.isValid(productId)) {
//         throw new ApiError(400, "Invalid product ID");
//       }

//       const product = await Product.findById(productId);

//       if (!product || !product.isAvailable) {
//         throw new ApiError(404, "Product not available");
//       }

//       cart.items.push({
//         type: "product",
//         productId,
//         quantity
//       });
//     }

//     // =========================
//     // 🍽️ COMBO
//     // =========================
//     else if (type === "combo") {

//       if (!mongoose.Types.ObjectId.isValid(comboId)) {
//         throw new ApiError(400, "Invalid combo ID");
//       }

//       const combo = await Combo.findById(comboId);

//       if (!combo || !combo.isActive) {
//         throw new ApiError(404, "Combo not available");
//       }

//       // 🔥 RULE VALIDATION
//       combo.rules.forEach(rule => {

//         if (rule.isFixed) return;

//         const userSelection = selections.find(
//           s => s.ruleId.toString() === rule._id.toString()
//         );

//         if (!userSelection && !rule.isOptional) {
//           throw new ApiError(400, `Selection required for ${rule.title}`);
//         }

//         if (userSelection) {
//           if (userSelection.products.length !== rule.quantity) {
//             throw new ApiError(
//               400,
//               `Invalid selection for ${rule.title}`
//             );
//           }

//           // 🔥 EXTRA: validate product category match
//           userSelection.products.forEach(p => {
//             // (optional deeper validation)
//             // ensure product belongs to allowed categories
//           });
//         }
//       });

//       cart.items.push({
//         type: "combo",
//         comboId,
//         quantity,
//         selections
//       });
//     }

//     else {
//       throw new ApiError(400, "Invalid item type");
//     }
//   }

//   await cart.save();

//   return res.status(200).json(
//     new ApiResponse(200, cart, "Items added to cart successfully")
//   );
// });

// const addToCart = asynchandler(async (req, res) => {

//   // ==========================
//   // 🔐 AUTH CHECK
//   // ==========================
//   if (!req.user || !req.user._id) {
//     throw new ApiError(401, "Unauthorized user");
//   }

//   const userId = req.user._id;
//   console.log("USER ID:", userId);

//   const { items } = req.body;

//   if (!items || !Array.isArray(items) || items.length === 0) {
//     throw new ApiError(400, "Items are required");
//   }

//   // ==========================
//   // 🔥 ATOMIC FIND OR CREATE (BEST PRACTICE)
//   // ==========================
//   let cart = await Cart.findOneAndUpdate(
//     { user: userId },
//     { $setOnInsert: { user: userId, items: [] } },
//     { new: true, upsert: true }
//   );

//   if (!cart) {
//     throw new ApiError(500, "Cart creation failed");
//   }

//   // ==========================
//   // 🔁 LOOP THROUGH ITEMS
//   // ==========================
//   for (const item of items) {

//     const {
//       type,
//       productId,
//       comboId,
//       quantity = 1,
//       selections = []
//     } = item;

//     // ==========================
//     // 🛒 PRODUCT
//     // ==========================
//     if (type === "product") {

//       if (!mongoose.Types.ObjectId.isValid(productId)) {
//         throw new ApiError(400, "Invalid product ID");
//       }

//       const product = await Product.findById(productId);

//       if (!product || !product.isAvailable) {
//         throw new ApiError(404, "Product not available");
//       }

//       // 🔥 CHECK IF PRODUCT ALREADY EXISTS
//       const existingItem = cart.items.find(
//         i => i.type === "product" && i.productId?.toString() === productId
//       );

//       if (existingItem) {
//         existingItem.quantity += quantity;
//       } else {
//         cart.items.push({
//           type: "product",
//           productId,
//           quantity
//         });
//       }
//     }

//     // ==========================
//     // 🍽️ COMBO
//     // ==========================
//     else if (type === "combo") {

//       if (!mongoose.Types.ObjectId.isValid(comboId)) {
//         throw new ApiError(400, "Invalid combo ID");
//       }

//       const combo = await Combo.findById(comboId);

//       if (!combo || !combo.isActive) {
//         throw new ApiError(404, "Combo not available");
//       }

//       // ==========================
//       // 🔥 RULE VALIDATION
//       // ==========================
//       combo.rules.forEach(rule => {

//         if (rule.isFixed) return;

//         const userSelection = selections.find(
//           s => s.ruleId.toString() === rule._id.toString()
//         );

//         if (!userSelection && !rule.isOptional) {
//           throw new ApiError(400, `Selection required for ${rule.title}`);
//         }

//         if (userSelection) {
//           if (userSelection.products.length !== rule.quantity) {
//             throw new ApiError(
//               400,
//               `Invalid selection for ${rule.title}`
//             );
//           }
//         }
//       });

//       // 🔥 SIMPLE: always push combo (can enhance later)
//       cart.items.push({
//         type: "combo",
//         comboId,
//         quantity,
//         selections
//       });
//     }

//     else {
//       throw new ApiError(400, "Invalid item type");
//     }
//   }

//   // ==========================
//   // 💾 SAVE CART
//   // ==========================
//   await cart.save();

//   return res.status(200).json(
//     new ApiResponse(200, cart, "Items added to cart successfully")
//   );
// });


// const viewCart = asynchandler(async (req, res) => {
//   const userId = req.user._id;

//   const cart = await Cart.findOne({ user: userId })
//     .populate({
//       path: "items.productId",
//       select: "name category food_class variants"
//     })
//     .populate({
//       path: "items.comboId",
//       select: "name price size rules"
//     })
//     .lean();

//   if (!cart || cart.items.length === 0) {
//     return res.status(200).json(
//       new ApiResponse(200, { items: [], totalAmount: 0 }, "Cart is empty")
//     );
//   }

//   let totalAmount = 0;

//   const formattedItems = cart.items.map(item => {

//     // =========================
//     // 🛒 PRODUCT ITEM
//     // =========================
//     if (item.type === "product") {
//       const product = item.productId;

//       if (!product) return null;

//       // take default / first variant price
//       const price = product.variants?.[0]?.price || 0;

//       totalAmount += price * item.quantity;

//       return {
//         type: "product",
//         productId: product._id,
//         name: product.name,
//         category: product.category,
//         price,
//         quantity: item.quantity,
//         total: price * item.quantity
//       };
//     }

//     // =========================
//     // 🍽️ COMBO ITEM
//     // =========================
//     else if (item.type === "combo") {
//       const combo = item.comboId;

//       if (!combo) return null;

//       let comboTotal = combo.price * item.quantity;
//       totalAmount += comboTotal;

//       return {
//         type: "combo",
//         comboId: combo._id,
//         name: combo.name,
//         basePrice: combo.price,
//         quantity: item.quantity,
//         total: comboTotal,
//         selections: item.selections
//       };
//     }

//     return null;
//   }).filter(Boolean);

//   return res.status(200).json(
//     new ApiResponse(
//       200,
//       {
//         items: formattedItems,
//         totalAmount
//       },
//       "Cart fetched successfully"
//     )
//   );
// });





// const addToCart = asynchandler(async (req, res) => {

//   // ==========================
//   // 🔐 AUTH CHECK
//   // ==========================
//   if (!req.user || !req.user._id) {
//     throw new ApiError(401, "Unauthorized user");
//   }

//   const userId = req.user._id;

//   const { items } = req.body;

//   if (!items || !Array.isArray(items) || items.length === 0) {
//     throw new ApiError(400, "Items are required");
//   }

//   // ==========================
//   // 🔥 ATOMIC FIND OR CREATE
//   // ==========================
//   let cart = await Cart.findOneAndUpdate(
//     { user: userId },
//     { $setOnInsert: { user: userId, items: [] } },
//     { new: true, upsert: true }
//   );

//   if (!cart) {
//     throw new ApiError(500, "Cart creation failed");
//   }

//   // ==========================
//   // 🔁 LOOP THROUGH ITEMS
//   // ==========================
//   for (const item of items) {

//     const {
//       type,
//       productId,
//       comboId,
//       quantity = 1,
//       selections = []
//     } = item;

//     // ==========================
//     // 🛒 PRODUCT
//     // ==========================
//     if (type === "product") {

//       if (!mongoose.Types.ObjectId.isValid(productId)) {
//         throw new ApiError(400, "Invalid product ID");
//       }

//       const product = await Product.findById(productId);

//       if (!product || !product.isAvailable) {
//         throw new ApiError(404, "Product not available");
//       }

//       const existingItem = cart.items.find(
//         i => i.type === "product" && i.productId?.toString() === productId
//       );

//       if (existingItem) {
//         existingItem.quantity += quantity;
//       } else {
//         cart.items.push({
//           itemId: new mongoose.Types.ObjectId(), // 🔥 NEW FIELD
//           type: "product",
//           productId,
//           quantity
//         });
//       }
//     }

//     // ==========================
//     // 🍽️ COMBO
//     // ==========================
//     else if (type === "combo") {

//       if (!mongoose.Types.ObjectId.isValid(comboId)) {
//         throw new ApiError(400, "Invalid combo ID");
//       }

//       const combo = await Combo.findById(comboId);

//       if (!combo || !combo.isActive) {
//         throw new ApiError(404, "Combo not available");
//       }

//       combo.rules.forEach(rule => {

//         if (rule.isFixed) return;

//         const userSelection = selections.find(
//           s => s.ruleId.toString() === rule._id.toString()
//         );

//         if (!userSelection && !rule.isOptional) {
//           throw new ApiError(400, `Selection required for ${rule.title}`);
//         }

//         if (userSelection) {
//           if (userSelection.products.length !== rule.quantity) {
//             throw new ApiError(
//               400,
//               `Invalid selection for ${rule.title}`
//             );
//           }
//         }
//       });

//       cart.items.push({
//         itemId: new mongoose.Types.ObjectId(), // 🔥 NEW FIELD
//         type: "combo",
//         comboId,
//         quantity,
//         selections
//       });
//     }

//     else {
//       throw new ApiError(400, "Invalid item type");
//     }
//   }

//   // ==========================
//   // 💾 SAVE CART
//   // ==========================
//   await cart.save();

//   return res.status(200).json(
//     new ApiResponse(200, cart, "Items added to cart successfully")
//   );
// });





const addToCart = asynchandler(async (req, res) => {

  // 🔐 AUTH CHECK
  if (!req.user || !req.user._id) {
    throw new ApiError(401, "Unauthorized user");
  }

  const userId = req.user._id;
  const { items } = req.body;

  if (!items || !Array.isArray(items) || items.length === 0) {
    throw new ApiError(400, "Items are required");
  }

  // 🔥 FIND OR CREATE CART
  let cart = await Cart.findOneAndUpdate(
    { user: userId },
    { $setOnInsert: { user: userId, items: [] } },
    { new: true, upsert: true }
  );

  if (!cart) {
    throw new ApiError(500, "Cart creation failed");
  }

  // 🔁 LOOP ITEMS
  for (const item of items) {

    const {
      type,
      productId,
      comboId,
      quantity = 1,
      selections = []
    } = item;

    // ==========================
    // 🛒 PRODUCT
    // ==========================
    if (type === "product") {

      if (!mongoose.Types.ObjectId.isValid(productId)) {
        throw new ApiError(400, "Invalid product ID");
      }

      const product = await Product.findById(productId);

      if (!product || !product.isAvailable) {
        throw new ApiError(404, "Product not available");
      }

      const existingItem = cart.items.find(
        i =>
          i.type === "product" &&
          i.productId?.toString() === productId
      );

      if (existingItem) {
        // ✅ ONLY increase quantity
        existingItem.quantity += quantity;
      } else {
        // ✅ CREATE NEW itemId ONLY ONCE
        cart.items.push({
          itemId: new mongoose.Types.ObjectId(),
          type: "product",
          productId,
          quantity,
          selections: []
        });
      }
    }

    // ==========================
    // 🍽️ COMBO
    // ==========================
    else if (type === "combo") {

      if (!mongoose.Types.ObjectId.isValid(comboId)) {
        throw new ApiError(400, "Invalid combo ID");
      }

      const combo = await Combo.findById(comboId);

      if (!combo || !combo.isActive) {
        throw new ApiError(404, "Combo not available");
      }

      // ✅ VALIDATE RULES
      combo.rules.forEach(rule => {

        if (rule.isFixed) return;

        const userSelection = selections.find(
          s => s.ruleId.toString() === rule._id.toString()
        );

        if (!userSelection && !rule.isOptional) {
          throw new ApiError(400, `Selection required for ${rule.title}`);
        }

        if (userSelection) {
          if (userSelection.products.length !== rule.quantity) {
            throw new ApiError(
              400,
              `Invalid selection for ${rule.title}`
            );
          }
        }
      });

      // ⚠️ NOTE: combos always pushed as new (you can optimize later)
      cart.items.push({
        itemId: new mongoose.Types.ObjectId(),
        type: "combo",
        comboId,
        quantity,
        selections
      });
    }

    else {
      throw new ApiError(400, "Invalid item type");
    }
  }

  // 💾 SAVE
  await cart.save();

  return res.status(200).json(
    new ApiResponse(200, cart, "Items added to cart successfully")
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
  const userId = req.user?._id;

  if (!userId) {
    throw new ApiError(401, "Unauthorized");
  }

  const cart = await Cart.findOne({ user: userId })
    .populate("items.productId", "name category variants isAvailable")
    .populate("items.comboId", "name price size isActive rules")
    .lean();

  if (!cart || !cart.items || cart.items.length === 0) {
    return res.status(200).json(
      new ApiResponse(
        200,
        { items: [], totalAmount: 0, summary: {} },
        "Cart is empty"
      )
    );
  }

  let totalAmount = 0;
  const formattedItems = [];

  const summary = {
    roti: 0,
    dal: 0,
    veg: 0,
    paneer: 0,
    chicken: 0
  };

  for (const item of cart.items) {

    // =========================
    // 🛒 PRODUCT
    // =========================
    if (item.type === "product") {
      const product = item.productId;

      if (!product || !product.isAvailable) continue;

      const selectedVariant =
        product.variants?.find(v => v.size === item.variant) ||
        product.variants?.[0];

      const price = selectedVariant?.price || 0;
      const itemTotal = price * item.quantity;

      totalAmount += itemTotal;

      summary[product.category] =
        (summary[product.category] || 0) + item.quantity;

      formattedItems.push({
        itemId: item.itemId, // ✅ FIXED
        type: "product",
        productId: product._id,
        name: product.name,
        size: selectedVariant?.size || "default",
        price,
        quantity: item.quantity,
        total: itemTotal
      });
    }

    // =========================
    // 🍽️ COMBO
    // =========================
    else if (item.type === "combo") {
      const combo = item.comboId;

      if (!combo || !combo.isActive) continue;

      const comboTotal = combo.price * item.quantity;
      totalAmount += comboTotal;

      const fixedItems = (combo.rules || [])
        .filter(rule => rule.isFixed)
        .map(rule => {
          const category = rule.category?.[0];

          summary[category] =
            (summary[category] || 0) + (rule.quantity * item.quantity);

          return {
            title: rule.title,
            quantity: rule.quantity
          };
        });

      const formattedSelections = [];

      for (const sel of item.selections || []) {

        const productIds = sel.products.map(p => p.productId);

        const products = await Product.find({
          _id: { $in: productIds }
        }).select("name category");

        const productMap = {};
        products.forEach(p => {
          productMap[p._id.toString()] = p;
        });

        const detailedProducts = sel.products.map(p => {
          const prod = productMap[p.productId.toString()];
          if (!prod) return null;

          summary[prod.category] =
            (summary[prod.category] || 0) +
            (p.quantity * item.quantity);

          return {
            productId: prod._id,
            name: prod.name,
            quantity: p.quantity
          };
        }).filter(Boolean);

        formattedSelections.push({
          ruleId: sel.ruleId,
          products: detailedProducts
        });
      }

      formattedItems.push({
        itemId: item.itemId, // ✅ FIXED
        type: "combo",
        comboId: combo._id,
        name: combo.name,
        quantity: item.quantity,
        basePrice: combo.price,
        total: comboTotal,
        fixedItems,
        selections: formattedSelections
      });
    }
  }

  const cleanSummary = Object.fromEntries(
    Object.entries(summary).filter(([_, v]) => v > 0)
  );

  return res.status(200).json(
    new ApiResponse(
      200,
      {
        items: formattedItems,
        totalAmount,
        summary: cleanSummary
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
  const userId = req.user?._id;

  if (!userId) {
    throw new ApiError(401, "Unauthorized");
  }

  const { itemId, removeAll = false } = req.body;

  if (!itemId) {
    throw new ApiError(400, "itemId is required");
  }

  const cart = await Cart.findOne({ user: userId });

  if (!cart || !cart.items || cart.items.length === 0) {
    throw new ApiError(404, "Cart is empty");
  }

  // =========================
  // 🔍 FIND ITEM (FIXED)
  // =========================
  const itemIndex = cart.items.findIndex(
    item => item.itemId?.toString() === itemId
  );

  if (itemIndex === -1) {
    throw new ApiError(404, "Item not found in cart");
  }

  const item = cart.items[itemIndex];

  // =========================
  // ❌ REMOVE LOGIC
  // =========================

  if (removeAll || item.quantity <= 1) {
    // 👉 Remove entire item
    cart.items.splice(itemIndex, 1);
  } else {
    // 👉 Decrease quantity
    item.quantity -= 1;
  }

  await cart.save();

  return res.status(200).json(
    new ApiResponse(200, cart, "Item removed from cart")
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
    // 🔥 CONFIG (DYNAMIC)
    // ==========================
    // const deliveryDays = [1, 3, 5]; // Monday, Wednesday, Friday
    const deliveryDays = [3]; // Monday, Wednesday, Friday
    const cutoffHour = 22; // 10 PM

    // ==========================
    // 🕒 CURRENT TIME (PST/PDT)
    // ==========================
    const now = new Date();

    const usDate = new Date(
        now.toLocaleString("en-US", { timeZone: "America/Los_Angeles" })
    );

    const today = usDate.getDay();
    const currentHour = usDate.getHours();

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
        throw new ApiError(500, "No delivery days configured");
    }

    // ==========================
    // 📅 NEXT DELIVERY DATE
    // ==========================
    const nextDeliveryDate = new Date(usDate);
    nextDeliveryDate.setDate(usDate.getDate() + daysToAdd);

    // ==========================
    // 🔥 CHECK CUTOFF LOGIC
    // ==========================
    const previousDay = (nextDeliveryDay + 6) % 7; // day before delivery

    let isAcceptingOrders = true;

    // Case 1: Today is delivery day → NOT accepting
    if (deliveryDays.includes(today)) {
        isAcceptingOrders = false;
    }

    // Case 2: Today is previous day & after cutoff time
    if (today === previousDay && currentHour >= cutoffHour) {
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
    // ✅ ACCEPTING → SEND DATE
    // ==========================
    const formattedDate = nextDeliveryDate.toLocaleDateString("en-US", {
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric",
        timeZone: "America/Los_Angeles"
    });

    return res.status(200).json(
        new ApiResponse(
            200,
            {
                acceptingOrders: true,
                date: nextDeliveryDate,
                formatted: formattedDate,
                day: nextDeliveryDate.toLocaleDateString("en-US", {
                    weekday: "long",
                    timeZone: "America/Los_Angeles"
                })
            },
            "Next delivery date fetched successfully"
        )
    );
});



const ProceedToOrder = asynchandler(async (req, res) => {
  const userId = req.user?._id;

  if (!userId) {
    throw new ApiError(401, "Unauthorized");
  }

  const { addressId, payment } = req.body;

  // ─────────────────────────────────────────────
  // 1. VALIDATE ADDRESS
  // ─────────────────────────────────────────────
  if (!addressId) {
    throw new ApiError(400, "Please select a delivery address");
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
  // 2. FETCH USER
  // ─────────────────────────────────────────────
  const User = await user.findById(userId).select(
    "name email phone_number"
  );
console.log(User.email,"this is mail");

  // ─────────────────────────────────────────────
  // 3. FETCH CART
  // ─────────────────────────────────────────────
  const cart = await Cart.findOne({ user: userId })
    .populate("items.productId", "name category variants isAvailable")
    .populate("items.comboId", "name price size isActive rules")
    .lean();

  if (!cart || !cart.items || cart.items.length === 0) {
    throw new ApiError(400, "Cart is empty");
  }

  // ─────────────────────────────────────────────
  // 4. BUILD ORDER ITEMS
  // ─────────────────────────────────────────────
  let totalAmount = 0;
  const orderItems = [];

  for (const item of cart.items) {

    // ===========================================
    // PRODUCT
    // ===========================================
    if (item.type === "product") {
      const product = item.productId;

      if (!product || !product.isAvailable) continue;

      const selectedVariant =
        product.variants?.find(v => v.size === item.variant) ||
        product.variants?.[0];

      const price = selectedVariant?.price || 0;

      const itemTotal = price * item.quantity;

      totalAmount += itemTotal;

      orderItems.push({
        productId: product._id,
        name: product.name,
        quantity: item.quantity,
        price,
        type: "addon"
      });
    }

    // ===========================================
    // COMBO
    // ===========================================
    else if (item.type === "combo") {

      const combo = item.comboId;

      if (!combo || !combo.isActive) continue;

      const comboTotal = combo.price * item.quantity;

      totalAmount += comboTotal;

      orderItems.push({
        productId: combo._id,
        name: combo.name,
        quantity: item.quantity,
        price: combo.price,
        type: "combo"
      });

      for (const sel of item.selections || []) {

        const productIds = sel.products.map(p => p.productId);

        const products = await Product.find({
          _id: { $in: productIds }
        }).select("name category");

        const productMap = {};

        products.forEach(p => {
          productMap[p._id.toString()] = p;
        });

        for (const p of sel.products) {

          const prod = productMap[p.productId.toString()];

          if (!prod) continue;

          orderItems.push({
            productId: prod._id,
            name: prod.name,
            quantity: p.quantity * item.quantity,
            price: 0,
            type: "addon"
          });
        }
      }
    }
  }

  if (orderItems.length === 0) {
    throw new ApiError(
      400,
      "No valid items found in cart to place order"
    );
  }

  // ─────────────────────────────────────────────
  // 5. DELIVERY DETAILS
  // ─────────────────────────────────────────────
  const deliveryDetails = {
    addressId: address._id,
    addressLine1: address.addressLine1,
    addressLine2: address.addressLine2 || "",
    city: address.city,
    state: address.state,
    zipCode: address.zipCode,
    country: address.country,
    area: address.area || "bay_area",
    location: address.location || {},
    phone: user?.phone_number || ""
  };

  // ─────────────────────────────────────────────
  // 6. CREATE ORDER
  // ─────────────────────────────────────────────
  const order = await Order.create({
    userId,
    items: orderItems,
    totalAmount,
    status: "pending",
    deliveryDetails,
    payment: {
      method: payment?.method || "Pay Later",
      status: "pending"
    }
  });

  // ─────────────────────────────────────────────
  // 7. SELECT PAYMENT DETAILS BASED ON AREA
  // ─────────────────────────────────────────────
  let paymentDetails = {};

  const area = (address.area || "").toLowerCase();

  // Example logic
  if (
    area.includes("bay_area") 
  ) {

    paymentDetails = {
      venmoId: "@north-store",
      bankName: "bay area Chase Bank",
      accountName: "North Foods LLC",
      accountNumber: "XXXXXX1234",
      routingNumber: "021000021"
    };

  } else {

    paymentDetails = {
      venmoId: "@south-store",
      bankName: "seattle Bank of America",
      accountName: "South Foods LLC",
      accountNumber: "XXXXXX5678",
      routingNumber: "026009593"
    };
  }

  // ─────────────────────────────────────────────
  // 8. BUILD ORDER HTML
  // ─────────────────────────────────────────────
  const orderItemsHtml = orderItems.map((item) => {
    return `
      <tr>
        <td>${item.name}</td>
        <td>${item.quantity}</td>
        <td>$${item.price}</td>
      </tr>
    `;
  }).join("");

  // ─────────────────────────────────────────────
  // 9. ADMIN EMAIL
  // ─────────────────────────────────────────────
  const adminHtml = `
    <h2>New Order Received</h2>

    <p><strong>Order ID:</strong> ${order._id}</p>

    <h3>User Details</h3>

    <p>
      Name: ${User?.full_name || ""}
      <br/>
      Email: ${User?.email || ""}
      <br/>
      Phone: ${User?.phone_number || ""}
    </p>

    <h3>Delivery Address</h3>

    <p>
      ${deliveryDetails.addressLine1}
      ${deliveryDetails.addressLine2}
      <br/>
      ${deliveryDetails.city},
      ${deliveryDetails.state}
      <br/>
      ${deliveryDetails.zipCode},
      ${deliveryDetails.country}
    </p>

    <h3>Items</h3>

    <table border="1" cellpadding="10" cellspacing="0">
      <thead>
        <tr>
          <th>Item</th>
          <th>Qty</th>
          <th>Price</th>
        </tr>
      </thead>

      <tbody>
        ${orderItemsHtml}
      </tbody>
    </table>

    <h3>Total: $${totalAmount}</h3>

    <h3>Payment Method</h3>

    <p>${payment?.method || "Pay Later"}</p>
  `;

  // ─────────────────────────────────────────────
  // 10. USER EMAIL
  // ─────────────────────────────────────────────
  const userHtml = `
    <h2>Thank You For Your Order 🎉</h2>

    <p>
      Hello ${User?.name || "Customer"},
    </p>

    <p>
      Your order has been placed successfully.
    </p>

    <p>
      <strong>Order ID:</strong> ${order._id}
    </p>

    <h3>Order Details</h3>

    <table border="1" cellpadding="10" cellspacing="0">
      <thead>
        <tr>
          <th>Item</th>
          <th>Qty</th>
          <th>Price</th>
        </tr>
      </thead>

      <tbody>
        ${orderItemsHtml}
      </tbody>
    </table>

    <h3>Total Amount: $${totalAmount}</h3>

    <h3>Payment Instructions</h3>

    <p>
      <strong>Venmo:</strong> ${paymentDetails.venmoId}
    </p>

    <p>
      <strong>Bank Name:</strong> ${paymentDetails.bankName}
      <br/>
      <strong>Account Name:</strong> ${paymentDetails.accountName}
      <br/>
      <strong>Account Number:</strong> ${paymentDetails.accountNumber}
      <br/>
      <strong>Routing Number:</strong> ${paymentDetails.routingNumber}
    </p>

    <p>
      Please complete the payment and share payment screenshot if required.
    </p>
  `;

  // ─────────────────────────────────────────────
  // 11. SEND MAILS
  // ─────────────────────────────────────────────
console.log(User?.email ? `Sending order confirmation to ${User.email}` : "User email not available, skipping user notification");
console.log("");
console.log("Admin Email Content:", process.env.ADMIN_EMAIL);

  // ADMIN MAIL
  await sendEmail({
    to: process.env.ADMIN_EMAIL,
    subject: `New Order Received - ${order._id}`,
    html: adminHtml
  });

  // USER MAIL
  if (User?.email) {
    console.log("sending user mail rhfiuheriufgeirugfiuer");
    console.log("User Email Content:", User.email);
    await sendEmail({
      to: User.email,
      subject: `Your Order Confirmation - ${order._id}`,
      html: userHtml
    });
  }

  // ─────────────────────────────────────────────
  // 12. CLEAR CART
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
  // 13. RESPONSE
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

  const userId = req.user?._id;

  if (!userId) {
    throw new ApiError(401, "Unauthorized");
  }

  // ─────────────────────────────────────────────
  // QUERY PARAMS
  // ─────────────────────────────────────────────
  const {
    status,
    paymentStatus,
    paymentMethod
  } = req.query;

  // ─────────────────────────────────────────────
  // BUILD FILTER
  // ─────────────────────────────────────────────
  const filter = {
    userId
  };

  if (status) {
    filter.status = status;
  }

  if (paymentStatus) {
    filter["payment.status"] = paymentStatus;
  }

  if (paymentMethod) {
    filter["payment.method"] = paymentMethod;
  }

  // ─────────────────────────────────────────────
  // FIXED LIMIT → LAST 16 ORDERS
  // ─────────────────────────────────────────────
  const LIMIT = 16;

  // ─────────────────────────────────────────────
  // FETCH ORDERS
  // ─────────────────────────────────────────────
  const orders = await Order.find(filter)
    .sort({ createdAt: -1 })
    .limit(LIMIT)
    .lean();

  // ─────────────────────────────────────────────
  // TOTAL COUNT
  // ─────────────────────────────────────────────
  const totalOrders = await Order.countDocuments(filter);

  // ─────────────────────────────────────────────
  // EMPTY RESPONSE
  // ─────────────────────────────────────────────
  if (!orders || orders.length === 0) {

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
  // DELIVERY CONFIG
  // ─────────────────────────────────────────────
  const deliveryDays = [3]; // Monday

  // ─────────────────────────────────────────────
  // FUNCTION → GET NEXT DELIVERY DATE
  // ─────────────────────────────────────────────
  const calculateDeliveryDate = (createdAt) => {

    const orderDate = new Date(createdAt);

    const usDate = new Date(
      orderDate.toLocaleString("en-US", {
        timeZone: "America/Los_Angeles"
      })
    );

    const today = usDate.getDay();

    let daysToAdd = null;

    for (let i = 1; i <= 7; i++) {

      const nextDay = (today + i) % 7;

      if (deliveryDays.includes(nextDay)) {
        daysToAdd = i;
        break;
      }
    }

    const nextDeliveryDate = new Date(usDate);

    nextDeliveryDate.setDate(usDate.getDate() + daysToAdd);

    return {
      date: nextDeliveryDate,

      formatted: nextDeliveryDate.toLocaleDateString("en-US", {
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric",
        timeZone: "America/Los_Angeles"
      }),

      day: nextDeliveryDate.toLocaleDateString("en-US", {
        weekday: "long",
        timeZone: "America/Los_Angeles"
      })
    };
  };

  // ─────────────────────────────────────────────
  // FORMAT ORDERS
  // ─────────────────────────────────────────────
  const formattedOrders = orders.map(order => {

    const deliveryDate = calculateDeliveryDate(order.createdAt);

    return {

      orderId: order._id,

      status: order.status,

      totalAmount: order.totalAmount,

      payment: {
        method: order.payment?.method || "",
        status: order.payment?.status || ""
      },

      deliveryDetails: order.deliveryDetails,

      deliveryDate,

      itemCount: order.items.length,

      items: order.items.map(item => ({

        productId: item.productId,

        name: item.name,

        quantity: item.quantity,

        price: item.price,

        type: item.type,

        total: item.price * item.quantity

      })),

      paymentRequested: order.paymentRequested || false,

      placedAt: order.createdAt

    };

  });

  // ─────────────────────────────────────────────
  // RESPONSE
  // ─────────────────────────────────────────────
  return res.status(200).json(
    new ApiResponse(
      200,
      {
        orders: formattedOrders,
        totalOrders
      },
      "Last 16 orders fetched successfully"
    )
  );
});


// const viewSingleOrder = asynchandler(async (req, res) => {

//   const userId = req.user?._id;

//   if (!userId) {
//     throw new ApiError(401, "Unauthorized");
//   }

//   // ─────────────────────────────────────────────
//   // PARAMS
//   // ─────────────────────────────────────────────
//   const { orderId } = req.params;

//   if (!orderId) {
//     throw new ApiError(400, "Order ID is required");
//   }

//   // ─────────────────────────────────────────────
//   // FETCH ORDER
//   // ─────────────────────────────────────────────
//   const order = await Order.findOne({
//     _id: orderId,
//     userId
//   })
//     .populate("items.productId")
//     .populate("comboId")
//     .lean();

//   if (!order) {
//     throw new ApiError(404, "Order not found");
//   }

//   // ─────────────────────────────────────────────
//   // FORMAT RESPONSE
//   // ─────────────────────────────────────────────
//   const formattedOrder = {

//     orderId: order._id,

//     combo: order.comboId || null,

//     status: order.status,

//     totalAmount: order.totalAmount,

//     payment: {
//       method: order.payment?.method || "",
//       status: order.payment?.status || ""
//     },

//     // ✅ USER PAYMENT REQUEST
//     paymentRequested:
//       order.paymentRequested || false,

//     // ✅ DELIVERY DATE
//     deliveryDate: order.deliveryDate
//       ? {
//           date: order.deliveryDate,

//           formatted: new Date(
//             order.deliveryDate
//           ).toLocaleDateString("en-US", {
//             weekday: "long",
//             year: "numeric",
//             month: "long",
//             day: "numeric",
//             timeZone: "America/Los_Angeles"
//           })
//         }
//       : null,

//     // ✅ DELIVERED TIME
//     deliveredAt: order.deliveredAt
//       ? {
//           date: order.deliveredAt,

//           formatted: new Date(
//             order.deliveredAt
//           ).toLocaleDateString("en-US", {
//             weekday: "long",
//             year: "numeric",
//             month: "long",
//             day: "numeric",
//             timeZone: "America/Los_Angeles"
//           })
//         }
//       : null,

//     // ✅ DELIVERY DETAILS
//     deliveryDetails: order.deliveryDetails,

//     // ✅ ITEM COUNT
//     itemCount: order.items.length,

//     // ✅ ITEMS
//     items: order.items.map(item => ({

//       productId: item.productId?._id || null,

//       product: item.productId || null,

//       name: item.name,

//       quantity: item.quantity,

//       price: item.price,

//       type: item.type,

//       total: item.quantity * item.price

//     })),

//     placedAt: order.createdAt,

//     updatedAt: order.updatedAt
//   };

//   // ─────────────────────────────────────────────
//   // RESPONSE
//   // ─────────────────────────────────────────────
//   return res.status(200).json(
//     new ApiResponse(
//       200,
//       formattedOrder,
//       "Order fetched successfully"
//     )
//   );
// });


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
    // FIND ORDER
    // ─────────────────────────────────────────────
    const order = await Order.findOne({
        _id: orderId,
        userId
    });

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
    console.log(order.paymentRequested,"this is payment requested");

    await order.save();

    // ─────────────────────────────────────────────
    // SEND EMAIL TO ADMIN
    // ─────────────────────────────────────────────
    await sendEmail({
        to: process.env.ADMIN_EMAIL,

        subject: "Payment Approval Request",

        html: `
            <h2>Payment Submitted By User</h2>

            <p>
                User has marked payment as completed
                and is waiting for admin approval.
            </p>

            <p>
                <strong>Order ID:</strong>
                ${order._id}
            </p>

            <p>
                <strong>Total Amount:</strong>
                $${order.totalAmount}
            </p>

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
      viewAllOrders
};