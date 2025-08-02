import express from "express";
import { welcomeMessage } from "../controllers/indexController.mjs";
import restaurantWineRoutes from "./restaurantWine.mjs";

const router = express.Router();

router.get("/", welcomeMessage);
router.use("/restaurant-wines", restaurantWineRoutes);

export default router;
