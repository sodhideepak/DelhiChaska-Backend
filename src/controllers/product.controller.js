import { asynchandler } from "../utils/asynchandler.js";
import { ApiError } from "../utils/ApiError.js";
import { Product } from "../models/product.model.js";
import { Combo } from "../models/combo.model.js";
import { Area } from "../models/areas.model.js";
import { uploadoncloudinary, deleteFromCloudinary } from "../utils/cloudinary.js";
import { ApiResponse } from "../utils/ApiResponse.js";
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

// Create a new product
// const createProduct = asynchandler(async (req, res) => {
//     ensureSuperAdmin(req);

//     const { name, description, price, category, product_type, isAvailable } = req.body;

//     if ([name, description, price, category, product_type].some((field) => !field || field.toString().trim() === "")) {
//         throw new ApiError(400, "name, description, price, category and product_type are required");
//     }

//     const imagelocalpath = req.file?.path;

//     if (!imagelocalpath) { 
//         throw new ApiError(400, "product image is required");
//     }

//     // Check if product with same name already exists
//     const existingProduct = await Product.findOne({ name: name.trim() });

//     if (existingProduct) {
//         throw new ApiError(409, "product with this name already exists");
//     }

//     // Upload image to cloudinary
//     const image = await uploadoncloudinary(imagelocalpath);

//     if (!image.url) {
//         throw new ApiError(400, "error while uploading product image");
//     }

//     // Ensure image URL uses HTTPS
//     image.url = image.url.replace(/^http:/, 'https:');

//     // Create product
//     const product = await Product.create({
//         name: name.trim(),
//         description: description.trim(),
//         price: parseFloat(price),
//         category: category.trim(),
//         product_type: product_type.trim(),
//         image: image.url,
//         isAvailable: isAvailable !== undefined ? isAvailable : true
//     });

//     const createdProduct = await Product.findById(product._id).lean();

//     if (!createdProduct) {
//         throw new ApiError(500, "something went wrong while creating the product");
//     }

//     return res.status(201).json(
//         new ApiResponse(201, createdProduct, "product created successfully")
//     );
// });






const createProduct = asynchandler(async (req, res) => {
    ensureSuperAdmin(req);

    let {
        name,
        description,
        category,
        product_type,
        food_class, // 🔥 NEW FIELD
        variants,
        isAvailable
    } = req.body;

    if (
        [name, description, category, product_type, food_class].some(
            (field) => !field || field.toString().trim() === ""
        )
    ) {
        throw new ApiError(
            400,
            "name, description, category, product_type and food_class are required"
        );
    }

    const imagelocalpath = req.file?.path;

    // if (!imagelocalpath) {
    //     throw new ApiError(400, "product image is required");
    // }

    const existingProduct = await Product.findOne({
        name: name.trim()
    });

    if (existingProduct) {
        throw new ApiError(409, "product with this name already exists");
    }

    const PRODUCT_TYPE_CONFIG = {
        paneer: ["16oz", "32oz"],
        veg_curry: ["16oz", "32oz"],
        chicken: ["16oz", "32oz"],
        mutton: ["16oz", "32oz"],
        veg_dry: ["16oz", "32oz"],
        rice: ["half", "full"],
        chinese: ["half", "full"],
        breads: []
    };

    const allowedSizes = PRODUCT_TYPE_CONFIG[product_type.toLowerCase()];

    if (!allowedSizes) {
        throw new ApiError(400, "invalid product_type");
    }


    // const ALLOWED_FOOD_CLASS = ["veg_curry", "paneer", "chicken", "mutton", "veg_other"];
    const ALLOWED_FOOD_CLASS = ["veg_curry", "paneer", "chicken", "mutton", "veg_other", "veg_dry", "rice", "chinese", "breads"];

    if (!ALLOWED_FOOD_CLASS.includes(food_class.toLowerCase())) {
        throw new ApiError(
            400,
            `invalid food_class. Allowed: ${ALLOWED_FOOD_CLASS.join(", ")}`
        );
    }

    if (!variants || !Array.isArray(variants) || variants.length === 0) {
        throw new ApiError(400, "variants are required");
    }

    let formattedVariants;

    if (allowedSizes.length === 0) {
        // No size (like roti)
        if (variants.length !== 1) {
            throw new ApiError(400, "only one price allowed for this product");
        }

        formattedVariants = [
            {
                size: "default",
                price: parseFloat(variants[0].price)
            }
        ];
    } else {
        formattedVariants = variants.map((v, index) => {
            if (!v.size || !allowedSizes.includes(v.size.toLowerCase())) {
                throw new ApiError(
                    400,
                    `invalid size at index ${index + 1}. Allowed: ${allowedSizes.join(", ")}`
                );
            }

            if (!v.price || v.price <= 0) {
                throw new ApiError(400, `invalid price at index ${index + 1}`);
            }

            return {
                size: v.size.toLowerCase(),
                price: parseFloat(v.price)
            };
        });
    }

    // ==========================
    // ☁️ UPLOAD IMAGE
    // ==========================
    const image = await uploadoncloudinary(imagelocalpath);

    // if (!image.url) {
    //     throw new ApiError(400, "error while uploading product image");
    // }

    // image.url = image.url.replace(/^http:/, "https:");

    // ==========================
    // 🧠 CREATE PRODUCT
    // ==========================
    const product = await Product.create({
        name: name.trim(),
        description: description.trim(),
        category: category.trim().toLowerCase(),
        product_type: product_type.trim().toLowerCase(),
        food_class: food_class.trim().toLowerCase(),
        image: " ",
        variants: formattedVariants,
        isAvailable: isAvailable !== undefined ? isAvailable : true
    });

    const createdProduct = await Product.findById(product._id).lean();

    return res.status(201).json(
        new ApiResponse(201, createdProduct, "product created successfully")
    );
});






