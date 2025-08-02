import { RestaurantWine } from "../schema/restaurantWineSchema.mjs";
import { GlobalWine } from "../schema/wineschema.mjs";
import { Restaurant } from "../schema/restaurantschema.mjs";
import wineStyles from "../utils/wineStyles.mjs";

/**
 * Get all wines for a restaurant
 */
export const getRestaurantWines = async (req, res) => {
  try {
    const { restaurantId } = req.params;

    // Check if restaurant exists
    const restaurant = await Restaurant.findOne({ uuid: restaurantId });
    if (!restaurant) {
      return res.status(404).json({
        success: false,
        message: "Restaurant not found"
      });
    }

    // Get all restaurant-wine relationships
    const restaurantWines = await RestaurantWine.find({
      restaurant_id: restaurantId,
      is_active: true
    });

    // Get the wine details for each relationship
    const wines = [];
    for (const rw of restaurantWines) {
      const wine = await GlobalWine.findOne({ isDeleted: false, uuid: rw.wine_id });
      if (wine) {
        wines.push({
          ...wine.toObject(),
          price: rw.price,
          restaurant_wine_id: rw.uuid
        });
      }
    }

    return res.status(200).json({
      success: true,
      data: wines
    });
  } catch (error) {
    console.error("Error getting restaurant wines:", error);
    return res.status(500).json({
      success: false,
      message: "Error getting restaurant wines",
      error: error.message
    });
  }
};

/**
 * Add a wine to a restaurant
 */
export const addWineToRestaurant = async (req, res) => {
  try {
    const { restaurant_id, wine_id, price, notes } = req.body;

    // Check if restaurant exists
    const restaurant = await Restaurant.findOne({ uuid: restaurant_id });
    if (!restaurant) {
      return res.status(404).json({
        success: false,
        message: "Restaurant not found"
      });
    }

    // Check if wine exists
    const wine = await GlobalWine.findOne({ uuid: wine_id });
    if (!wine) {
      return res.status(404).json({
        success: false,
        message: "Wine not found"
      });
    }

    // Check if relationship already exists
    const existingRelationship = await RestaurantWine.findOne({
      restaurant_id,
      wine_id
    });

    if (existingRelationship) {
      // Update the existing relationship
      existingRelationship.price = price;
      existingRelationship.is_active = true;
      if (notes) existingRelationship.notes = notes;

      await existingRelationship.save();

      return res.status(200).json({
        success: true,
        message: "Wine updated for restaurant",
        data: existingRelationship
      });
    }

    // Create new relationship
    const restaurantWine = new RestaurantWine({
      restaurant_id,
      wine_id,
      price,
      notes
    });

    await restaurantWine.save();

    return res.status(201).json({
      success: true,
      message: "Wine added to restaurant",
      data: restaurantWine
    });
  } catch (error) {
    console.error("Error adding wine to restaurant:", error);
    return res.status(500).json({
      success: false,
      message: "Error adding wine to restaurant",
      error: error.message
    });
  }
};

/**
 * Update a restaurant-wine relationship
 */
export const updateRestaurantWine = async (req, res) => {
  try {
    const { uuid } = req.params;
    const { price, is_active, notes } = req.body;

    // Find the relationship
    const restaurantWine = await RestaurantWine.findOne({ uuid });
    if (!restaurantWine) {
      return res.status(404).json({
        success: false,
        message: "Restaurant-wine relationship not found"
      });
    }

    // Update fields
    if (price !== undefined) restaurantWine.price = price;
    if (is_active !== undefined) restaurantWine.is_active = is_active;
    if (notes !== undefined) restaurantWine.notes = notes;

    await restaurantWine.save();

    return res.status(200).json({
      success: true,
      message: "Restaurant-wine relationship updated",
      data: restaurantWine
    });
  } catch (error) {
    console.error("Error updating restaurant-wine relationship:", error);
    return res.status(500).json({
      success: false,
      message: "Error updating restaurant-wine relationship",
      error: error.message
    });
  }
};

