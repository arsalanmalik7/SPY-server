import express from "express";
import { authMiddleware, checkPermission } from "../middleware/auth.mjs";
import {
    getRestaurantLessonAnalytics,
    getCompanyAnalytics
} from "../controllers/analyticsController.mjs";

const router = express.Router();

// Restaurant-specific analytics
router.get("/restaurant/:restaurant_uuid", 
    authMiddleware, 
    checkPermission("view_progress"), 
    getRestaurantLessonAnalytics
);

// Company-wide analytics (Super Admin only)
router.get("/company", 
    authMiddleware, 
    checkPermission("view_progress"), 
    getCompanyAnalytics
);

export default router; 