import mongoose from "mongoose";
import { v4 as uuidv4 } from "uuid";
import accommodationOptions from "../config/accommodationOptions.mjs";
import foodAllergens from "../config/foodAllergens.mjs";
import temperatureOptions from "../config/temperatureOptions.mjs";
import validDishTypes from "../config/dishTypes.mjs";


const DishSchema = new mongoose.Schema(
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
    restaurant_uuid: { type: String, ref: "Restaurant", required: true, default: null },
    name: { type: String, required: true, maxlength: 150, trim: true },
    description: { type: String, maxlength: 500, trim: true },
    type: [{ type: String, trim: true, required: true }],
    price: { type: Number, required: true, min: 0 },
    ingredients: { type: [String], trim: true, default: [] },
    accommodations: { type: [String], trim: true, default: [] },
    allergens: { type: [String], trim: true, default: [] },
    temperature: { type: String, trim: true, default: "" },
    dietary_restrictions: {
      health: { type: [String], enum: ["Gluten", "Dairy", "Egg", "Soy", "Nut", "Shellfish", "Fish", "Alcohol", "None"], trim: true, default: [] },
      belief: { type: [String], enum: ["Kosher", "Halal", "None"], trim: true, default: [] },
      lifestyle: { type: [String], enum: ["Vegetarian", "Vegan", "Pescatarian", "None"], trim: true, default: [] }
    },
    can_substitute: { type: Boolean, default: false },
    substitutions: { type: [String], trim: true, default: "" },
    substitution_notes: { type: String, maxlength: 500, trim: true, default: "" },
    image_url: { type: String, trim: true },
    notes: { type: String, maxlength: 500, trim: true },
    status: { type: Boolean, default: true },
    isDeleted: { type: Boolean, default: false },
  },
  { timestamps: true }
);

DishSchema.index({ name: 1, type: 1 });

const Dish = mongoose.model("Dish", DishSchema);
export { Dish };
