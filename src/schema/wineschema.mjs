import mongoose from "mongoose";
import { type } from "os";
import { v4 as uuidv4 } from 'uuid';

const GlobalWineSchema = new mongoose.Schema({
  uuid: { type: String, default: uuidv4, unique: true, index: true },
  producer_name: { type: String, required: true, trim: true, maxlength: 200 },
  product_name: { type: String, required: true, trim: true, maxlength: 200 },
  varietals: {
    type: [String],
    validate: {
      validator: v => Array.isArray(v) && v.every(item => typeof item === "string"),
      message: "Varietals must be an array of strings"
    },
    default: []
  },
  region: {
    country: { type: String, trim: true, maxlength: 100, required: true }, // National identity
    region: { type: String, trim: true, maxlength: 100, required: true }, // Broad cultural/geographic area
    sub_region: { type: String, trim: true, maxlength: 100 }, // Finer climatic or soil differences
    commune_appellation: { type: String, trim: true, maxlength: 100 }, // Legal & historic precision
    vineyard: { type: String, trim: true, maxlength: 100 }, // Terroir-specific site
  },
  vintage: { type: Number, min: 1800, max: new Date().getFullYear(), index: true },
  category: { type: String, enum: ["Red", "White", "Sparkling", "Rose", "Dessert", "Orange"], required: true, index: true },
  sub_category: { type: String, trim: true, maxlength: 100 },
  is_filtered: { type: Boolean, default: false },
  has_residual_sugar: { type: Boolean, default: false },
  is_organic: { type: Boolean, default: false },
  is_biodynamic: { type: Boolean, default: false },
  is_vegan: { type: Boolean, default: false },
  offering: {
    by_the_glass: { type: Boolean, default: false },
    by_the_bottle: { type: Boolean, default: false },
    glass_price: { type: Number, min: 0 },
    bottle_price: { type: Number, min: 0 }
  },
  restaurant_uuid: { type: String, ref: "Restaurant", required: true, default: null },
  style: {
    name: { type: String, trim: true, maxlength: 100 },
    body: { type: String, trim: true, maxlength: 50 },
    texture: { type: String, trim: true, maxlength: 50 },
    flavor_intensity: { type: String, trim: true, maxlength: 100 },
    type: { type: String, trim: true, maxlength: 50 },
    body_rank: { type: Number, min: 1, max: 4 },
  },
  image_url: { type: String, trim: true, maxlength: 500 },
  notes: { type: String, maxlength: 500, trim: true },
  status: { type: Boolean, default: true, },
  isDeleted: { type: Boolean, default: false }
}, { timestamps: true });

// Ensure uniqueness based on product_name + producer_name + vintage
GlobalWineSchema.index({ product_name: 1, producer_name: 1, vintage: 1 }, { unique: true });


const GlobalWine = mongoose.model('GlobalWine', GlobalWineSchema);
export { GlobalWine };
