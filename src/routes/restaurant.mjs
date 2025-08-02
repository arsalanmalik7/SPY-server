import express from "express";
import { authMiddleware, checkPermission } from "../middleware/auth.mjs";
import {
    createRestaurant, getAllRestaurants, getRestaurantById, updateRestaurant,
    getDirectorRestaurants, getRestaurantEmployees, deleteRestaurant
} from "../controllers/restaurantController.mjs";

const router = express.Router();

// Restaurant CRUD
router.post("/create", authMiddleware, checkPermission("manage_restaurants"), createRestaurant);
router.get("/", authMiddleware, getAllRestaurants);
router.get("/:uuid", authMiddleware, getRestaurantById);
router.put("/:uuid", authMiddleware, checkPermission("manage_restaurants"), updateRestaurant);
router.delete("/:uuid", authMiddleware, checkPermission("manage_restaurants"), deleteRestaurant);

// Director-specific routes
router.get("/director/:directorId", authMiddleware, checkPermission("manage_restaurants"), getDirectorRestaurants);
router.get("/:uuid/employees", authMiddleware, checkPermission("manage_employees"), getRestaurantEmployees);

export default router;
