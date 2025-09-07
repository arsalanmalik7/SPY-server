import { GlobalWine } from "../schema/wineschema.mjs";
import { Restaurant } from "../schema/restaurantschema.mjs";
import { Menu } from "../schema/menuschema.mjs";
import { generateLessonsForRestaurant, archiveLessons, permenantDeleteLessons } from "../services/lessonCreate.mjs";
import wineCategories from "../config/wineCategories.mjs";
import { v4 as uuidv4 } from "uuid";
import path from "path";
import fs from "fs";
import { Log } from "../schema/logschema.mjs";

// Create a new Wine
export const createWine = async (req, res) => {
  try {
    const {
      producer_name,
      product_name,
      varietals,
      region,
      vintage,
      category,
      sub_category,
      is_filtered,
      has_residual_sugar,
      is_organic,
      is_biodynamic,
      is_vegan,
      style,
      notes,
      status,
      restaurant_uuid,
      offering,
    } = req.body;




    // Check if a wine with the same product_name, producer_name, and vintage already exists
    const existingWine = await GlobalWine.findOne({ isDeleted: false, product_name, producer_name, vintage });
    if (existingWine) {
      return res.status(400).json({ message: "A wine with the same name, producer, and vintage already exists." });
    }

    const currentYear = new Date().getFullYear();

    // Parse vintage as integer and validate
    const vintageYear = parseInt(vintage, 10);
    if (isNaN(vintageYear) || vintageYear < 1800 || vintageYear > currentYear) {
      return res.status(400).json({ message: "Invalid vintage year, Vintage must be between 1800 - current year" });
    }

    const restaurant = await Restaurant.findOne({ uuid: restaurant_uuid });

    const wineImage = req.file ? req.file.path : "";
    const wineImageUrl = wineImage ? `/${wineImage.replace(/\\/g, '/')}` : "";

    let parsedRegion;
    let parsdVarietals;
    let parsedStyle;
    let parsedOffering;
    if (varietals && typeof varietals === 'string') {
      try {
        parsdVarietals = JSON.parse(varietals);

      } catch (error) {
        return res.status(400).json({ message: "Invalid varietals format" });
      }
    }
    if (region && typeof region === 'string') {
      try {
        parsedRegion = JSON.parse(region);

      } catch (error) {
        return res.status(400).json({ message: "Invalid region format" });
      }
    }

    if (style && typeof style === 'string') {
      try {
        parsedStyle = JSON.parse(style);

      } catch (error) {
        return res.status(400).json({ message: "Invalid style format" });
      }
    }

    if (offering && typeof offering === 'string') {
      try {
        parsedOffering = JSON.parse(offering);

      } catch (error) {
        return res.status(400).json({ message: "Invalid offering format" });
      }
    }


    // Create a new wine object
    const newWine = new GlobalWine({
      uuid: uuidv4(),
      producer_name,
      product_name,
      varietals: parsdVarietals || varietals,
      region: parsedRegion || region,
      vintage,
      category,
      sub_category,
      is_filtered,
      has_residual_sugar,
      style: parsedStyle || style,
      image_url: wineImageUrl ? wineImageUrl : "/uploads/default_image_wine.jpg",
      is_organic,
      is_biodynamic,
      is_vegan,
      notes,
      status,
      restaurant_uuid,
      offering: parsedOffering,
    });

    // Save the new wine to the database
    await newWine.save();

    restaurant.current_wines.push({
      global_id: newWine.uuid,
      source: "restaurant"
    });
    await restaurant.save();

    const existingMenu = await Menu.findOne({ restaurant_uuid });
    if (existingMenu) {
      existingMenu.wines.push({ wine_uuid: newWine.uuid });
      await existingMenu.save();
    } else {
      const newMenu = new Menu({
        restaurant_uuid,
        name: `${restaurant.name} menu`,
        wines: [{ wine_uuid: newWine.uuid }],
        is_active: true,
        created_by: req.user.uuid,
      })
      await newMenu.save();
    }

    const generateLessons = await generateLessonsForRestaurant("wine", restaurant_uuid, newWine);
    if (!generateLessons) {
      return res.status(500).json({ message: "Wine created successfully, Error generating lessons" });
    }

    // Log wine creation
    await Log.create({
      user_uuid: req.user.uuid,
      action: "wine_created",
      details: {
        description: `${newWine.product_name} added`,
        wine_uuid: newWine.uuid,
      },
      role: req.user.role,
    });

    // Respond with the created wine
    res.status(201).json({ message: "Wine created successfully", wine: newWine });
  } catch (error) {
    console.error("Error creating wine:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

// Get all Wines
export const getAllWines = async (req, res) => {
  try {
    const { user } = req;
    let wines;
    if (req?.user?.role === "super_admin") {
      wines = await GlobalWine.find({ isDeleted: false, }).sort({ createdAt: -1 });
    } else {
      const assignedRestaurantUUIDs = req.user.assigned_restaurants.map(r => r.uuid);
      const ownerRestaurants = await Restaurant.find({ account_owner: user.uuid });
      const ownerRestaurantUUIDs = ownerRestaurants.map(r => r.uuid);
      const allRestaurantUUIDs = Array.from(new Set([...assignedRestaurantUUIDs, ...ownerRestaurantUUIDs]));
      wines = await GlobalWine.find({ isDeleted: false, restaurant_uuid: { $in: allRestaurantUUIDs } }).sort({ createdAt: -1 });
    }
    const winesWithRestaurant = await Promise.all(
      wines.map(async (wine) => {
        if (wine.restaurant_uuid) {
          const restaurant = await Restaurant.findOne({ uuid: wine.restaurant_uuid }).select("name");
          if (restaurant) {
            return { ...wine.toObject(), restaurantname: restaurant.name };
          }
        }
        return wine.toObject(); // If no restaurant_uuid, return wine as is
      })
    );

    res.status(200).json({ winesWithRestaurant, wineCategories });
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

export const getArchivedWinesOfRestarant = async (req, res) => {
  try {
    const { user } = req;
    let wines;
    if (req?.user?.role === "super_admin") {
      wines = await GlobalWine.find({ isDeleted: true, }).sort({ createdAt: -1 });
    } else {
      const assignedRestaurantUUIDs = req.user.assigned_restaurants.map(r => r.uuid);
      const ownerRestaurants = await Restaurant.find({ account_owner: user.uuid });
      const ownerRestaurantUUIDs = ownerRestaurants.map(r => r.uuid);
      const allRestaurantUUIDs = Array.from(new Set([...assignedRestaurantUUIDs, ...ownerRestaurantUUIDs]));
      wines = await GlobalWine.find({ isDeleted: true, restaurant_uuid: { $in: allRestaurantUUIDs } }).sort({ createdAt: -1 });
    }

    const winesWithRestaurant = await Promise.all(
      wines.map(async (wine) => {
        if (wine.restaurant_uuid) {
          const restaurant = await Restaurant.findOne({ uuid: wine.restaurant_uuid }).select("name");
          if (restaurant) {
            return { ...wine.toObject(), restaurantname: restaurant.name };
          }
        }
        return wine.toObject(); // If no restaurant_uuid, return wine as is
      })
    );

    res.status(200).json({ winesWithRestaurant, wineCategories });
  } catch (error) {
    console.log(error, "error");
    res.status(500).json({ message: "Server error", error: error.message });
  }
}

// Get a Wine by its UUID
export const getWineById = async (req, res) => {
  try {
    const wine = await GlobalWine.findOne({ isDeleted: false, uuid: req.params.uuid });
    if (!wine) {
      return res.status(404).json({ message: "Wine not found" });
    }
    res.status(200).json(wine);
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};


export const updateWine = async (req, res) => {
  try {
    const { uuid } = req.params;
    const {
      producer_name,
      product_name,
      varietals,
      region,
      vintage,
      category,
      sub_category,
      is_filtered,
      has_residual_sugar,
      is_organic,
      is_biodynamic,
      is_vegan,
      style,
      notes,
      status,
      restaurant_uuid,
      offering,
    } = req.body;

    const wine = await GlobalWine.findOne({ isDeleted: false, uuid });
    if (!wine) {
      return res.status(404).json({ message: "Wine not found" });
    }

    // Handle file upload
    const wine_image = req.file ? req.file.path : "";
    const wineImageUrl = wine_image ? `/${wine_image.replace(/\\/g, '/')}` : "";

    // Parse JSON fields if they come as strings
    const parsedVarietals = typeof varietals === 'string' ? JSON.parse(varietals) : varietals;
    const parsedRegion = typeof region === 'string' ? JSON.parse(region) : region;
    const parsedStyle = typeof style === 'string' ? JSON.parse(style) : style;
    const parsedOffering = typeof offering === 'string' ? JSON.parse(offering) : offering;

    // Update fields
    if (producer_name) wine.producer_name = producer_name;
    if (product_name) wine.product_name = product_name;
    if (parsedVarietals) wine.varietals = parsedVarietals;
    if (parsedRegion) wine.region = parsedRegion;
    if (vintage) wine.vintage = vintage;
    if (category) wine.category = category;
    if (sub_category) wine.sub_category = sub_category;
    if (offering) wine.offering = parsedOffering;
    if (typeof is_filtered !== 'undefined') wine.is_filtered = is_filtered;
    if (typeof has_residual_sugar !== 'undefined') wine.has_residual_sugar = has_residual_sugar;
    if (typeof is_organic !== 'undefined') wine.is_organic = is_organic;
    if (typeof is_biodynamic !== 'undefined') wine.is_biodynamic = is_biodynamic;
    if (typeof is_vegan !== 'undefined') wine.is_vegan = is_vegan;
    if (parsedStyle) wine.style = parsedStyle;
    if (notes) wine.notes = notes;
    if (typeof status !== 'undefined') wine.status = status;
    if (restaurant_uuid) wine.restaurant_uuid = restaurant_uuid;

    const __dirname = path.dirname(new URL(import.meta.url).pathname);
    // Replace image if new one is uploaded
    if (wineImageUrl) {
      if (wine.image_url) {
        const oldImagePath = path.join(__dirname, '..', wine.image_url);
        if (fs.existsSync(oldImagePath)) {
          fs.unlinkSync(oldImagePath);
        }
      }
      wine.image_url = wineImageUrl;
    }

    wine.updatedAt = new Date();

    const updatedWine = await wine.save();

  
      await generateLessonsForRestaurant("wine", updatedWine.restaurant_uuid, updatedWine, true);
    

    // Log wine update
    await Log.create({
      user_uuid: req.user.uuid,
      action: "wine_updated",
      details: {
        description: `${updatedWine.product_name} updated`,
        wine_uuid: updatedWine.uuid,
      },
      role: req.user.role,
    });

    res.status(200).json({ message: "Wine updated successfully", updatedWine });

  } catch (error) {
    console.error("Error updating wine:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};


// Delete a Wine
export const archiveWine = async (req, res) => {
  try {
    const { uuid } = req.params;

    // Find the wine by UUID
    const wine = await GlobalWine.findOne({ isDeleted: false, uuid });
    if (!wine) {
      return res.status(404).json({ message: "Wine not found" });
    }

    const restaurant = await Restaurant.findOne({ uuid: wine.restaurant_uuid });

    // Delete the wine
    await GlobalWine.findOneAndUpdate({ uuid }, { isDeleted: true });

    restaurant.current_wines = restaurant?.current_wines?.filter(w => w.global_id !== uuid);
    restaurant.previous_wines.push({
      global_id: wine.uuid,
      added_date: new Date()
    })
    await restaurant.save();


    const result = await archiveLessons(uuid);
    if (!result) return res.status(200).json({ message: "Lessons are not archived, Wine archived successfully" });

    // Log wine deletion
    await Log.create({
      user_uuid: req.user.uuid,
      action: "wine_archived",
      details: {
        description: `Wine ${wine.product_name} archived`,
        wine_uuid: wine.uuid,
      },
      role: req.user.role,
    });

    res.status(200).json({ message: "Wine archived successfully" });
  } catch (error) {
    console.log(error, "error");
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

export const restoreWine = async (req, res) => {
  try {
    const { uuid } = req.params;

    // Find the wine by UUID
    const wine = await GlobalWine.findOne({ isDeleted: true, uuid });
    if (!wine) {
      return res.status(404).json({ message: "Wine not found" });
    }

    const restaurant = await Restaurant.findOne({ uuid: wine.restaurant_uuid });

    // Delete the wine
    await GlobalWine.findOneAndUpdate({ uuid }, { isDeleted: false });

    restaurant.current_wines.push({
      global_id: wine.uuid,
      source: "restaurant"
    });
    restaurant.previous_wines = restaurant?.previous_wines?.filter(w => w.global_id !== uuid);
    await restaurant.save();

    const result = await generateLessonsForRestaurant("wine", restaurant.uuid, wine);
    if (!result) return res.status(200).json({ message: "Lessons are not generated, Wine restored successfully" });

    // Log wine restore
    await Log.create({
      user_uuid: req.user.uuid,
      action: "wine_restored",
      details: {
        description: `Wine ${wine.product_name} restored`,
        wine_uuid: wine.uuid,
      },
      role: req.user.role,
    });

    res.status(200).json({ message: "Wine restored successfully" });
  } catch (error) {
    console.log(error, "error");
    res.status(500).json({ message: "Server error", error: error.message });
  }
}

// Wine Analytics API
export const getWineAnalytics = async (req, res) => {
  try {
    const { user } = req;
    const { restaurant_uuid } = req.params;
    let wines;
    let removedWines;
    let recentWineUpdates;

    const assignedRestaurantUUIDs = req.user.assigned_restaurants.map(r => r.uuid);
    const ownerRestaurants = await Restaurant.find({ account_owner: user.uuid });
    const ownerRestaurantUUIDs = ownerRestaurants.map(r => r.uuid);
    const allRestaurantUUIDs = Array.from(new Set([...assignedRestaurantUUIDs, ...ownerRestaurantUUIDs]));
    wines = await GlobalWine.find({ restaurant_uuid: restaurant_uuid }).sort({ createdAt: -1 });
    removedWines = await GlobalWine.find({ isDeleted: true, restaurant_uuid: restaurant_uuid }).sort({ createdAt: -1 });
    recentWineUpdates = await Log.find({
      action: { $in: ["wine_created", "wine_updated", "wine_archived", "wine_restored"] },
      "details.wine_uuid": { $in: wines.map(w => w.uuid) }
    }).sort({ createdAt: -1 }).populate({
      path: "user_uuid",
      model: "User",
      match: { uuid: { $exists: true } },
      localField: "user_uuid",
      foreignField: "uuid",
      select: "first_name last_name"
    });
    console.log(recentWineUpdates.length, "recentWineUpdates.length");

    const winesWithRestaurant = await Promise.all(
      wines.map(async (wine) => {
        if (wine.restaurant_uuid) {
          const restaurant = await Restaurant.findOne({ uuid: wine.restaurant_uuid }).select("name");
          if (restaurant) {
            return { ...wine.toObject(), restaurantname: restaurant.name };
          }
        }
        return wine.toObject(); // If no restaurant_uuid, return wine as is
      })
    );

    const totalWines = winesWithRestaurant.length;
    const newWinesInThirtyDays = winesWithRestaurant.filter(wine => {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      return new Date(wine.createdAt) > thirtyDaysAgo;
    }).length;

    const removedWinesInThirtyDays = removedWines.filter(wine => {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      return new Date(wine.createdAt) > thirtyDaysAgo;
    }).length;

    const lastUpdatedWine = winesWithRestaurant.reduce((latest, current) => {
      return new Date(current.updatedAt) > new Date(latest.updatedAt) ? current : latest;
    }, winesWithRestaurant[0]);

    const redWinePercentage = winesWithRestaurant.filter((wine) => (wine.category === "Red")).length / totalWines * 100 || 0;
    const whiteWinePercentage = winesWithRestaurant.filter((wine) => (wine.category === "White")).length / totalWines * 100 || 0;
    const roseWinePercentage = winesWithRestaurant.filter((wine) => (wine.category === "Rose")).length / totalWines * 100 || 0;
    const sparklingWinePercentage = winesWithRestaurant.filter((wine) => (wine.category === "Sparkling")).length / totalWines * 100 || 0;

    const frnaceRegionPercentage = winesWithRestaurant.filter((wine) => (wine?.region?.country === "France")).length / totalWines * 100 || 0;
    const italyRegionPercentage = winesWithRestaurant.filter((wine) => (wine?.region?.country === "Italy")).length / totalWines * 100 || 0;
    const usaRegionPercentage = winesWithRestaurant.filter((wine) => (wine?.region?.country === "USA")).length / totalWines * 100 || 0;

    const otherRegionPercentage = winesWithRestaurant.filter((wine) => (wine?.region?.country !== "France" && wine?.region?.country !== "Italy" && wine?.region?.country !== "USA")).length / totalWines * 100 || 0;

    const cabernetSauvignon = winesWithRestaurant.filter((wine) => (wine.varietals?.includes("Cabernet Sauvignon"))).length || 0;
    const chardonnay = winesWithRestaurant.filter((wine) => (wine.varietals?.includes("Chardonnay"))).length || 0;
    const pinotNoir = winesWithRestaurant.filter((wine) => (wine.varietals?.includes("Pinot Noir"))).length || 0;
    const sauvignonBlanc = winesWithRestaurant.filter((wine) => (wine.varietals?.includes("Sauvignon Blanc"))).length || 0;

    const fullBodiedRedPercentage = winesWithRestaurant.filter((wine) => (wine?.style?.name?.includes("Full-bodied Red"))).length / totalWines * 100 || 0;
    const crispWhite = winesWithRestaurant.filter((wine) => (wine?.style?.name?.includes("Crisp White"))).length / totalWines * 100 || 0;
    const sweetDessert = winesWithRestaurant.filter((wine) => (wine?.style?.name?.includes("Sweet Dessert"))).length / totalWines * 100 || 0;
    const sparkling = winesWithRestaurant.filter((wine) => (wine?.style?.name?.includes("Sparkling"))).length / totalWines * 100 || 0;

    const organicWines = winesWithRestaurant.filter((wine) => (wine.is_organic === true)).length || 0;
    const biodynamicWines = winesWithRestaurant.filter((wine) => (wine.is_biodynamic === true)).length || 0;
    const veganWines = winesWithRestaurant.filter((wine) => (wine.is_vegan === true)).length || 0;






    res.status(200).json({
      totalWines,
      newWinesInThirtyDays,
      removedWinesInThirtyDays,
      lastUpdatedWine: lastUpdatedWine?.product_name,
      recentWineUpdates,
      redWinePercentage,
      whiteWinePercentage,
      roseWinePercentage,
      sparklingWinePercentage,
      frnaceRegionPercentage,
      italyRegionPercentage,
      usaRegionPercentage,
      otherRegionPercentage,
      cabernetSauvignon,
      chardonnay,
      pinotNoir,
      sauvignonBlanc,
      fullBodiedRedPercentage,
      crispWhite,
      sweetDessert,
      sparkling,
      organicWines,
      biodynamicWines,
      veganWines,
    });
  } catch (error) {
    console.log(error, "error");
    res.status(500).json({ message: "Server error", error: error.message });
  }
};
