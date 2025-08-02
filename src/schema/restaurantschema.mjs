import mongoose from 'mongoose';
import { v4 as uuidv4 } from 'uuid';

const RestaurantSchema = new mongoose.Schema(
  {
    uuid: { type: String, default: uuidv4, unique: true, index: true },
    name: { type: String, required: true, maxlength: 200, trim: true },
    phone: { type: String, maxlength: 20, trim: true },
    address: {
      street: { type: String, maxlength: 200, trim: true },
      city: { type: String, maxlength: 100, trim: true },
      state: { type: String, maxlength: 100, trim: true },
      zip: { type: String, maxlength: 20, trim: true },
    },

    menu: { type: String, ref: "Menu", default: null },
    account_owner: { type: String, ref: "User" },

    directors: [{ type: String, ref: "User" }], // Multiple directors can be assigned
    managers: [{ type: String, ref: "User" }],  // Managers for each restaurant
    employees: [{ type: String, ref: "User" }],

    food_type: [{ type: String, trim: true, default: [] }],
    allow_manager_modifications: { type: Boolean, default: false },
    status: { type: String, enum: ["active", "inactive"], default: "active" },
    cuisine_type: { type: String, },
    current_wines: [
      {
        global_id: { type: String, ref: "GlobalWine", required: true },
        source: { type: String, enum: ["shared", "restaurant"], required: true },
        customized_from_shared_menu: { type: Boolean },
        customized_from_franchise: { type: Boolean, default: false },
      },
    ],

    previous_wines: [
      {
        global_id: { type: String, ref: "GlobalWine" },
        added_date: { type: Date },
        removed_date: { type: Date },
      },
    ],

    current_dishes: [
      {
        dish_id: { type: String, ref: "Dish", required: true },
        source: { type: String, enum: ["shared", "restaurant"], required: true },
        customized_from_franchise: { type: Boolean, default: false },
      },
    ],

    previous_dishes: [
      {
        dish_id: { type: String, ref: "Dish" },
        added_date: { type: Date },
        removed_date: { type: Date },
      },
    ],

    subscription_status: {
      type: String,
      enum: ["active", "canceled", "trial", "expired"],
      index: true,
    },
    subscription_plan: {
      type: String,
      enum: ["Single", "Multiple", "Enterprise"],
      index: true,
    },

    subscription_history: [
      {
        plan: { type: String, enum: ["Single", "Multiple", "Enterprise"], required: true },
        start_date: { type: Date, required: true },
        end_date: { type: Date, required: true },
      },
    ],
  },
  { timestamps: true }
);

const Restaurant = mongoose.model("Restaurant", RestaurantSchema);
export { Restaurant };
