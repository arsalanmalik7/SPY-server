import { Dish } from "../schema/dishschema.mjs";
import { Menu } from "../schema/menuschema.mjs";
import { Restaurant } from "../schema/restaurantschema.mjs";
import { generateLessonsForRestaurant, archiveLessons, restoreLessons, permenantDeleteLessons } from "../services/lessonCreate.mjs";
import validDishTypes from "../config/dishTypes.mjs";
import { v4 as uuidv4 } from "uuid";
import path from "path";
import fs from "fs";
import { Log } from "../schema/logschema.mjs";
import { User } from "../schema/userschema.mjs";

export const createDish = async (req, res) => {
  try {
    const {
      name,
      description,
      type,
      price,
      temperature,
      ingredients,
      allergens,
      accommodations,
      dietary_restrictions,
      can_substitute = false,
      substitution_notes = "",
      substitutions,
      notes,
      status,
      restaurant_uuid,
      is_cross_contact,
    } = req.body;

    // Check if a dish with the same name already exists
    const existingDish = await Dish.findOne({ isDeleted: false, name });
    if (existingDish) {
      return res.status(400).json({ message: "A dish with this name already exists." });
    }

    const restaurant = await Restaurant.findOne({ uuid: restaurant_uuid });

    const dish_iamge = req.file ? req.file.path : "";


    const dishImageUrl = dish_iamge ? `/${dish_iamge.replace(/\\/g, '/')}` : "";

    const parsedType = typeof type === 'string' ? JSON.parse(type) : type;
    const paresedIngredients = typeof ingredients === 'string' ? JSON.parse(ingredients) : ingredients;
    const parsedAllergens = typeof allergens === 'string' ? JSON.parse(allergens) : allergens;
    const parsedDietaryRestrictions = typeof dietary_restrictions === 'string' ? JSON.parse(dietary_restrictions) : dietary_restrictions;
    const parsedAccommodations = typeof accommodations === 'string' ? JSON.parse(accommodations) : accommodations;
    const parsedSubstitution = typeof substitutions === 'string' ? JSON.parse(substitutions) : substitutions;

    const newDish = new Dish({
      uuid: uuidv4(),
      name,
      description,
      type: parsedType,
      price,
      temperature,
      ingredients: paresedIngredients,
      allergens: parsedAllergens,
      dietary_restrictions: parsedDietaryRestrictions,
      accommodations: parsedAccommodations,
      can_substitute,
      substitutions: parsedSubstitution,
      substitution_notes: can_substitute ? substitution_notes : "", // Only store if substitutable
      image_url: dishImageUrl ? dishImageUrl : "/uploads/default_image_food.jpg",
      notes,
      status,
      restaurant_uuid,
      is_cross_contact: is_cross_contact || false, // Default to false if not provided
    });
    await newDish.save();

    restaurant.current_dishes.push({
      dish_id: newDish.uuid,
      source: "restaurant"
    })
    await restaurant.save();

    const existingMenu = await Menu.findOne({
      restaurant_uuid
    });
    if (existingMenu) {
      existingMenu.dishes.push({ dish_uuid: newDish.uuid });
      await existingMenu.save();
    } else {
      const newMenu = await new Menu({
        restaurant_uuid,
        name: `${restaurant?.name} menu`,
        dishes: [{ dish_uuid: newDish.uuid }],
        created_by: req.user.uuid,
      });
      await newMenu.save();
    }

    const generateLessons = await generateLessonsForRestaurant("food", restaurant_uuid, newDish);
    if (!generateLessons) {
      return res.status(500).json({ message: "Dish created successfully, Error generating lessons" });
    }

    await Log.create({
      user_uuid: req.user.uuid,
      role: req.user.role,
      action: "dish_created",
      details: {
        description: `${newDish.name} added`,
        dish_uuid: newDish.uuid,
      },
    })

    res.status(201).json({ message: "Dish created successfully", dish: newDish });
  } catch (error) {
    console.error("Error creating dish:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};



export const getAllDishes = async (req, res) => {
  try {
    const { user } = req;
    let dishes;
    if (req?.user?.role === "super_admin") {
      dishes = await Dish.find({ isDeleted: false, }).sort({ createdAt: -1 });
    } else {
      const assignedRestaurantUUIDs = req.user.assigned_restaurants.map(r => r.uuid);
      const ownerRestaurants = await Restaurant.find({ account_owner: user.uuid });
      const ownerRestaurantUUIDs = ownerRestaurants.map(r => r.uuid);
      const allRestaurantUUIDs = Array.from(new Set([...assignedRestaurantUUIDs, ...ownerRestaurantUUIDs]));
      dishes = await Dish.find({ isDeleted: false, restaurant_uuid: { $in: allRestaurantUUIDs } }).sort({ createdAt: -1 });
    }
    const dishesWithRestaurant = await Promise.all(
      dishes.map(async (dish) => {
        if (dish.restaurant_uuid) {
          const restaurant = await Restaurant.findOne({ uuid: dish.restaurant_uuid }).select("name");
          if (restaurant) {
            return { ...dish.toObject(), restaurantname: restaurant.name, };
          }
        }
        return dish.toObject(); // If no restaurant_uuid, return wine as is
      })
    );
    res.status(200).json({ dishesWithRestaurant, validDishTypes });
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

export const getAllDArchivedDishes = async (req, res) => {
  try {
    const { user } = req;
    let dishes;
    if (req?.user?.role === "super_admin") {
      dishes = await Dish.find({ isDeleted: true, }).sort({ createdAt: -1 });
    } else {
      const assignedRestaurantUUIDs = req.user.assigned_restaurants.map(r => r.uuid);
      const ownerRestaurants = await Restaurant.find({ account_owner: user.uuid });
      const ownerRestaurantUUIDs = ownerRestaurants.map(r => r.uuid);
      const allRestaurantUUIDs = Array.from(new Set([...assignedRestaurantUUIDs, ...ownerRestaurantUUIDs]));
      dishes = await Dish.find({ isDeleted: true, restaurant_uuid: { $in: allRestaurantUUIDs } }).sort({ createdAt: -1 });
    }

    const dishesWithRestaurant = await Promise.all(
      dishes.map(async (dish) => {
        if (dish.restaurant_uuid) {
          const restaurant = await Restaurant.findOne({ uuid: dish.restaurant_uuid }).select("name");
          if (restaurant) {
            return { ...dish.toObject(), restaurantname: restaurant.name };
          }
        }
        return dish.toObject(); // If no restaurant_uuid, return dish as is
      })
    );

    res.status(200).json({ dishesWithRestaurant, validDishTypes });
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

export const getDishById = async (req, res) => {
  try {
    const dish = await Dish.findOne({ isDeleted: false, uuid: req.params.uuid });
    if (!dish) {
      return res.status(404).json({ message: "Dish not found" });
    }
    res.status(200).json(dish);
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

export const updateDish = async (req, res) => {
  try {
    const { uuid } = req.params;

    const {
      name,
      description,
      type,
      price,
      temperature,
      ingredients,
      allergens,
      dietary_restrictions,
      can_substitute,
      substitutions,
      substitution_notes,
      accommodations,
      status,
      notes,
      restaurant_uuid,
      is_cross_contact,
    } = req.body;

    const dish = await Dish.findOne({ isDeleted: false, uuid });
    if (!dish) {
      return res.status(400).json({ message: "Dish does not exist" });
    }

    const dish_iamge = req.file ? req.file.path : "";


    const dishImageUrl = dish_iamge ? `/${dish_iamge.replace(/\\/g, '/')}` : "";
    const parsedType = typeof type === 'string' ? JSON.parse(type) : type;
    const paresedIngredients = typeof ingredients === 'string' ? JSON.parse(ingredients) : ingredients;
    const parsedAllergens = typeof allergens === 'string' ? JSON.parse(allergens) : allergens;
    const parsedDietaryRestrictions = typeof dietary_restrictions === 'string' ? JSON.parse(dietary_restrictions) : dietary_restrictions;
    const parsedAccommodations = typeof accommodations === 'string' ? JSON.parse(accommodations) : accommodations;
    const parsedSubstitution = typeof substitutions === 'string' ? JSON.parse(substitutions) : substitutions;

    if (name) dish.name = name;
    if (description) dish.description = description;
    if (type) dish.type = parsedType;
    if (price) dish.price = price;
    if (temperature) dish.temperature = temperature;
    if (ingredients) dish.ingredients = paresedIngredients;
    if (allergens) dish.allergens = parsedAllergens;
    if (dietary_restrictions) dish.dietary_restrictions = parsedDietaryRestrictions;
    if (can_substitute) dish.can_substitute = can_substitute;
    if (substitutions) dish.substitutions = parsedSubstitution;
    if (notes) dish.notes = notes;
    if (substitution_notes) dish.substitution_notes = can_substitute ? substitution_notes : "";
    if (accommodations) dish.accommodations = parsedAccommodations;
    if (is_cross_contact !== undefined) dish.is_cross_contact = is_cross_contact;
    if (status) dish.status = status;
    if (dishImageUrl) {
      // Delete the old image if it exists
      const __dirname = path.dirname(new URL(import.meta.url).pathname);
      if (dish.image_url) {
        const oldImagePath = path.join(__dirname, '..', dish.image_url);
        if (fs.existsSync(oldImagePath)) {
          fs.unlinkSync(oldImagePath);
        }
      }
      dish.image_url = dishImageUrl;
    };
    if (restaurant_uuid) dish.restaurant_uuid = restaurant_uuid;

    dish.updatedAt = new Date();
    const updatedDish = await dish.save();
    if (!updatedDish) {
      return res.status(400).json({ message: "Failed to update dish" });
    }

    const deleteLessons = permenantDeleteLessons(updatedDish.uuid);

    if (deleteLessons) {
      await generateLessonsForRestaurant("food", updatedDish.restaurant_uuid, updatedDish);
    }


    await Log.create({
      user_uuid: req.user.uuid,
      role: req.user.role,
      action: "dish_updated",
      details: {
        description: `${updatedDish.name} updated`,
        dish_uuid: updatedDish.uuid,
      },
    });


    res.status(200).json({ message: "Dish updated successfully", updatedDish });
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

// Delete a Dish
export const archiveDish = async (req, res) => {
  try {
    const { uuid } = req.params;

    // Find the dish by UUID
    const dish = await Dish.findOne({ isDeleted: false, uuid });
    if (!dish) {
      return res.status(404).json({ message: "Dish not found" });
    }

    const restaurant = await Restaurant.findOne({ uuid: dish.restaurant_uuid });

    const restaurantUsers = [...restaurant.directors, ...restaurant.managers, ...restaurant.employees, ""];

    // const getAllUsers = await User.find({
    //   $or: [
    //     { uuid: { $in: restaurantUsers } },
    //     { role: 'super_admin' }
    //   ]
    // }).select('-password');

    // console.log(getAllUsers.length, "getAlLusers");

    // const archivePreviousAnswers = getAllUsers.map((user) => {
    //   user.attemptedQuestions.map((aq) => aq.menu_item === uuid ? aq.isDeleted = true : aq.isDeleted = false);
    //   user.save();
    // });






    // Delete the dish
    await Dish.findOneAndUpdate({ uuid }, { isDeleted: true });

    restaurant.current_dishes = restaurant?.current_dishes?.filter(w => w.dish_id !== uuid);
    restaurant.previous_dishes.push({
      dish_id: dish.uuid,
      added_date: new Date()
    })
    await restaurant.save();


    const result = await archiveLessons(uuid);



    if (!result) return res.status(200).json({ message: "Lessons are not archived, dish archived successfully" });


    await Log.create({
      user_uuid: req.user.uuid,
      action: "dish_archived",
      details: {
        description: `Dish ${dish.name} archived`,
        dish_uuid: dish.uuid,
      },
      role: req.user.role,

    });

    res.status(200).json({ message: "dish archived successfully" });
  } catch (error) {
    console.log(error, "error");
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

export const restoreDish = async (req, res) => {
  try {
    const { uuid } = req.params;

    // Find the dish by UUID
    const dish = await Dish.findOne({ isDeleted: true, uuid });
    if (!dish) {
      return res.status(404).json({ message: "Dish not found" });
    }

    const restaurant = await Restaurant.findOne({ uuid: dish.restaurant_uuid });

    // Delete the dish
    await Dish.findOneAndUpdate({ uuid }, { isDeleted: false });

    restaurant.current_dishes.push({
      dish_id: dish.uuid,
      source: "restaurant"
    })
    restaurant.previous_dishes = restaurant?.previous_dishes?.filter(w => w.dish_id !== uuid);
    await restaurant.save();

    const result = await restoreLessons(uuid);
    if (!result) return res.status(200).json({ message: "Lessons are not restored, dish restored successfully" });

    await Log.create({
      user_uuid: req.user.uuid,
      action: "dish_restored",
      details: {
        description: `Dish ${dish.name} restored`,
        dish_uuid: dish.uuid,
      },
      role: req.user.role,
    });

    res.status(200).json({ message: "dish restored successfully" });
  } catch (error) {
    console.log(error, "error");
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

export const getDishAnalytics = async (req, res) => {
  try {
    const { user } = req;
    const { restaurant_uuid } = req.params;
    let dishes;
    let removedDishes;
    let recentDishUpdates;

    const assignedRestaurantUUIDs = req.user.assigned_restaurants.map(r => r.uuid);
    const ownerRestaurants = await Restaurant.find({ account_owner: user.uuid });
    const ownerRestaurantUUIDs = ownerRestaurants.map(r => r.uuid);
    const allRestaurantUUIDs = Array.from(new Set([...assignedRestaurantUUIDs, ...ownerRestaurantUUIDs]));
    dishes = await Dish.find({ restaurant_uuid: restaurant_uuid }).sort({ createdAt: -1 });
    removedDishes = await Dish.find({ isDeleted: true, restaurant_uuid: restaurant_uuid }).sort({ createdAt: -1 });
    const allDishes = [...dishes, ...removedDishes]
    recentDishUpdates = await Log.find({
      action: { $in: ["dish_created", "dish_updated", "dish_archived", "dish_restored"] },
      "details.dish_uuid": { $in: allDishes.map(d => d.uuid) }
    }).sort({ createdAt: -1 }).populate({
      path: "user_uuid",
      model: "User",
      match: { uuid: { $exists: true } },
      localField: "user_uuid",
      foreignField: "uuid",
      select: "first_name last_name"
    });

    const dishesWithRestaurant = await Promise.all(
      dishes.map(async (dish) => {
        if (dish.restaurant_uuid) {
          const restaurant = await Restaurant.findOne({ uuid: dish.restaurant_uuid }).select("name");
          if (restaurant) {
            return { ...dish.toObject(), restaurantname: restaurant.name };
          }
        }
        return dish.toObject(); // If no restaurant_uuid, return dish as is
      })
    );

    const totalDishes = dishesWithRestaurant.length;
    const newDishesInThirtyDays = dishesWithRestaurant.filter(dish => {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      return new Date(dish.createdAt) > thirtyDaysAgo;
    }).length;

    const removedDishesInThirtyDays = removedDishes.filter(dish => {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      return new Date(dish.createdAt) > thirtyDaysAgo;
    }).length;

    const lastUpdatedDish = dishesWithRestaurant.reduce((latest, current) => {
      return new Date(current.updatedAt) > new Date(latest.updatedAt) ? current : latest;
    }, dishesWithRestaurant[0]);

    const mainCourseDishPercentage = dishesWithRestaurant.filter((dish) => (
      dish.type[0].toLowerCase() === "main course"
    )).length / totalDishes * 100 || 0;

    const appetizerDishPercentage = dishesWithRestaurant.filter((dish) => (
      dish.type[0].toLowerCase() === "appetizer"
    )).length / totalDishes * 100 || 0;

    const dessertDishPercentage = dishesWithRestaurant.filter((dish) => (
      dish.type[0].toLowerCase() === "dessert"
    )).length / totalDishes * 100 || 0;

    const specialDishPercentage = dishesWithRestaurant.filter((dish) => (
      dish.type[0].toLowerCase() === "special"
    )).length / totalDishes * 100 || 0;

    const vegetarianDishes = dishesWithRestaurant.filter((dish) => (
      dish.dietary_restrictions.lifestyle.includes("vegetarian")
    ));

    const veganDishes = dishesWithRestaurant.filter((dish) => (
      dish.dietary_restrictions.lifestyle.includes("vegan")
    ));

    const gluttenFreeDishes = dishesWithRestaurant.filter((dish) => (
      dish.accommodations.includes("Gluten-free")
    ));

    const nuttFreeDishes = dishesWithRestaurant.filter((dish) => (
      dish.accommodations.includes("Nut-free")
    ));

    const glutenCommonAllergenDishes = dishesWithRestaurant.filter((dish) => (
      dish.dietary_restrictions.health.includes("Gluten")
    ));





    res.status(200).json({
      totalDishes,
      newDishesInThirtyDays,
      removedDishesInThirtyDays,
      lastUpdatedDish: lastUpdatedDish?.name || "",
      mainCourseDishPercentage,
      appetizerDishPercentage,
      dessertDishPercentage,
      specialDishPercentage,
      vegetarianDishes: vegetarianDishes?.length,
      veganDishes: veganDishes?.length,
      gluttenFreeDishes: gluttenFreeDishes?.length,
      nuttFreeDishes: nuttFreeDishes?.length,
      glutenCommonAllergenDishes: glutenCommonAllergenDishes?.length,
      recentDishUpdates
    });
  } catch (error) {
    console.log(error, "error");
    res.status(500).json({ message: "Server error", error: error.message });
  }
};
