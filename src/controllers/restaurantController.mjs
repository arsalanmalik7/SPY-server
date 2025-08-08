import { Restaurant } from "../schema/restaurantschema.mjs";
import { Lesson } from "../schema/lessonschema.mjs";
import { User } from "../schema/userschema.mjs";
import { Menu } from "../schema/menuschema.mjs";
import { Log } from "../schema/logschema.mjs";
import { v4 as uuidv4 } from "uuid";

export const createRestaurant = async (req, res) => {
    try {
        const { name, address, directors, managers, employees, subscription_status, subscription_plan, menu, allow_manager_modifications, phone, status, cuisine_type } = req.body;
        const account_owner = req.user.uuid;

        console.log("Creating restaurant with data:", address);


        const user = await User.findOne({ uuid: account_owner });

        if (!user) {
            await Log.create({
                uuid: uuidv4(),
                user_uuid: account_owner,
                action: "create_restaurant_failed",
                details: { reason: "User not found" },
                role: user?.role || "unknown",
                restaurant_uuid: null,
                timestamp: new Date()
            });
            return res.status(404).json({ message: "User not found" });
        }

        // Managers should NOT be able to create restaurants
        const allowedRoles = ["super_admin", "director", "manager"];

        if (!allowedRoles.includes(user.role)) {
            await Log.create({
                uuid: uuidv4(),
                user_uuid: account_owner,
                action: "create_restaurant_failed",
                details: { reason: "Insufficient permissions" },
                role: user.role,
                restaurant_uuid: null,
                timestamp: new Date()
            });
            return res.status(403).json({ message: "You do not have permission to create a restaurant." });
        }

        const existingRestaurant = await Restaurant.findOne({ name, address });
        if (existingRestaurant) {
            await Log.create({
                uuid: uuidv4(),
                user_uuid: account_owner,
                action: "create_restaurant_failed",
                details: { reason: "Restaurant already exists" },
                role: user.role,
                restaurant_uuid: null,
                timestamp: new Date()
            });
            return res.status(400).json({ message: "A restaurant with this name and address already exists." });
        }

        const newRestaurant = new Restaurant({
            name,
            address,
            phone,
            account_owner,
            directors,
            managers,
            employees,
            subscription_status,
            subscription_plan,
            menu,
            allow_manager_modifications,
            status,
            cuisine_type:cuisine_type
        });
        await newRestaurant.save();

        const assignedUsers = [...directors, ...managers, ...employees];
        const validUsers = await User.find({ uuid: { $in: assignedUsers } });


        await User.updateMany(
            { uuid: { $in: validUsers.map(user => user.uuid) } },
            { $addToSet: { assigned_restaurants: newRestaurant.uuid } }
        );

        await User.updateMany(
            { role: "super_admin" },
            { $addToSet: { assigned_restaurants: newRestaurant.uuid } }
        )

        if (req.user.role === "director") {
            await User.updateOne(
                { uuid: req.user.uuid },
                { $addToSet: { assigned_restaurants: newRestaurant.uuid } }
            )
        }

        // Log successful restaurant creation
        await Log.create({
            uuid: uuidv4(),
            user_uuid: account_owner,
            action: "create_restaurant_success",
            details: {
                restaurant_uuid: newRestaurant.uuid,
                name: newRestaurant.name,
                assigned_users_count: validUsers.length
            },
            role: user.role,
            restaurant_uuid: newRestaurant.uuid,
            timestamp: new Date()
        });

        res.status(201).json({ message: "Restaurant created successfully", restaurant: newRestaurant });
    } catch (error) {
        console.error("Error creating restaurant:", error);
        await Log.create({
            uuid: uuidv4(),
            user_uuid: req.user?.uuid || null,
            action: "create_restaurant_error",
            details: { error: error.message },
            role: req.user?.role || "unknown",
            restaurant_uuid: null,
            timestamp: new Date()
        });
        res.status(500).json({ message: "Server error", error: error.message });
    }
};

export const getAllRestaurants = async (req, res) => {
    try {
        const user = await User.findOne({ uuid: req.user.uuid });

        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }
        const role = req.user.role;
        let restaurants;
        if (role === "super_admin") {
            restaurants = await Restaurant.find({}).sort({ createdAt: -1 });
        } else {

            // Get restaurants where user is assigned or is the account owner
            const assignedRestaurants = await Restaurant.find({ uuid: { $in: user.assigned_restaurants } });
            const ownerRestaurants = await Restaurant.find({ account_owner: req.user.uuid });
            // Merge and remove duplicates by uuid
            const allRestaurantsMap = new Map();
            assignedRestaurants.concat(ownerRestaurants).forEach(r => {
                allRestaurantsMap.set(r.uuid, r);
            });
            restaurants = Array.from(allRestaurantsMap.values()).sort((a, b) => b.createdAt - a.createdAt);

            if (restaurants.length === 0) {
                return res.status(404).json({ message: "No restaurants found" });
            }
        }

        // Manually fetch user details
        const userUuids = restaurants.flatMap(r => [r.account_owner, ...r.directors, ...r.managers, ...r.employees]);
        const users = await User.find({ uuid: { $in: userUuids } }).select("uuid first_name last_name email role active");

        // Convert user array into an object for quick lookup
        const userMap = users.reduce((acc, user) => {
            acc[user.uuid] = user;
            return acc;
        }, {});



        // Attach user details
        const enrichedRestaurants = restaurants.map((r) => {
            return {
                ...r.toObject(),
                account_owner: userMap[r.account_owner] || null,
                directors: r.directors.map(uuid => userMap[uuid] || null),
                managers: r.managers.map(uuid => userMap[uuid] || null),
                employees: r.employees.map(uuid => userMap[uuid] || null),
            }
        });

        res.status(200).json(enrichedRestaurants);
    } catch (error) {
        console.error("Error fetching restaurants:", error);
        res.status(500).json({ message: "Server error", error: error.message });
    }
};

