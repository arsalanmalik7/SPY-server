import mongoose from "mongoose";
import { v4 as uuidv4 } from "uuid";

const LogSchema = new mongoose.Schema(
  {
    uuid: { type: String, required: true, unique: true, index: true, default: uuidv4 },
    user_uuid: { type: String, ref: "User" },
    action: { type: String, required: true }, // e.g., "login", "menu_update"
    details: { type: Object, default: {} }, // Additional details for context
    timestamp: { type: Date, default: Date.now },
    role: {
      type: String,
      enum: ["super_admin", "director", "manager", "employee", "unknown"],
      required: true,
    },
    restaurant_uuid: { type: String, ref: "Restaurant" }, // Tracks restaurant actions
  },
  { timestamps: true }
);

const Log = mongoose.model("Log", LogSchema);
export { Log };