// Get all products
const getAllProducts = asynchandler(async (req, res) => {
    const { page = 1, limit = 60, category, isAvailable } = req.query;

    let filter = {};

    // 🔍 Filters
    if (category) {
        filter.category = { $regex: category, $options: "i" };
    }

    if (isAvailable !== undefined) {
        filter.isAvailable = isAvailable === "true";
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    // 📦 Fetch products
    const products = await Product.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .lean();

    // 🔢 Count
    const totalProducts = await Product.countDocuments(filter);
    const totalPages = Math.ceil(totalProducts / limit);

    // 🧠 Group by category
    const groupedProducts = {};

    products.forEach((product) => {
        const cat = product.category || "Uncategorized";

        if (!groupedProducts[cat]) {
            groupedProducts[cat] = [];
        }

        groupedProducts[cat].push(product);
    });

    // 🔁 Convert object → array format
    const list = Object.keys(groupedProducts).map((cat) => ({
        category: cat,
        products: groupedProducts[cat],
    }));

    // 📤 Final Response
    const response = {
        list, // <-- grouped structure
        pagination: {
            currentPage: parseInt(page),
            totalPages,
            totalProducts,
            hasNextPage: page < totalPages,
            hasPrevPage: page > 1,
        },
    };

    return res.status(200).json(
        new ApiResponse(200, response, "Products grouped by category")
    );
});








// Get single product by ID
const getProductById = asynchandler(async (req, res) => {
    const { productId } = req.params;

    if (!productId) {
        throw new ApiError(400, "product ID is required");
    }

    const product = await Product.findById(productId).lean();

    if (!product) {
        throw new ApiError(404, "product not found");
    }

    return res.status(200).json(
        new ApiResponse(200, product, "product fetched successfully")
    );
});










// Update product
const updateProduct = asynchandler(async (req, res) => {
    ensureSuperAdmin(req);

    const { productId } = req.params;
    const { name, description, price, category, product_type, isAvailable } = req.body;

    if (!productId) {
        throw new ApiError(400, "product ID is required");
    }

    const product = await Product.findById(productId);

    if (!product) {
        throw new ApiError(404, "product not found");
    }

    // Check if another product with the same name exists (excluding current product)
    if (name && name.trim() !== product.name) {
        const existingProduct = await Product.findOne({
            name: name.trim(),
            _id: { $ne: productId }
        });

        if (existingProduct) {
            throw new ApiError(409, "product with this name already exists");
        }
    }

    // Handle image update if new image is provided
    let imageUrl = product.image;
    const imagelocalpath = req.file?.path;

    if (imagelocalpath) {
        // Delete old image from cloudinary
        if (product.image) {
            await deleteFromCloudinary(product.image);
        }

        // Upload new image
        const image = await uploadoncloudinary(imagelocalpath);

        if (!image.url) {
            throw new ApiError(400, "error while uploading new product image");
        }

        imageUrl = image.url.replace(/^http:/, 'https:');
    }

    // Update fields
    const updateData = {
        ...(name && { name: name.trim() }),
        ...(description && { description: description.trim() }),
        ...(price && { price: parseFloat(price) }),
        ...(category && { category: category.trim() }),
        ...(product_type && { product_type: product_type.trim() }),
        ...(isAvailable !== undefined && { isAvailable }),
        ...(imageUrl !== product.image && { image: imageUrl })
    };

    const updatedProduct = await Product.findByIdAndUpdate(
        productId,
        { $set: updateData },
        { new: true }
    ).lean();

    return res.status(200).json(
        new ApiResponse(200, updatedProduct, "product updated successfully")
    );
});










// Delete product
const deleteProduct = asynchandler(async (req, res) => {
    ensureSuperAdmin(req);

    const { productId } = req.params;

    if (!productId) {
        throw new ApiError(400, "product ID is required");
    }

    const product = await Product.findById(productId);

    if (!product) {
        throw new ApiError(404, "product not found");
    }

    // Delete image from cloudinary
    if (product.image) {
        await deleteFromCloudinary(product.image);
    }

    await Product.findByIdAndDelete(productId);

    return res.status(200).json(
        new ApiResponse(200, {}, "product deleted successfully")
    );
});











// Toggle product availability
const toggleProductAvailability = asynchandler(async (req, res) => {
    ensureSuperAdmin(req);

    const { productId } = req.params;

    if (!productId) {
        throw new ApiError(400, "product ID is required");
    }

    const product = await Product.findById(productId);

    if (!product) {
        throw new ApiError(404, "product not found");
    }

    const updatedProduct = await Product.findByIdAndUpdate(
        productId,
        { $set: { isAvailable: !product.isAvailable } },
        { new: true }
    ).lean();

    return res.status(200).json(
        new ApiResponse(200, updatedProduct, `product ${updatedProduct.isAvailable ? 'enabled' : 'disabled'} successfully`)
    );
});









// Get products by category
const getProductsByCategory = asynchandler(async (req, res) => {
    const { category } = req.params;
    const { page = 1, limit = 10, isAvailable } = req.query;

    if (!category) {
        throw new ApiError(400, "category is required");
    }

    let filter = {
        category: { $regex: category, $options: "i" }
    };

    if (isAvailable !== undefined) {
        filter.isAvailable = isAvailable === "true";
    }

    const options = {
        page: parseInt(page),
        limit: parseInt(limit),
        sort: { createdAt: -1 },
        lean: true
    };

    const products = await Product.find(filter)
        .sort(options.sort)
        .limit(options.limit * 1)
        .skip((options.page - 1) * options.limit)
        .lean();

    const totalProducts = await Product.countDocuments(filter);
    const totalPages = Math.ceil(totalProducts / options.limit);

    const response = {
        products,
        category,
        pagination: {
            currentPage: options.page,
            totalPages,
            totalProducts,
            hasNextPage: options.page < totalPages,
            hasPrevPage: options.page > 1
        }
    };

    return res.status(200).json(
        new ApiResponse(200, response, `products in category '${category}' fetched successfully`)
    );
});








// Get all unique categories
const getProductCategories = asynchandler(async (req, res) => {
    const categories = await Product.distinct("category");

    return res.status(200).json(
        new ApiResponse(200, { categories }, "product categories fetched successfully")
    );
});











// const createCombo = asynchandler(async (req, res) => {
//     ensureSuperAdmin(req);

//     let {
//         name,
//         description,
//         price,
//         size,
//         rules,
//         options,
//         isAvailable,
//         image
//     } = req.body;

//     // ==========================
//     // 🔐 BASIC VALIDATION
//     // ==========================
//     if (
//         [name, description, price].some(
//             (field) => !field || field.toString().trim() === ""
//         )
//     ) {
//         throw new ApiError(400, "name, description and price are required");
//     }

//     if (!rules || !Array.isArray(rules) || rules.length === 0) {
//         throw new ApiError(400, "rules must be a non-empty array");
//     }

//     // ==========================
//     // 🔐 RULE VALIDATION
//     // ==========================
//     rules = rules.map((rule, index) => {
//         if (!rule.category || !Array.isArray(rule.category)) {
//             throw new ApiError(400, `rule ${index + 1}: category must be array`);
//         }

//         if (!rule.quantity || rule.quantity < 1) {
//             throw new ApiError(400, `rule ${index + 1}: invalid quantity`);
//         }

//         return {
//             category: rule.category.map((c) => c.trim()),
//             quantity: Number(rule.quantity),
//             isSelectionRequired:
//                 rule.isSelectionRequired !== undefined
//                     ? rule.isSelectionRequired
//                     : true,
//             label: rule.label?.trim() || ""
//         };
//     });

//     // ==========================
//     // 🖼️ IMAGE DEFAULT
//     // ==========================
//     image = image?.trim() || "";

//     // ==========================
//     // 🔁 CHECK DUPLICATE
//     // ==========================
//     const existingCombo = await Combo.findOne({
//         name: name.trim()
//     });

//     if (existingCombo) {
//         throw new ApiError(409, "combo with this name already exists");
//     }

//     // ==========================
//     // 🧠 CREATE COMBO
//     // ==========================
//     const combo = await Combo.create({
//         name: name.trim(),
//         description: description.trim(),
//         price: parseFloat(price),
//         size: size?.trim(),
//         image,
//         rules,
//         options,
//         isAvailable: isAvailable !== undefined ? isAvailable : true
//     });

//     const createdCombo = await Combo.findById(combo._id).lean();

//     if (!createdCombo) {
//         throw new ApiError(500, "something went wrong while creating combo");
//     }

//     return res.status(201).json(
//         new ApiResponse(201, createdCombo, "combo created successfully")
//     );
// });


// const createCombo = asynchandler(async (req, res) => {
//     ensureSuperAdmin(req);

//     let {
//         name,
//         description,
//         price,
//         items,
//         isAvailable,
//         image
//     } = req.body;

//     // ==========================
//     // 🔐 BASIC VALIDATION
//     // ==========================
//     if (
//         [name, description, price].some(
//             (field) => !field || field.toString().trim() === ""
//         )
//     ) {
//         throw new ApiError(400, "name, description and price are required");
//     }

//     if (!items || !Array.isArray(items) || items.length === 0) {
//         throw new ApiError(400, "items must be a non-empty array");
//     }

//     // ==========================
//     // 🔐 ITEMS VALIDATION
//     // ==========================
//     items = items.map((item, index) => {
//         if (!item.product_id) {
//             throw new ApiError(400, `item ${index + 1}: product_id required`);
//         }

//         if (!item.size) {
//             throw new ApiError(400, `item ${index + 1}: size is required`);
//         }

//         return {
//             product: item.product_id,
//             quantity:
//                 item.quantity && item.quantity > 0
//                     ? Number(item.quantity)
//                     : 1,
//             size: item.size.trim().toLowerCase() // normalize
//         };
//     });

//     // ==========================
//     // 🔁 CHECK DUPLICATE NAME
//     // ==========================
//     const existingCombo = await Combo.findOne({
//         name: name.trim()
//     });

//     if (existingCombo) {
//         throw new ApiError(409, "combo with this name already exists");
//     }

//     // ==========================
//     // 🧠 CREATE COMBO
//     // ==========================
//     const combo = await Combo.create({
//         name: name.trim(),
//         description: description.trim(),
//         price: parseFloat(price),
//         image: image?.trim() || "",
//         items,
//         isAvailable: isAvailable !== undefined ? isAvailable : true
//     });

//     const createdCombo = await Combo.findById(combo._id)
//         .populate("items.product")
//         .lean();

//     return res.status(201).json(
//         new ApiResponse(201, createdCombo, "combo created successfully")
//     );
// });




const createCombo = asynchandler(async (req, res) => {
  const { name, description, price, size, rules } = req.body;

  if (!name || !price || !rules) {
    throw new ApiError(400, "Required fields missing");
  }

  const combo = await Combo.create({
    name,
    description,
    price,
    size,
    rules
  });

  res.status(201).json({
    success: true,
    combo
  });
});

const getCombos = asynchandler(async (req, res) => {
  const { isActive } = req.query;

  let filter = {};

  // 🔥 Availability logic (same as products)
  if (isActive === "true") {
    filter.isActive = true;
  } else if (isActive === "false") {
    filter.isActive = false;
  } else if (isActive === "all") {
    // no filter → fetch all
  } else {
    // ✅ default behavior
    filter.isActive = true;
  }

  const combos = await Combo.find(filter)
    .select("-__v")
    .sort({ createdAt: -1 });

  if (!combos || combos.length === 0) {
    return res.status(200).json({
      success: true,
      message: "No combos found",
      data: []
    });
  }

  res.status(200).json({
    success: true,
    count: combos.length,
    data: combos
  });
});



const getComboById = asynchandler(async (req, res) => {
  const { comboId } = req.params;

  // 🔒 Validate ObjectId first (VERY IMPORTANT)
  if (!mongoose.Types.ObjectId.isValid(comboId)) {
    throw new ApiError(400, "Invalid combo ID");
  }

  const combo = await Combo.findById(comboId).lean();

  if (!combo) {
    throw new ApiError(404, "Combo not found");
  }

  // 🔥 OPTIONAL: attach products for selectable rules
  const enrichedRules = await Promise.all(
    combo.rules.map(async (rule) => {

      // skip fixed rules
      if (rule.isFixed) return rule;

      const products = await Product.find({
        category: { $in: rule.category },
        isAvailable: true
      }).select("name category food_class variants");

      return {
        ...rule,
        products
      };
    })
  );

  const finalCombo = {
    ...combo,
    rules: enrichedRules
  };

  return res.status(200).json(
    new ApiResponse(200, finalCombo, "Combo fetched successfully")
  );
});





const toggleComboAvailability = asynchandler(async (req, res) => {
  const { comboId } = req.params;

  // 🔒 Validate ID
  if (!mongoose.Types.ObjectId.isValid(comboId)) {
    throw new ApiError(400, "Invalid combo ID");
  }

  const combo = await Combo.findById(comboId);

  if (!combo) {
    throw new ApiError(404, "Combo not found");
  }

  // ✅ Soft delete
  combo.isActive = false;
  await combo.save();

  return res.status(200).json(
    new ApiResponse(200, null, "Combo deleted (soft delete)")
  );
});





const deleteCombo = asynchandler(async (req, res) => {
  const { comboId } = req.params;

  // 🔒 Validate ID
  if (!mongoose.Types.ObjectId.isValid(comboId)) {
    throw new ApiError(400, "Invalid combo ID");
  }

  // 🔥 Direct delete from DB
  const deletedCombo = await Combo.findByIdAndDelete(comboId);

  if (!deletedCombo) {
    throw new ApiError(404, "Combo not found");
  }

  return res.status(200).json(
    new ApiResponse(200, deletedCombo, "Combo permanently deleted")
  );
});





const updateCombo = asynchandler(async (req, res) => {
  const { comboId } = req.params;
  const { name, description, price, size, rules, image, isAvailable } =
    req.body;

  // 🔒 Validate ID
  if (!mongoose.Types.ObjectId.isValid(comboId)) {
    throw new ApiError(400, "Invalid combo ID");
  }

  const combo = await Combo.findById(comboId);

  if (!combo) {
    throw new ApiError(404, "Combo not found");
  }

  // 🔐 Update fields if provided
  if (name) combo.name = name.trim();
  if (description) combo.description = description.trim();
  if (price) combo.price = parseFloat(price);
  if (size) combo.size = size.trim();
  if (image) combo.image = image.trim();
  if (isAvailable !== undefined) combo.isAvailable = isAvailable;

  // 🔐 Update rules if provided
  if (rules && Array.isArray(rules)) {
    combo.rules = rules.map((rule) => ({
      category: rule.category || [],
      quantity: rule.quantity || 1,
      isSelectionRequired: rule.isSelectionRequired ?? true,
      label: rule.label || ""
    }));
  }

  await combo.save();

  // 🔄 Populate for response
  const updatedCombo = await Combo.findById(comboId).lean();

  return res.status(200).json(
    new ApiResponse(200, updatedCombo, "Combo updated successfully")
  );
});




const updateComboStatus = asynchandler(async (req, res) => {
  const { comboId } = req.params;
  const { isActive } = req.body;

  // 🔒 Validate ID
  if (!mongoose.Types.ObjectId.isValid(comboId)) {
    throw new ApiError(400, "Invalid combo ID");
  }

  // 🔒 Validate input
  if (typeof isActive !== "boolean") {
    throw new ApiError(400, "isActive must be true or false");
  }

  const combo = await Combo.findById(comboId);

  if (!combo) {
    throw new ApiError(404, "Combo not found");
  }

  // 🔄 Update status
  combo.isActive = isActive;
  await combo.save();

  return res.status(200).json(
    new ApiResponse(
      200,
      {
        comboId: combo._id,
        isActive: combo.isActive
      },
      `Combo ${isActive ? "activated" : "deactivated"} successfully`
    )
  );
});












const updateProductImage = asynchandler(async (req, res) => {
    ensureSuperAdmin(req);

    const { productId } = req.params;

    if (!productId) {
        throw new ApiError(400, "productId is required");
    }

    // ==========================
    // 🔍 FIND PRODUCT
    // ==========================
    const product = await Product.findById(productId);

    if (!product) {
        throw new ApiError(404, "Product not found");
    }

    // ==========================
    // 📂 GET NEW IMAGE
    // ==========================
    const imagelocalpath = req.file?.path;

    if (!imagelocalpath) {
        throw new ApiError(400, "Product image file is required");
    }

    // ==========================
    // ☁️ UPLOAD NEW IMAGE
    // ==========================
    const uploadedImage = await uploadoncloudinary(imagelocalpath);

    if (!uploadedImage?.url) {
        throw new ApiError(500, "Error uploading image");
    }

    let newImageUrl = uploadedImage.url.replace(/^http:/, "https:");

    // ==========================
    // 🗑️ DELETE OLD IMAGE (OPTIONAL BUT BEST PRACTICE)
    // ==========================
    try {
        if (product.image && product.image !== " ") {
            // extract public_id from URL
            const publicId = product.image.split("/").pop().split(".")[0];

            await deletefromcloudinary(publicId); // 🔥 you must have this helper
        }
    } catch (err) {
        console.log("Old image deletion failed:", err.message);
    }

    // ==========================
    // 🔄 UPDATE PRODUCT
    // ==========================
    product.image = newImageUrl;

    await product.save();

    return res.status(200).json(
        new ApiResponse(200, product, "Product image updated successfully")
    );
});





const createArea = asynchandler(async (req, res) => {

    const { name, code, cities } = req.body;

    // ❌ validation
    if (!name || !code) {
        throw new ApiError(400, "Name and code are required");
    }

    // 🔍 check duplicate code
    const existing = await Area.findOne({ code: code.toLowerCase() });

    if (existing) {
        throw new ApiError(400, "Area with this code already exists");
    }

    // ✅ create
    const area = await Area.create({
        name,
        code: code.toLowerCase(),
        cities: cities || []
    });

    return res.status(201).json(
        new ApiResponse(201, area, "Area created successfully")
    );
});


// ✅ GET ALL AREAS
const getAllAreas = asynchandler(async (req, res) => {

    const areas = await Area.find({ isActive: true }).sort({ createdAt: -1 });

    return res.status(200).json(
        new ApiResponse(200, areas, "Areas fetched successfully")
    );
});


// ✅ GET AREA BY ID
const getAreaById = asynchandler(async (req, res) => {

    const { areaId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(areaId)) {
        throw new ApiError(400, "Invalid area ID");
    }

    const area = await Area.findById(areaId);

    if (!area) {
        throw new ApiError(404, "Area not found");
    }

    return res.status(200).json(
        new ApiResponse(200, area, "Area fetched successfully")
    );
});


// ✅ UPDATE AREA
const updateArea = asynchandler(async (req, res) => {

    const { areaId } = req.params;
    const { name, code, cities, isActive } = req.body;

    if (!mongoose.Types.ObjectId.isValid(areaId)) {
        throw new ApiError(400, "Invalid area ID");
    }

    const area = await Area.findById(areaId);

    if (!area) {
        throw new ApiError(404, "Area not found");
    }

    // 🔍 check duplicate code
    if (code && code.toLowerCase() !== area.code) {
        const exists = await Area.findOne({ code: code.toLowerCase() });

        if (exists) {
            throw new ApiError(400, "Area code already in use");
        }
    }

    // ✅ update fields
    if (name) area.name = name;
    if (code) area.code = code.toLowerCase();
    if (cities) area.cities = cities;
    if (typeof isActive === "boolean") area.isActive = isActive;

    await area.save();

    return res.status(200).json(
        new ApiResponse(200, area, "Area updated successfully")
    );
});


// ✅ DELETE AREA (SOFT DELETE)
const deleteArea = asynchandler(async (req, res) => {

    const { areaId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(areaId)) {
        throw new ApiError(400, "Invalid area ID");
    }

    const area = await Area.findById(areaId);

    if (!area) {
        throw new ApiError(404, "Area not found");
    }

    // ✅ soft delete
    area.isActive = false;
    await area.save();

    return res.status(200).json(
        new ApiResponse(200, {}, "Area deleted successfully")
    );
});








const updateAllProductImages = asynchandler(async (req, res) => {
    ensureSuperAdmin(req); // 🔒 protect this route

    const imageUrl = "https://res.cloudinary.com/ddvloqbxp/image/upload/v1777757830/y1xjxjzi1au1vsmqco6v.png";

    const result = await Product.updateMany(
        {}, // 🔥 empty filter = update all products
        {
            $set: {
                image: imageUrl, // 👈 change this key if your field name is different
            },
        }
    );

    return res.status(200).json(
        new ApiResponse(
            200,
            {
                matchedCount: result.matchedCount,
                modifiedCount: result.modifiedCount,
            },
            "All product images updated successfully"
        )
    );
});




// const adminGetProductsWithAreaStatus = asynchandler(async (req, res) => {
//     ensureSuperAdmin(req);

//     const { page = 1, limit = 10,  category, isAvailable } = req.query;
//     // console.log("area:", area);
//     const { area } = req.params;

// console.log("area:", area);

//     let filter = {};

//     if (category) {
//         filter.category = { $regex: category, $options: "i" };
//     }

//     if (isAvailable !== undefined) {
//         filter.isAvailable = isAvailable === "true";
//     }

//     const skip = (parseInt(page) - 1) * parseInt(limit);

//     const products = await Product.find(filter)
//         .sort({ createdAt: -1 })
//         .skip(skip)
//         .limit(parseInt(limit))
//         .lean();

//     const totalProducts = await Product.countDocuments(filter);
//     const totalPages = Math.ceil(totalProducts / limit);

//     const normalizedArea = area?.toLowerCase().trim();

//     const updatedProducts = products.map((product) => {
//         let isLiveInArea = true;

//        if (normalizedArea) {
//         if (!product.areas || product.areas.length === 0) {
//         isLiveInArea = false; // ❌ empty = not live anywhere
    
        
//         } else {
//         isLiveInArea = product.areas
//             .map(a => a.toLowerCase())
//             .includes(normalizedArea);
//         }
// }

//         return {
//             ...product,
//             isLiveInArea
//         };
//     });

//     return res.status(200).json(
//         new ApiResponse(
//             200,
//             {
//                 products: updatedProducts,
//                 pagination: {
//                     currentPage: parseInt(page),
//                     totalPages,
//                     totalProducts,
//                     hasNextPage: page < totalPages,
//                     hasPrevPage: page > 1
//                 }
//             },
//             "Products fetched with area live status"
//         )
//     );
// });


const adminGetProductsWithAreaStatus = asynchandler(async (req, res) => {
    ensureSuperAdmin(req);

    const { page = 1, limit = 10, category, isAvailable } = req.query;
    const { area } = req.params;

    const normalizedArea = area?.toLowerCase().trim();

    let filter = {};

    if (category) {
        filter.category = { $regex: category, $options: "i" };
    }

    if (isAvailable !== undefined) {
        filter.isAvailable = isAvailable === "true";
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const products = await Product.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .lean();

    const totalProducts = await Product.countDocuments(filter);
    const totalPages = Math.ceil(totalProducts / limit);

    // 🔥 Add isLiveInArea
    const updatedProducts = products.map((product) => {
        let isLiveInArea = true;

        if (normalizedArea) {
            if (!product.areas || product.areas.length === 0) {
                isLiveInArea = false; // ❌ not live anywhere
            } else {
                isLiveInArea = product.areas
                    .map(a => a.toLowerCase())
                    .includes(normalizedArea);
            }
        }

        return {
            ...product,
            isLiveInArea
        };
    });

    // 🔥 GROUP BY CATEGORY
    const groupedMap = {};

    updatedProducts.forEach((product) => {
        const cat = product.category || "uncategorized";

        if (!groupedMap[cat]) {
            groupedMap[cat] = [];
        }

        groupedMap[cat].push(product);
    });

    const groupedProducts = Object.keys(groupedMap).map((cat) => ({
        category: cat,
        items: groupedMap[cat]
    }));

    return res.status(200).json(
        new ApiResponse(
            200,
            {
                products: groupedProducts, // ✅ changed here
                pagination: {
                    currentPage: parseInt(page),
                    totalPages,
                    totalProducts,
                    hasNextPage: page < totalPages,
                    hasPrevPage: page > 1
                }
            },
            "Products fetched with area live status"
        )
    );
});


const makeProductLiveInArea = asynchandler(async (req, res) => {
    ensureSuperAdmin(req);

    const { productid } = req.params;
    let { area } = req.body;

    if (!area) {
        throw new ApiError(400, "Area is required");
    }

    area = area.toLowerCase().trim();

    const product = await Product.findByIdAndUpdate(
        productid,
        {
            $addToSet: { areas: area } // ✅ avoids duplicates
        },
        { new: true }
    );

    if (!product) {
        throw new ApiError(404, "Product not found");
    }

    return res.status(200).json(
        new ApiResponse(200, product, `Product live in ${area}`)
    );
});




const makeProductGlobal = asynchandler(async (req, res) => {
    ensureSuperAdmin(req);

    const { productid } = req.params;

    const product = await Product.findByIdAndUpdate(
        productid,
        {
            $set: { areas: [] } // 🌍 empty = available everywhere
        },
        { new: true }
    );

    if (!product) {
        throw new ApiError(404, "Product not found");
    }

    return res.status(200).json(
        new ApiResponse(200, product, "Product is now live everywhere")
    );
});





const removeProductFromArea = asynchandler(async (req, res) => {
    ensureSuperAdmin(req);

    const { productid } = req.params;
    let { area } = req.body;

    area = area.toLowerCase().trim();

    const product = await Product.findByIdAndUpdate(
        productid,
        {
            $pull: { areas: area }
        },
        { new: true }
    );

    return res.status(200).json(
        new ApiResponse(200, product, `Removed from ${area}`)
    );
});





export {
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
    updateComboStatus,
    updateProductImage,
    createArea,
    getAllAreas,
    getAreaById,
    updateArea,
    deleteArea,
    updateAllProductImages,
    adminGetProductsWithAreaStatus,
    makeProductLiveInArea,
    makeProductGlobal,
    removeProductFromArea
};