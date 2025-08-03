import express from "express";
import { authMiddleware, checkPermission } from "../middleware/auth.mjs";
import { createDish, getAllDishes, getDishById, updateDish, archiveDish, getAllDArchivedDishes, restoreDish, getDishAnalytics } from "../controllers/dishController.mjs";
import upload from "../config/multerConfig.mjs";

const router = express.Router();

router.post("/create", authMiddleware, checkPermission("manage_dishes"), upload.single("dish_Image"), createDish);
router.get("/", authMiddleware, getAllDishes);
router.get("/deleted", authMiddleware, checkPermission("manage_dishes"), getAllDArchivedDishes);
router.get("/analytics/:restaurant_uuid", authMiddleware, getDishAnalytics);
router.get("/:uuid", authMiddleware, getDishById);
router.put("/restore/:uuid", authMiddleware, checkPermission("manage_dishes"), restoreDish);
router.put("/:uuid", authMiddleware, checkPermission("manage_dishes"), upload.single("dish_Image"), updateDish);
router.delete("/:uuid", authMiddleware, checkPermission("manage_dishes"), archiveDish);

export default router;
