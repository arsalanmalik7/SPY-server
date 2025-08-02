import mongoose from 'mongoose';
import { v4 as uuidv4 } from 'uuid';

const MenuSchema = new mongoose.Schema({
  restaurant_uuid: { type: String, ref: 'Restaurant', required: true },
  name: { type: String, required: true, maxlength: 200, trim: true, default: "" },
  uuid: { type: String, default: uuidv4, unique: true, index: true },
  dishes: [{ dish_uuid: { type: String, ref: 'Dish', required: true } }],
  wines: [{ wine_uuid: { type: String, ref: 'GlobalWine', required: true } }],
  is_active: { type: Boolean, default: true, index: true },
  created_by: { type: String, ref: 'User' },
}, { timestamps: true });

const Menu = mongoose.model('Menu', MenuSchema);
export { Menu };
