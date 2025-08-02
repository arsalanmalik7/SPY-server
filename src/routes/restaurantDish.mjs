import express from 'express';
import { authMiddleware, checkPermission } from '../middleware/auth.mjs';
import {
  addDishToRestaurant,
  removeDishFromRestaurant,
  getRestaurantDishes
} from '../controllers/restaurantDishController.mjs';

const router = express.Router();

// Add a dish to a restaurant
router.post('/', authMiddleware, checkPermission('manage_menu'), addDishToRestaurant);

// Get all dishes for a restaurant
router.get('/restaurant/:restaurant_id', authMiddleware, getRestaurantDishes);

// Remove a dish from a restaurant (doesn't delete from global catalog)
router.delete('/:uuid', authMiddleware, checkPermission('manage_menu'), removeDishFromRestaurant);

export default router; 