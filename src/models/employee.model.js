import bcrypt from "bcrypt";
import mongoose from "mongoose";
import Jwt from "jsonwebtoken";

const employeeSchema = new mongoose.Schema(
  {
    name: {
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

    phone: {
      type: String,
      required: true,
      unique: true
    },

    password: {
      type: String,
      required: true
    },

    role: {
      type: String,
      enum: ["admin", "chef", "driver", "support"],
      required: true
    },

    status: {
      type: String,
      enum: ["not_verified", "verified", "rejected"],
      default: "not_verified"
    },

    profile_image: {
      type: String
    }

    
  },
  {
    timestamps: true
  }
);


// Compare password
employeeSchema.methods.isPasswordcorrect = async function (password) {
    return await bcrypt.compare(password, this.password);
};


// Generate Access Token
employeeSchema.methods.generateAccessToken = function () {
    return Jwt.sign(
        {
            _id: this._id,
            email: this.email,
            phone: this.phone
        },
        process.env.Access_Token_Secret,
        {
            expiresIn: process.env.Access_Token_Expiry
        }
    );
};


// Generate Refresh Token
employeeSchema.methods.generateRefreshToken = function () {
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






export const Employee = mongoose.model("employee", employeeSchema);
