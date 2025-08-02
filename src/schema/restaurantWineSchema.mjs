import mongoose from "mongoose";
import { v4 as uuidv4 } from "uuid";

const RestaurantWineSchema = new mongoose.Schema(
  {
    uuid: {
      type: String,
      default: uuidv4,
      required: true,
      unique: true,
      index: true,
      validate: {
        validator: (v) =>
          /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(
            v
          ),
        message: (props) => `${props.value} is not a valid UUID`,
      },
    },
    restaurant_id: { 
      type: String, 
      required: true, 
      ref: "Restaurant",
      index: true 
    },
    wine_id: { 
      type: String, 
      required: true, 
      ref: "GlobalWine",
      index: true 
    },
    price: { 
      type: Number, 
      required: true, 
      min: 0 
    },
    is_active: { 
      type: Boolean, 
      default: true 
    },
    notes: { 
      type: String, 
      maxlength: 500, 
      trim: true 
    }
  },
  { timestamps: true }
);

// Ensure uniqueness based on restaurant_id + wine_id
RestaurantWineSchema.index({ restaurant_id: 1, wine_id: 1 }, { unique: true });

const RestaurantWine = mongoose.model("RestaurantWine", RestaurantWineSchema);
export { RestaurantWine }; 