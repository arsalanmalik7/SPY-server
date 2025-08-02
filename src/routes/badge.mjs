import express from "express";
import { authMiddleware, checkPermission } from "../middleware/auth.mjs";
import {
    getAllBadges,
    getUserBadges,
    assignBadge,
    removeBadge,
    getBadgeAnalytics
} from "../controllers/badgeController.mjs";

const router = express.Router();

// Get all available badges (Super Admin only)
router.get("/", 
    authMiddleware, 
    checkPermission("view_badges"), 
    getAllBadges
);

// Get user's badges
router.get("/user/:userId", 
    authMiddleware, 
    checkPermission("view_badges"), 
    getUserBadges
);

// Assign a badge to a user (Super Admin only)
router.post("/user/:userId", 
    authMiddleware, 
    checkPermission("manage_badges"), 
    assignBadge
);

// Remove a badge from a user (Super Admin only)
router.delete("/user/:userId/:badgeId", 
    authMiddleware, 
    checkPermission("manage_badges"), 
    removeBadge
);

// Get badge analytics (Super Admin only)
router.get("/analytics", 
    authMiddleware, 
    checkPermission("view_analytics"), 
    getBadgeAnalytics
);

export default router; 