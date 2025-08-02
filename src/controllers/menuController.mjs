import { Menu } from "../schema/menuschema.mjs";
import { Dish } from "../schema/dishschema.mjs";
import { GlobalWine } from "../schema/wineschema.mjs"
import { v4 as uuidv4 } from "uuid";

// Create a new Menu
export const createMenu = async (req, res) => {
  try {
    const { name, description, dishes, wines, is_active } = req.body;

    // Validate input structure
    if (!Array.isArray(dishes) || !Array.isArray(wines)) {
      return res.status(400).json({ message: "Dishes and wines must be arrays." });
    }

    // Ensure the format matches the schema
    const formattedDishes = dishes.map(dish_uuid => ({ dish_uuid }));
    const formattedWines = wines.map(wine_uuid => ({ wine_uuid }));

    const newMenu = new Menu({
      uuid: uuidv4(),
      name,
      description,
      dishes: formattedDishes,
      wines: formattedWines,
      is_active,
      created_by: req.user.uuid
    });

    await newMenu.save();
    res.status(201).json({ message: "Menu created successfully", menu: newMenu });
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

// Get all Menus
export const getAllMenus = async (req, res) => {
  try {
    const menus = await Menu.find();
    res.status(200).json(menus);
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

export const getMenuById = async (req, res) => {
  try {
    const menu = await Menu.findOne({ uuid: req.params.uuid });

    if (!menu) {
      return res.status(404).json({ message: "Menu not found" });
    }

    // Fetch related Dish and GlobalWine documents using their UUIDs
    const dishes = await Dish.find({ isDeleted: false, uuid: { $in: menu.dishes.map(d => d.dish_uuid) } });
    const wines = await GlobalWine.find({ isDeleted: false, uuid: { $in: menu.wines.map(w => w.wine_uuid) } });

    res.status(200).json({ ...menu.toObject(), dishes, wines });
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

export const updateMenu = async (req, res) => {
  try {
    const { name, description, dishes, wines, is_active } = req.body;
    const { uuid } = req.params;

    // Check if the menu exists
    const existingMenu = await Menu.findOne({ uuid });
    if (!existingMenu) {
      return res.status(404).json({ message: "Menu not found" });
    }

    // Validate input structure
    if (dishes && !Array.isArray(dishes)) {
      return res.status(400).json({ message: "Dishes must be an array." });
    }
    if (wines && !Array.isArray(wines)) {
      return res.status(400).json({ message: "Wines must be an array." });
    }

    // Store old menu details for logging
    const oldMenu = { ...existingMenu.toObject() };

    // Format dishes and wines
    const formattedDishes = dishes ? dishes.map(dish_uuid => ({ dish_uuid })) : existingMenu.dishes;
    const formattedWines = wines ? wines.map(wine_uuid => ({ wine_uuid })) : existingMenu.wines;

    // Update menu fields
    existingMenu.name = name ?? existingMenu.name;
    existingMenu.description = description ?? existingMenu.description;
    existingMenu.dishes = formattedDishes;
    existingMenu.wines = formattedWines;
    existingMenu.is_active = is_active ?? existingMenu.is_active;

    // Save updated menu
    await existingMenu.save();

    // Log menu update
    await Log.create({
      uuid: uuidv4(),
      user_uuid: req.user.uuid,
      action: "menu_update",
      details: {
        menu_uuid: existingMenu.uuid,
        old_menu: oldMenu,
        new_menu: existingMenu.toObject(),
      },
      role: req.user.role,
      restaurant_uuid: req.user.assigned_restaurants?.[0] || null,
      timestamp: new Date(),
    });

    res.status(200).json({ message: "Menu updated successfully", menu: existingMenu });
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};