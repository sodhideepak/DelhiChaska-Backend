import bcrypt from "bcrypt";
import mongoose from "mongoose";
import Jwt from "jsonwebtoken";


// User Schema
const userschema = new mongoose.Schema({
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
        unique: true,
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
        required: [true, "password is required"]
    },
    is_email_verified:{
        type: Boolean,
        required: true,
       
    },

    refreshToken: {
        type: String
    },

    avatar: {
        type: String
    },

    addresses: [
        {
            type: mongoose.Schema.Types.ObjectId,
            ref: "address"
        }
    ],

    token: {
        type: String,
        default: ""
    }

}, { timestamps: true });


// Hash password
// userschema.pre("save", async function (next) {
//     if (!this.isModified("password")) return next();

//     this.password = await bcrypt.hash(this.password, 10);
//     next();
// });


// Compare password
userschema.methods.isPasswordcorrect = async function (password) {
    return await bcrypt.compare(password, this.password);
};


// Generate Access Token
userschema.methods.generateAccessToken = function () {
    return Jwt.sign(
        {
            _id: this._id,
            email: this.email,
            phone_number: this.phone_number
        },
        process.env.Access_Token_Secret,
        {
            expiresIn: process.env.Access_Token_Expiry
        }
    );
};


// Generate Refresh Token
userschema.methods.generateRefreshToken = function () {
    return Jwt.sign(
        {
            _id: this._id
        },
        process.env.Refresh_Token_Secret,
        {
            expiresIn: process.env.Refresh_Token_Expiry
        }
    );
};


export const user = mongoose.model("user", userschema);
