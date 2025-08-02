import express from "express";
import { authMiddleware, checkPermission } from "../middleware/auth.mjs";
import { 
  getRestaurantWines, 
  addWineToRestaurant, 
  updateRestaurantWine, 
  removeWineFromRestaurant 
} from "../controllers/restaurantWineController.mjs";

const router = express.Router();

// Get all wines for a restaurant
router.get("/restaurant/:restaurantId", authMiddleware, getRestaurantWines);

// Add a wine to a restaurant
router.post("/", authMiddleware, checkPermission("manage_wines"), addWineToRestaurant);

// Update a restaurant-wine relationship (e.g., price, active status)
router.put("/:uuid", authMiddleware, checkPermission("manage_wines"), updateRestaurantWine);

// Remove a wine from a restaurant (doesn't delete from global catalog)
router.delete("/:uuid", authMiddleware, checkPermission("manage_wines"), removeWineFromRestaurant);

export default router; 