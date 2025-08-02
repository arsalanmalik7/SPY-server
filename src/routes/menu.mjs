import express from "express";
import { authMiddleware, checkPermission } from "../middleware/auth.mjs";
import { createMenu, getAllMenus, getMenuById, updateMenu } from "../controllers/menuController.mjs";

const router = express.Router();

router.post("/create", authMiddleware, checkPermission("manage_menus"), createMenu);
router.get("/", authMiddleware, getAllMenus);
router.get("/:uuid", authMiddleware, getMenuById);
router.put("/:uuid", authMiddleware, checkPermission("manage_menus"), updateMenu);

export default router;
