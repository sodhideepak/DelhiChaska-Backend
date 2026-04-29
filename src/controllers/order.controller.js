import { Cart } from "../models/cart.model.js";
import { Order } from "../models/order.model.js";
import { Product } from "../models/product.model.js";
import { Combo } from "../models/combo.model.js";
import { asynchandler } from "../utils/asynchandler.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { ApiError } from "../utils/ApiError.js";
import { Address } from "../models/address.model.js";



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

  // ─── 1. Validate & Fetch Selected Address ────────────────────────────────
  if (!addressId) {
    throw new ApiError(400, "Please select a delivery address");
  }

  const address = await Address.findOne({ _id: addressId, user: userId });

  if (!address) {
    throw new ApiError(404, "Address not found or does not belong to you");
  }

  // ─── 2. Fetch Cart ────────────────────────────────────────────────────────
  const cart = await Cart.findOne({ user: userId })
    .populate("items.productId", "name category variants isAvailable")
    .populate("items.comboId", "name price size isActive rules")
    .lean();

  if (!cart || !cart.items || cart.items.length === 0) {
    throw new ApiError(400, "Cart is empty");
  }

  // ─── 3. Build Order Items ─────────────────────────────────────────────────
  let totalAmount = 0;
  const orderItems = [];

  for (const item of cart.items) {

    // =====================
    // 🛒 PRODUCT
    // =====================
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

    // =====================
    // 🍽️ COMBO
    // =====================
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
    throw new ApiError(400, "No valid items found in cart to place order");
  }

  // ─── 4. Build Delivery Details from Saved Address ─────────────────────────
  const deliveryDetails = {
    addressId: address._id,
    addressLine1: address.addressLine1,
    addressLine2: address.addressLine2 || "",
    city: address.city,
    state: address.state,
    zipCode: address.zipCode,
    country: address.country,
    location: address.location || {},
    phone: req.user?.phone_number || ""
  };

  // ─── 5. Create Order ──────────────────────────────────────────────────────
  const order = await Order.create({
    userId,
    items: orderItems,
    totalAmount,
    status: "pending",
    deliveryDetails,
    payment: {
      method: payment?.method || "cod",
      status: "pending"
    }
  });

  // ─── 6. Clear Cart ────────────────────────────────────────────────────────
  await Cart.findOneAndUpdate(
    { user: userId },
    { $set: { items: [] } }
  );

  return res.status(201).json(
    new ApiResponse(201, { order }, "Order placed successfully")
  );
});





const viewMyOrders = asynchandler(async (req, res) => {
  const userId = req.user?._id;

  if (!userId) {
    throw new ApiError(401, "Unauthorized");
  }

  const orders = await Order.find({ userId })
    .sort({ createdAt: -1 })
    .lean();

  if (!orders || orders.length === 0) {
    return res.status(200).json(
      new ApiResponse(200, { orders: [] }, "No orders found")
    );
  }

  const formattedOrders = orders.map(order => ({
    orderId: order._id,
    status: order.status,
    totalAmount: order.totalAmount,
    payment: order.payment,
    deliveryDetails: order.deliveryDetails,
    itemCount: order.items.length,
    items: order.items.map(item => ({
      productId: item.productId,
      name: item.name,
      quantity: item.quantity,
      price: item.price,
      type: item.type,
      total: item.price * item.quantity
    })),
    placedAt: order.createdAt
  }));

  return res.status(200).json(
    new ApiResponse(200, { orders: formattedOrders }, "Orders fetched successfully")
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
     viewMyOrders
};