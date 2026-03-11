import mongoose from "mongoose";

const tempUserSchema = new mongoose.Schema(
{
    full_name: {
        type: String,
        required: true,
        trim: true
    },
    phone_number: {
        type: String,
        required: true,
        trim: true
    },

    email: {
        type: String,
        required: true,
        lowercase: true,       
        trim: true
    },

    gender: {
        type: String,
        required: true,
        trim: true
    },

    DOB: {
        type: Date,
        required: true
    },

    password: {
        type: String,
        required: true
    },

    otp: {
        type: String,
        required: true
    },

    otp_expires: {
        type: Date,
        required: true
    }

},
{ timestamps: true }
);

export const TempUser = mongoose.model("tempUser", tempUserSchema);