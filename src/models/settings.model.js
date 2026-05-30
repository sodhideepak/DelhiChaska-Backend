import mongoose from "mongoose";

const settingSchema = new mongoose.Schema(
  {
    isAcceptingOrders: {
      type: Boolean,
      default: true
    }
  },
  {
    timestamps: true
  }
);

export default mongoose.model("Setting", settingSchema);