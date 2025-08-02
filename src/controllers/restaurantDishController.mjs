import { RestaurantDish } from '../schema/restaurantDishSchema.mjs';
import { Dish } from '../schema/dishschema.mjs';
import { Restaurant } from '../schema/restaurantschema.mjs';

/**
 * Add a dish to a restaurant
 */
export const addDishToRestaurant = async (req, res) => {
  try {
    const { restaurant_id, dish_id, price, customized_from_franchise = false } = req.body;

    // Check if the dish exists
    const dish = await Dish.findOne({ isDeleted: false, uuid: dish_id });
    if (!dish) {
      return res.status(404).json({
        success: false,
        message: "Dish not found"
      });
    }

    // Check if the restaurant exists
    const restaurant = await Restaurant.findOne({ uuid: restaurant_id });
    if (!restaurant) {
      return res.status(404).json({
        success: false,
        message: "Restaurant not found"
      });
    }

    // Check if the dish is already linked to this restaurant
    const existingRestaurantDish = await RestaurantDish.findOne({
      restaurant_id,
      dish_id
    });

    if (existingRestaurantDish) {
      // Update the price if it's different
      if (existingRestaurantDish.price !== parseFloat(price)) {
        existingRestaurantDish.price = parseFloat(price);
        await existingRestaurantDish.save();
      }

      return res.status(200).json({
        success: true,
        message: "Dish already linked to restaurant, price updated if needed",
        data: {
          restaurant_dish: existingRestaurantDish,
          dish: {
            name: dish.name,
            description: dish.description,
            type: dish.type
          }
        }
      });
    }

    // Create a new restaurant-dish relationship
    const restaurantDish = new RestaurantDish({
      restaurant_id,
      dish_id,
      price: parseFloat(price),
      is_active: true,
      customized_from_franchise
    });

    await restaurantDish.save();

    // Update the restaurant's current_dishes array
    const dishExists = restaurant.current_dishes.some(d => d.dish_id === dish_id);
    if (!dishExists) {
      restaurant.current_dishes.push({
        dish_id,
        source: "restaurant",
        customized_from_franchise
      });
      await restaurant.save();
    }

    return res.status(201).json({
      success: true,
      message: "Dish added to restaurant menu",
      data: {
        restaurant_dish: restaurantDish,
        dish: {
          name: dish.name,
          description: dish.description,
          type: dish.type
        }
      }
    });
  } catch (error) {
    console.error("Error adding dish to restaurant:", error);
    return res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message
    });
  }
};

/**
 * Remove a dish from a restaurant (doesn't delete from global catalog)
 */
export const removeDishFromRestaurant = async (req, res) => {
  try {
    const { uuid } = req.params;

    // Find the relationship
    const restaurantDish = await RestaurantDish.findOne({ uuid });
    if (!restaurantDish) {
      return res.status(404).json({
        success: false,
        message: "Restaurant-dish relationship not found"
      });
    }

    // Instead of deleting, mark as inactive and add removal timestamp
    restaurantDish.is_active = false;
    restaurantDish.removed_at = new Date();

    // Add notes about removal if provided
    if (req.body.removal_reason) {
      restaurantDish.notes = restaurantDish.notes ?
        `${restaurantDish.notes}\nRemoved: ${req.body.removal_reason}` :
        `Removed: ${req.body.removal_reason}`;
    }

    await restaurantDish.save();

    // Update the restaurant's current_dishes and previous_dishes arrays
    const restaurant = await Restaurant.findOne({ uuid: restaurantDish.restaurant_id });
    if (restaurant) {
      // Remove from current_dishes
      restaurant.current_dishes = restaurant.current_dishes.filter(
        dish => dish.dish_id !== restaurantDish.dish_id
      );

      // Add to previous_dishes
      restaurant.previous_dishes.push({
        dish_id: restaurantDish.dish_id,
        added_date: restaurantDish.createdAt,
        removed_date: new Date()
      });

      await restaurant.save();
    }

    // Get the dish details for the response
    const dish = await Dish.findOne({ uuid: restaurantDish.dish_id });

    return res.status(200).json({
      success: true,
      message: "Dish removed from restaurant menu",
      data: {
        restaurant_dish: restaurantDish,
        dish: dish ? {
          name: dish.name,
          description: dish.description,
          type: dish.type
        } : null
      },
      note: "The dish has been deactivated from your menu but remains in the global catalog."
    });
  } catch (error) {
    console.error("Error removing dish from restaurant:", error);
    return res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message
    });
  }
};

/**
 * Get all dishes for a restaurant
 */
export const getRestaurantDishes = async (req, res) => {
  try {
    const { restaurant_id } = req.params;

    // Check if the restaurant exists
    const restaurant = await Restaurant.findOne({ uuid: restaurant_id });
    if (!restaurant) {
      return res.status(404).json({
        success: false,
        message: "Restaurant not found"
      });
    }

    // Get all active restaurant-dish relationships
    const restaurantDishes = await RestaurantDish.find({
      restaurant_id,
      is_active: true
    });

    // Get the dish details for each relationship
    const dishes = await Promise.all(
      restaurantDishes.map(async (rd) => {
        const dish = await Dish.findOne({ uuid: rd.dish_id });
        return {
          ...rd.toObject(),
          dish: dish ? {
            name: dish.name,
            description: dish.description,
            type: dish.type,
            ingredients: dish.ingredients,
            allergens: dish.allergens,
            temperature: dish.temperature,
            dietary_restrictions: dish.dietary_restrictions,
            can_substitute: dish.can_substitute,
            substitution_notes: dish.substitution_notes,
            image_url: dish.image_url
          } : null
        };
      })
    );

    return res.status(200).json({
      success: true,
      data: dishes
    });
  } catch (error) {
    console.error("Error getting restaurant dishes:", error);
    return res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message
    });
  }
}; 