export const getRestaurantById = async (req, res) => {
    try {
        const { uuid } = req.params;


        // Fetch the restaurant by UUID
        const restaurant = await Restaurant.findOne({ uuid });
        if (!restaurant) {
            return res.status(404).json({ message: "Restaurant not found" });
        }

        // Collect all user UUIDs
        const userUuids = [
            restaurant.account_owner,
            ...restaurant.directors,
            ...restaurant.managers,
            ...restaurant.employees
        ].filter(Boolean); // Remove null/undefined values

        // Fetch user details using UUIDs
        const users = await User.find({ uuid: { $in: userUuids } }).select("uuid first_name last_name email role");

        // Create a lookup map by UUID
        const userMap = users.reduce((acc, user) => {
            acc[user.uuid] = user;
            return acc;
        }, {});

        // Enrich the restaurant document with user details
        const enrichedRestaurant = {
            ...restaurant.toObject(),
            account_owner: userMap[restaurant.account_owner] || null,
            directors: restaurant.directors.map(uuid => userMap[uuid] || null),
            managers: restaurant.managers.map(uuid => userMap[uuid] || null),
            employees: restaurant.employees.map(uuid => userMap[uuid] || null)
        };

        res.status(200).json(enrichedRestaurant);
    } catch (error) {
        console.error("Error fetching restaurant:", error);
        res.status(500).json({ message: "Server error", error: error.message });
    }
};

export const updateRestaurant = async (req, res) => {
    try {
        const {
            name,
            address,
            phone,
            directors,
            managers,
            employees,
            subscription_status,
            subscription_plan,
            allow_manager_modifications,
            menu,
            status,
            cuisine_type,
        } = req.body;

        console.log(req.body);



        const restaurant = await Restaurant.findOne({ uuid: req.params.uuid });

        if (!restaurant) {
            return res.status(404).json({ message: "Restaurant not found" });
        }

        const user = await User.findOne({ uuid: req.user.uuid });

        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }

        if (user.role !== "super_admin" && (user.role === "director" || user.role === "manager") && !user.assigned_restaurants.includes(restaurant.uuid)) {
            return res.status(403).json({ message: "You are not assigned to this restaurant and cannot update it." });
        }

        // Update restaurant details
        if (name) restaurant.name = name;
        if (address) restaurant.address = address;
        if (phone) restaurant.phone = phone;
        if (directors) restaurant.directors = Array.from(new Set([...(restaurant.directors || []), ...directors]));
        if (managers) restaurant.managers = Array.from(new Set([...(restaurant.managers || []), ...managers]));
        if (employees) restaurant.employees = Array.from(new Set([...(restaurant.employees || []), ...employees]));
        if (subscription_status) restaurant.subscription_status = subscription_status;
        if (subscription_plan) restaurant.subscription_plan = subscription_plan;
        if (status) restaurant.status = status;
        if (cuisine_type) restaurant.cuisine_type = cuisine_type;

        // Handle menu update (using uuid instead of ObjectId)
        if (menu) {
            const existingMenu = await Menu.findOne({ uuid: menu }); // Find menu by uuid
            if (!existingMenu) {
                return res.status(404).json({ message: "Menu not found" });
            }
            restaurant.menu = menu; // Store the uuid instead of ObjectId
        }

        if (allow_manager_modifications !== undefined) {
            if (user.role === "super_admin" || user.role === "director" || user.role === "manager") {
                restaurant.allow_manager_modifications = allow_manager_modifications;
            } else {
                return res.status(403).json({ message: "You do not have permission to modify this setting." });
            }
        }

        await restaurant.save();

        // Return the UUID in the expected format
        res.status(200).json({
            message: "Restaurant updated successfully",
            // uuid: restaurant.uuid,
            // restaurant: restaurant.toObject()
        });
    } catch (error) {
        console.log(error, "error")
        res.status(500).json({ message: "Server error", error: error.message });
    }
};

export const deleteRestaurant = async (req, res) => {
    try {
        const { uuid } = req.params;

        // Find the restaurant by UUID
        const restaurant = await Restaurant.findOne({ uuid });
        if (!restaurant) {
            return res.status(404).json({ message: "Restaurant not found" });
        }

        // Delete the restaurant
        await Restaurant.deleteOne({ uuid });

        res.status(200).json({ message: "Restaurant deleted successfully" });
    } catch (error) {
        console.error("Error deleting restaurant:", error);
        res.status(500).json({ message: "Server error", error: error.message });
    }
};

export const getDirectorRestaurants = async (req, res) => {
    try {
        const { directorId } = req.params;

        const director = await User.findOne({ uuid: directorId });
        if (!director || director.role !== "director") {
            return res.status(404).json({ error: "Director not found" });
        }

        const restaurants = await Restaurant.find({ directors: directorId });
        return res.status(200).json(restaurants);
    } catch (error) {
        console.error(error);
        return res.status(500).json({ error: "Server error" });
    }
};

export const getRestaurantEmployees = async (req, res) => {
    try {
        const { restaurantUUID } = req.params;
        const employees = await User.find({ role: "employee", assigned_restaurants: restaurantUUID });

        res.status(200).json(employees);
    } catch (error) {
        res.status(500).json({ message: "Server error", error: error.message });
    }
};
