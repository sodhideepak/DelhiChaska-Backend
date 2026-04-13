import mongoose from "mongoose";

const zipCodeSchema = new mongoose.Schema({
    country: {
        type: String,
        required: true,
        trim: true,
        uppercase: true // e.g. US, IN
    },
    city: {
        type: String,
        required: true,
        trim: true
    },
    state: {
        type: String,
        required: true,
        trim: true
    },
    zip_prefix: {
        type: String,
        required: true
        // match: /^[0-9]{3}$/
    }
}, { timestamps: true });

// ✅ unique combination (important)
zipCodeSchema.index({ country: 1, zip_prefix: 1 }, { unique: true });

export const ZipCode = mongoose.model("ZipCode", zipCodeSchema);