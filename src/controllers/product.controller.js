import { asynchandler } from "../utils/asynchandler.js";
import { ApiError } from "../utils/ApiError.js";
import { Product } from "../models/product.model.js";
import { Combo } from "../models/combo.model.js";
import { uploadoncloudinary, deleteFromCloudinary } from "../utils/cloudinary.js";
import { ApiResponse } from "../utils/ApiResponse.js";

const SUPER_ADMIN_EMAIL = process.env.SUPER_ADMIN_EMAIL || "deepaksodhi0023@gmail.com";
const HARD_CODED_SUPER_ADMIN_ROLE = "super_admin";

const ensureSuperAdmin = (req) => {
    const isSuperAdmin = req.user?.email?.toLowerCase() === SUPER_ADMIN_EMAIL.toLowerCase();

    if (!isSuperAdmin) {
        throw new ApiError(403, "only super admin can perform this action");
    }

    return {
        role: HARD_CODED_SUPER_ADMIN_ROLE,
        email: req.user.email
    };
};

// Create a new product
const createProduct = asynchandler(async (req, res) => {
    ensureSuperAdmin(req);

    const { name, description, price, category, isAvailable } = req.body;

    if ([name, description, price, category].some((field) => !field || field.toString().trim() === "")) {
        throw new ApiError(400, "name, description, price and category are required");
    }

    const imagelocalpath = req.file?.path;

    if (!imagelocalpath) {
        throw new ApiError(400, "product image is required");
    }

    // Check if product with same name already exists
    const existingProduct = await Product.findOne({ name: name.trim() });

    if (existingProduct) {
        throw new ApiError(409, "product with this name already exists");
    }

    // Upload image to cloudinary
    const image = await uploadoncloudinary(imagelocalpath);

    if (!image.url) {
        throw new ApiError(400, "error while uploading product image");
    }

    // Ensure image URL uses HTTPS
    image.url = image.url.replace(/^http:/, 'https:');

    // Create product
    const product = await Product.create({
        name: name.trim(),
        description: description.trim(),
        price: parseFloat(price),
        category: category.trim(),
        image: image.url,
        isAvailable: isAvailable !== undefined ? isAvailable : true
    });

    const createdProduct = await Product.findById(product._id).lean();

    if (!createdProduct) {
        throw new ApiError(500, "something went wrong while creating the product");
    }

    return res.status(201).json(
        new ApiResponse(201, createdProduct, "product created successfully")
    );
});

// Get all products
const getAllProducts = asynchandler(async (req, res) => {
    const { page = 1, limit = 10, category, isAvailable } = req.query;

    let filter = {};

    if (category) {
        filter.category = { $regex: category, $options: "i" };
    }

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
        pagination: {
            currentPage: options.page,
            totalPages,
            totalProducts,
            hasNextPage: options.page < totalPages,
            hasPrevPage: options.page > 1
        }
    };

    return res.status(200).json(
        new ApiResponse(200, response, "products fetched successfully")
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
    const { name, description, price, category, isAvailable } = req.body;

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











const createCombo = asynchandler(async (req, res) => {
    ensureSuperAdmin(req);

    let {
        name,
        description,
        price,
        size,
        rules,
        options,
        isAvailable,
        image
    } = req.body;

    // ==========================
    // 🔐 BASIC VALIDATION
    // ==========================
    if (
        [name, description, price].some(
            (field) => !field || field.toString().trim() === ""
        )
    ) {
        throw new ApiError(400, "name, description and price are required");
    }

    if (!rules || !Array.isArray(rules) || rules.length === 0) {
        throw new ApiError(400, "rules must be a non-empty array");
    }

    // ==========================
    // 🔐 RULE VALIDATION
    // ==========================
    rules = rules.map((rule, index) => {
        if (!rule.category || !Array.isArray(rule.category)) {
            throw new ApiError(400, `rule ${index + 1}: category must be array`);
        }

        if (!rule.quantity || rule.quantity < 1) {
            throw new ApiError(400, `rule ${index + 1}: invalid quantity`);
        }

        return {
            category: rule.category.map((c) => c.trim()),
            quantity: Number(rule.quantity),
            isSelectionRequired:
                rule.isSelectionRequired !== undefined
                    ? rule.isSelectionRequired
                    : true,
            label: rule.label?.trim() || ""
        };
    });

    // ==========================
    // 🖼️ IMAGE DEFAULT
    // ==========================
    image = image?.trim() || "";

    // ==========================
    // 🔁 CHECK DUPLICATE
    // ==========================
    const existingCombo = await Combo.findOne({
        name: name.trim()
    });

    if (existingCombo) {
        throw new ApiError(409, "combo with this name already exists");
    }

    // ==========================
    // 🧠 CREATE COMBO
    // ==========================
    const combo = await Combo.create({
        name: name.trim(),
        description: description.trim(),
        price: parseFloat(price),
        size: size?.trim(),
        image,
        rules,
        options,
        isAvailable: isAvailable !== undefined ? isAvailable : true
    });

    const createdCombo = await Combo.findById(combo._id).lean();

    if (!createdCombo) {
        throw new ApiError(500, "something went wrong while creating combo");
    }

    return res.status(201).json(
        new ApiResponse(201, createdCombo, "combo created successfully")
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
    createCombo
};