/**
 * Remove a wine from a restaurant (doesn't delete from global catalog)
 */
export const removeWineFromRestaurant = async (req, res) => {
  try {
    const { uuid } = req.params;

    // Find the relationship
    const restaurantWine = await RestaurantWine.findOne({ uuid });
    if (!restaurantWine) {
      return res.status(404).json({
        success: false,
        message: "Restaurant-wine relationship not found"
      });
    }

    // Instead of deleting, mark as inactive and add removal timestamp
    restaurantWine.is_active = false;
    restaurantWine.removed_at = new Date();

    // Add notes about removal if provided
    if (req.body.removal_reason) {
      restaurantWine.notes = restaurantWine.notes ?
        `${restaurantWine.notes}\nRemoved: ${req.body.removal_reason}` :
        `Removed: ${req.body.removal_reason}`;
    }

    await restaurantWine.save();

    // Get the wine details for the response
    const wine = await GlobalWine.findOne({ uuid: restaurantWine.wine_id });

    return res.status(200).json({
      success: true,
      message: "Wine removed from restaurant menu",
      data: {
        restaurant_wine: restaurantWine,
        wine: wine ? {
          producer_name: wine.producer_name,
          product_name: wine.product_name,
          vintage: wine.vintage
        } : null
      },
      note: "The wine has been deactivated from your menu but remains in the global catalog."
    });
  } catch (error) {
    console.error("Error removing wine from restaurant:", error);
    return res.status(500).json({
      success: false,
      message: "Error removing wine from restaurant",
      error: error.message
    });
  }
};

/**
 * Update restaurant wine customization
 * This endpoint allows updating restaurant-specific wine customizations, including style overrides
 */
export const updateRestaurantWineCustomization = async (req, res) => {
  try {
    const { restaurantId, wineId } = req.params;
    const {
      style_override,
      price,
      notes,
      manager_comments,
      tasting_notes
    } = req.body;

    // Check if restaurant exists
    const restaurant = await Restaurant.findOne({ uuid: restaurantId });
    if (!restaurant) {
      return res.status(404).json({
        success: false,
        message: "Restaurant not found"
      });
    }

    // Check if user has permission to update this restaurant's wines
    if (!isSuperAdmin(req) && !req.user.assigned_restaurants.includes(restaurantId)) {
      return res.status(403).json({
        success: false,
        message: "Unauthorized to update wines for this restaurant"
      });
    }

    // Find the restaurant wine relationship
    const restaurantWine = await RestaurantWine.findOne({
      restaurant_id: restaurantId,
      wine_id: wineId
    });

    if (!restaurantWine) {
      return res.status(404).json({
        success: false,
        message: "Wine not found in restaurant's menu"
      });
    }

    // Update the wine customization
    if (style_override) {
      // Validate wine style ID
      const validStyleIds = Object.values(wineStyles.wineTypes)
        .flatMap(type => type.styles.map(style => style.id));

      if (!validStyleIds.includes(style_override.wine_style_id)) {
        return res.status(400).json({
          success: false,
          message: "Invalid wine style ID"
        });
      }

      restaurantWine.style_override = style_override;
    }

    if (price !== undefined) {
      restaurantWine.price = price;
    }

    if (notes) {
      restaurantWine.notes = notes;
    }

    if (manager_comments) {
      restaurantWine.manager_comments = manager_comments;
    }

    if (tasting_notes) {
      restaurantWine.tasting_notes = tasting_notes;
    }

    await restaurantWine.save();

    // Get the updated wine with all customizations
    const updatedWine = await RestaurantWine.findOne({
      restaurant_id: restaurantId,
      wine_id: wineId
    }).populate('wine_id');

    return res.status(200).json({
      success: true,
      message: "Wine customization updated successfully",
      data: updatedWine
    });
  } catch (error) {
    console.error("Error updating restaurant wine customization:", error);
    return res.status(500).json({
      success: false,
      message: "Error updating restaurant wine customization",
      error: error.message
    });
  }
}; 