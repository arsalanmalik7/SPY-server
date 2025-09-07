import express from 'express';
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import morgan from 'morgan';
import { stripeWebhook } from './controllers/stripeController.mjs';
import userRoutes from './routes/user.mjs';
import lessonRoutes from './routes/lesson.mjs';
import restaurantRoutes from './routes/restaurant.mjs';
import menuRoutes from './routes/menu.mjs';
import dishRoutes from './routes/dish.mjs';
import wineRoutes from './routes/wine.mjs';
import analyticsRoutes from './routes/analytics.mjs';
import mainRoutes from './routes/index.mjs';
import badgeRoutes from "./routes/badge.mjs";
import bulkUploadRoutes from './routes/bulkUploadRoutes.mjs';
import restaurantWineRoutes from './routes/restaurantWine.mjs';
import restaurantDishRoutes from './routes/restaurantDish.mjs';
import stripeRoutes from './routes/stripe.mjs';

// Load environment variables
dotenv.config();

// Get the directory name
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors(
    {
        origin: ['http://localhost:3000', 'https://beauty.instantsolutionslab.site', 'http://beauty.instantsolutionslab.site'],
        methods: ['GET', 'POST', 'PUT', 'DELETE'],
        credentials: true,
    }
));

app.post('/api/stripe/webhook', express.raw({ type: 'application/json' }), stripeWebhook);

app.use(express.json());

app.use(morgan('dev'));

// Serve static files from the public directory
app.use('/public', express.static(path.join(__dirname, '../public/badges')));
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));
app.use('/Badges', express.static(path.join(__dirname, '../Badges')));

// Routes
app.use('/', mainRoutes);

app.use('/api/users', userRoutes);
app.use('/api/users', userRoutes);
app.use('/api/lessons', lessonRoutes);
app.use('/api/restaurants', restaurantRoutes);
app.use('/api/menus', menuRoutes);
app.use('/api/dishes', dishRoutes);
app.use('/api/wines', wineRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/badges', badgeRoutes);
app.use('/api/bulk-upload', bulkUploadRoutes);
app.use('/api/restaurant-wines', restaurantWineRoutes);
app.use('/api/restaurant-dishes', restaurantDishRoutes);
app.use('/api/stripe', stripeRoutes);

// Health check endpoint
app.get('/health', (req, res) => {
    console.log(req, "req");
    res.json({ status: 'ok' });
});

// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI || process.env.DEVELOPMENT_URI)
    .then(() => {
        console.log('Connected to MongoDB');
        app.listen(PORT, '0.0.0.0', () => {
            console.log(`Server is running on port ${PORT}`);
        });

    })
    .catch((error) => {
        console.error('MongoDB connection error:', error);
        process.exit(1);
    });

// Error handling middleware
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({ message: 'Something went wrong!' });
}); 