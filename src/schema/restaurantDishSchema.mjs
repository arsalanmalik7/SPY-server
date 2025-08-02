import mongoose from 'mongoose';
import { v4 as uuidv4 } from 'uuid';

const RestaurantDishSchema = new mongoose.Schema(
  {
    uuid: { 
      type: String, 
      default: uuidv4, 
      required: true, 
      unique: true, 
      index: true 
    },
    restaurant_id: { 
      type: String, 
      ref: 'Restaurant', 
      required: true, 
      index: true 
    },
    dish_id: { 
      type: String, 
      ref: 'Dish', 
      required: true, 
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
    removed_at: { 
      type: Date 
    },
    notes: { 
      type: String, 
      maxlength: 500, 
      trim: true 
    },
    customized_from_franchise: { 
      type: Boolean, 
      default: false 
    }
  },
  { timestamps: true }
);

// Create a compound index to ensure uniqueness of restaurant-dish combinations
RestaurantDishSchema.index({ restaurant_id: 1, dish_id: 1 }, { unique: true });

const RestaurantDish = mongoose.model('RestaurantDish', RestaurantDishSchema);
export { RestaurantDish }; 