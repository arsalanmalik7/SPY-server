import express from "express";
import { authMiddleware, checkPermission } from "../middleware/auth.mjs";
import { createWine, getAllWines, getWineById, updateWine, deleteWine, getDeletedWinesOfRestarant, restoreWine, getWineAnalytics } from "../controllers/wineController.mjs";
import upload from "../config/multerConfig.mjs";

const router = express.Router();

router.post("/create", authMiddleware, checkPermission("manage_wines"), upload.single("wine_Image"), createWine);
router.get("/", authMiddleware, getAllWines);
router.get("/analytics/:restaurant_uuid", authMiddleware, getWineAnalytics);
router.get("/deleted", authMiddleware, checkPermission("manage_wines"), getDeletedWinesOfRestarant);
router.get("/:uuid", authMiddleware, getWineById);
router.put("/restore/:uuid", authMiddleware, checkPermission("manage_wines"), restoreWine);
router.put("/:uuid", authMiddleware, checkPermission("manage_wines"), upload.single("wine_Image"), updateWine);
router.delete("/:uuid", authMiddleware, checkPermission("manage_wines"), deleteWine);

export default router;
