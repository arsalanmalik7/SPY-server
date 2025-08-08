import mongoose from "mongoose";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import validDishTypes from "../config/dishTypes.mjs";
import { generateLessonsForRestaurant, generateLessonForNewTemplate } from "../services/lessonCreate.mjs";
import * as XLSX from 'xlsx';
import { Log } from "../schema/logschema.mjs";
import nodemailer from 'nodemailer';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, "../../.env") });

const MONGO_URI = process.env.DEVELOPMENT_URI || "mongodb://localhost:27017/restaurantDB";

import { User } from "../schema/userschema.mjs";
import { Restaurant } from "../schema/restaurantschema.mjs";
import { Dish } from "../schema/dishschema.mjs";
import { GlobalWine } from "../schema/wineschema.mjs";
import { Menu } from "../schema/menuschema.mjs";
import { Lesson } from "../schema/lessonschema.mjs";
import { LessonTemplate } from "../schema/lessonTemplate.mjs";

// Utility function to shuffle array
const shuffle = (array) => {
    const newArray = [...array];
    for (let i = newArray.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [newArray[i], newArray[j]] = [newArray[j], newArray[i]];
    }
    return newArray;
};

// Function to generate price options with variations
const generatePriceOptions = (price, variation) => {
    const options = new Set();
    options.add(price.toString());

    while (options.size < 4) {
        const variationAmount = Math.floor(Math.random() * variation);
        const isAdd = Math.random() > 0.5;
        const newPrice = isAdd ? price + variationAmount : price - variationAmount;
        if (newPrice > 0) {
            options.add(newPrice.toString());
        }
    }
    return shuffle(Array.from(options));
};

// Function to generate price range options
const generatePriceRangeOptions = (priceRange, variation) => {
    const [min, max] = priceRange;
    const options = new Set();
    options.add(`${min}-${max}`);

    while (options.size < 4) {
        const variationAmount = Math.floor(Math.random() * variation);
        const isAdd = Math.random() > 0.5;
        const newMin = isAdd ? min + variationAmount : min - variationAmount;
        const newMax = isAdd ? max + variationAmount : max - variationAmount;
        if (newMin > 0 && newMax > newMin) {
            options.add(`${newMin}-${newMax}`);
        }
    }
    return shuffle(Array.from(options));
};

// Function to generate options for a question
const generateQuestionOptions = (question, restaurant, dishId, config, dishes) => {
    if (!question.options_variable || !question.correct_answer_variable) {
        return question;
    }

    console.log("dishId, dishes ", dishId, dishes);
    let dish;

    let currentType = "";

    // Dish processing if dishId exists
    if (dishId) {
        const currentDish = restaurant.current_dishes.find(d => d.dish_id === dishId);
        if (!currentDish) return question;

        dish = dishes?.find(d => d.uuid === currentDish.dish_id);
        if (!dish || !dish.type || !dish.type[0]) return question;

        currentType = dish.type[0];

        if (question.repeat_for.source === "link_to_restaurant.current_dishes" && question.repeat_for.key_variable === "dish_id") {
            question.repeat_for.key_variable = dishId;
        }
    }

    // Handle price-related questions
    if (question.options_variable.source?.startsWith('generatePriceOptions')) {
        const price = dish?.price;
        const variation = parseInt(question.options_variable.source.match(/\d+/)[0]);
        let options = generatePriceOptions(price, variation);
        let correctAnswer = price?.toString();

        if (question.options_variable.source === 'generatePriceOptions') {
            options = generatePriceOptions(price, variation);
            correctAnswer = price?.toString();
        }

        if (question.options_variable.source === 'generatePriceRangeOptions') {
            const courseType = question.placeholders?.food_course;
            if (!courseType) return question;

            const dishesOfType = restaurant.current_dishes
                .filter(d => dishes.find(dish => dish.uuid === d.dish_id)?.type?.includes(courseType))
                .map(d => dishes.find(dish => dish.uuid === d.dish_id)?.price)
                .filter(price => price !== undefined);

            if (dishesOfType.length === 0) return question;

            const priceRange = [Math.min(...dishesOfType), Math.max(...dishesOfType)];
            const variation = parseInt(question.options_variable.source.match(/\d+/)[0]);
            options = generatePriceRangeOptions(priceRange, variation);
            console.log("options", options);
            correctAnswer = `${priceRange[0]}-${priceRange[1]}`;
        }

        if (question.options_variable.source === 'config.validDishTypes') {
            const availableTypes = config.validDishTypes.filter(type => type !== currentType);
            const shuffledTypes = shuffle(availableTypes);
            options = shuffle([...shuffledTypes.slice(0, question.options_variable.limit || 3), currentType]);
            correctAnswer = currentType;
        }

        if (Array.isArray(question.options_variable)) {
            options = question.options_variable;
            correctAnswer = Array.isArray(question.correct_answer_variable) ?
                question.correct_answer_variable[0] : '';
        }

        const question_text = question.question_text.replace(/{(.*?)}/g, (_, key) => {
            if (key === 'dish_name' && dishId) return dishes.find(d => d.uuid === dishId)?.name || '';
            if (key === 'food_course') {
                return question.placeholders?.food_course || '';
            }
            return '';
        });

        return {
            ...question,
            question_text,
            options_variable: options,
            correct_answer_variable: [correctAnswer],
            placeholders: {
                ...question.placeholders,
                dish_name: dishId ? dishes.find(d => d.uuid === dishId)?.name : '',
                food_course: question.placeholders?.food_course || ''
            }
        };
    }

    // Generate options
    let options = [];
    if (question.options_variable.source === 'config.validDishTypes') {
        const availableTypes = config.validDishTypes.filter(type => type !== currentType);
        const shuffledTypes = shuffle(availableTypes);
        options = shuffle([...shuffledTypes.slice(0, question.options_variable.limit || 3), currentType]);
    } else if (Array.isArray(question.options_variable)) {
        options = question.options_variable; // If already array
    }

    // Generate correct answer
    let correctAnswer = "";
    if (question.correct_answer_variable.source === "current_dish.type") {
        correctAnswer = currentType;
    } else if (Array.isArray(question.correct_answer_variable)) {
        correctAnswer = question.correct_answer_variable[0]; // Already provided
    }

    const question_text = question.question_text.replace(/{(.*?)}/g, (_, key) => {
        if (key === 'dish_name' && dishId) return dishes.find(d => d.uuid === dishId)?.name || '';
        if (key === 'food_course') {
            return question.placeholders?.food_course || '';
        }
        return '';
    });

    return {
        ...question,
        question_text,
        options_variable: options,
        correct_answer_variable: [correctAnswer],
        placeholders: {
            ...question.placeholders,
            dish_name: dishId ? dishes.find(d => d.uuid === dishId)?.name : '',
            food_course: question.placeholders?.food_course || ''
        }
    };
};


const loadJSONData = async (filePath) => {
    try {
        const data = await fs.readFile(filePath, "utf8");
        return JSON.parse(data);
    } catch (err) {
        console.error("Error reading JSON file:", err);
        throw err;
    }
};

const insertDataDynamically = async (data) => {

    try {

        const bulkUploadType = data?.bulkUploadType
        if (bulkUploadType === "user") {

            const users = await User.insertMany(data.users);
            const userUUIDMap = Object.fromEntries(users.map(user => [user.uuid, user.uuid]));

            const restaurants = await Restaurant.find({});

            await Promise.all(restaurants.map(restaurant =>
                Restaurant.updateOne({ uuid: restaurant.uuid }, {
                    account_owner: userUUIDMap[restaurant.account_owner] || restaurant.account_owner,
                    directors: restaurant.directors.map(uuid => userUUIDMap[uuid] || uuid),
                    managers: restaurant.managers.map(uuid => userUUIDMap[uuid] || uuid),
                    employees: restaurant.employees.map(uuid => userUUIDMap[uuid] || uuid),
                })
            ));


        } else if (bulkUploadType === "restaurant") {

            const restaurantsNames = data.restaurants.map(r => r.name);
            const restaurantsAddresses = data.restaurants.map(r => r.address);
            const existingRestaurants = await Restaurant.find({
                $or: [
                    { name: { $in: restaurantsNames } },
                    { address: { $in: restaurantsAddresses } }
                ]
            });
            

            const restaurants = await Restaurant.insertMany(data.restaurants);
            const restaurantUUIDMap = Object.fromEntries(restaurants.map(restaurant => [restaurant.uuid, restaurant.uuid]));

            // Collect all user UUIDs from directors, managers, and employees
            const allUserUUIDs = new Set();
            data.restaurants.forEach(r => {
                (r.directors || []).forEach(uuid => allUserUUIDs.add(uuid));
                (r.managers || []).forEach(uuid => allUserUUIDs.add(uuid));
                (r.employees || []).forEach(uuid => allUserUUIDs.add(uuid));
            });

            // Find all users by UUID
            const users = await User.find({ uuid: { $in: Array.from(allUserUUIDs) } });

            // Update each user's assigned_restaurants to include the new restaurant UUIDs
            await Promise.all(users.map(async user => {
                // Find all restaurants this user is assigned to in the new data
                const assignedRestaurants = data.restaurants
                    .filter(r => (r.directors || []).includes(user.uuid) || (r.managers || []).includes(user.uuid) || (r.employees || []).includes(user.uuid))
                    .map(r => r.uuid);
                // Merge with existing assigned_restaurants, avoiding duplicates
                const updatedAssigned = Array.from(new Set([...(user.assigned_restaurants || []), ...assignedRestaurants]));
                user.assigned_restaurants = updatedAssigned;
                await user.save();
            }));

        } else if (bulkUploadType === "dish") {
            // Transform Excel/CSV row data to match Dish schema
            const rawDishes = Array.isArray(data.dishes) ? data.dishes : Object.values(data).filter(row => row.name);
            const dishes = rawDishes.map(row => {
                // Helper to split and trim comma-separated fields
                const splitAndTrim = val => typeof val === 'string' ? val.split(',').map(s => s.trim()).filter(Boolean) : Array.isArray(val) ? val : [];
                // Dietary restrictions
                const dietary_restrictions = {
                    health: splitAndTrim(row['dietary_restrictions.health']),
                    belief: splitAndTrim(row['dietary_restrictions.belief']),
                    lifestyle: splitAndTrim(row['dietary_restrictions.lifestyle'])
                };
                return {
                    restaurant_uuid: data?.restaurant_uuid,
                    name: row.name,
                    description: row.description,
                    type: splitAndTrim(row.type),
                    price: Number(row.price),
                    ingredients: splitAndTrim(row.ingredients),
                    accommodations: splitAndTrim(row.accommodations),
                    allergens: splitAndTrim(row.allergens),
                    temperature: row.temperature,
                    dietary_restrictions,
                    can_substitute: (typeof row?.can_substitute === 'string' ? row?.can_substitute.toLowerCase() === 'yes' : !!row?.can_substitute),
                    substitutions: row?.substitutions || '',
                    substitution_notes: row?.substitution_notes || '',
                    image_url: row?.image_url && row?.image_url.trim() !== '' ? row?.image_url : '/uploads/default_image_food.jpg',
                    notes: row.notes || '',
                    status: true
                };
            });
            // Filter out dishes that already exist by name (case-insensitive)
            const existingDishNames = new Set((await Dish.find({}, 'name')).map(d => d.name.toLowerCase()));

            // Only include dishes where the restaurant exists
            const restaurantUUIDs = new Set((await Restaurant.find({}, 'uuid')).map(r => r.uuid));

            const filteredDishes = dishes.filter(dish => !existingDishNames.has(dish.name.toLowerCase()) && restaurantUUIDs.has(dish.restaurant_uuid));
            const newDishes = await Dish.insertMany(filteredDishes);

            console.log(newDishes, "newDishes");

            // Add new dishes to each restaurant's current_dishes
            let uploadErrors = [];
            let successfulDishes = [];
            let failedDishes = [];
            for (const dish of newDishes) {
                try {
                    await Restaurant.updateOne(
                        { uuid: dish.restaurant_uuid },
                        { $addToSet: { current_dishes: { dish_id: dish.uuid, source: "restaurant" } } }
                    );
                    // Log dish creation
                    await Log.create({
                        user_uuid: data?.user_uuid || null,
                        role: data?.role || "system",
                        action: "dish_created",
                        details: {
                            description: `${dish.name} added (bulk upload)`,
                            dish_uuid: dish.uuid,
                        },
                    });
                    successfulDishes.push(dish);
                } catch (err) {
                    failedDishes.push(dish);
                    uploadErrors.push(`Dish: ${dish.name} - ${err.message}`);
                }
            }

            await Promise.all(
                newDishes.map(async (dish) => {
                    const generateLessons = await generateLessonsForRestaurant("food", dish.restaurant_uuid, dish);

                })
            );

            // Send summary email to uploader
            if (data?.user_email && data?.user_name) {

                const transporter = nodemailer.createTransport({
                    service: "Gmail",
                    auth: {
                        user: process.env.MAILTRAP_USER,
                        pass: process.env.MAILTRAP_PASS,
                    },
                });
                const reportText = `Bulk Upload Report\n\nSuccessful uploads: ${successfulDishes.length}\nFailed uploads: ${failedDishes.length}\n\nErrors:\n${uploadErrors.join('\n')}`;
                await transporter.sendMail({
                    from: process.env.SMTP_USER,
                    to: data.user_email,
                    subject: "Bulk Upload Summary",
                    html: `
                        <div style="font-family:Arial,sans-serif;font-size:15px;">
                            <p>Hi ${data.user_name},</p>
                            <p>Your recent bulk upload has completed. Here is a summary:</p>
                            <ul>
                                <li>Successful uploads: ${successfulDishes.length}</li>
                                <li>Failed uploads: ${failedDishes.length}</li>
                                <li>Errors: ${uploadErrors.length > 0 ? uploadErrors.join('<br/>') : 'None'}</li>
                            </ul>
                            <p>Please review the attached report for more information.</p>
                            <p>Best regards,<br/>The Speak Your Menu Team</p>
                        </div>
                    `,
                    attachments: [
                        {
                            filename: 'bulk_upload_report.txt',
                            content: reportText
                        }
                    ]
                });
            }

        } else if (bulkUploadType === "wine") {

            // Transform Excel/CSV row data to match GlobalWine schema
            const wineStyles = [
                {
                    name: "Fruit Driven Sparkling",
                    category: "Sparkling",
                    body: "Light - Medium",
                    texture: "Light - Medium, Fresh",
                    flavorIntensity: "Light - Medium, Crisp & Fruity",
                },
                {
                    name: "Fresh, Unoaked White",
                    category: "White",
                    body: "Light - Medium",
                    texture: "Crisp, Refreshing",
                    flavorIntensity: "Light - Medium, Mild",
                },
                {
                    name: "Mild, Mannered Red",
                    category: "Red",
                    body: "Light - Medium",
                    texture: "Low Tannin, Gentle",
                    flavorIntensity: "Light - Medium, Subtle, Refreshing",
                },
                {
                    name: "Aromatic Orange",
                    category: "Orange",
                    body: "Light - Medium",
                    texture: "Low Tannin, Crisp",
                    flavorIntensity: "Medium - High, Refreshing",
                },
                {
                    name: "Blush Rose",
                    category: "Rose",
                    body: "Light - Medium",
                    texture: "Light - Medium, Viscous",
                    flavorIntensity: "Medium - High, Slightly Sweet to Sweet",
                },
                {
                    name: "Sparkling Dessert",
                    category: "Dessert",
                    body: "Light - Medium",
                    texture: "Light - Medium, Fresh",
                    flavorIntensity: "Light - Medium, Luscious Fruit",
                },
            ];

            const rawWines = Array.isArray(data.wines) ? data.wines : Object.values(data).filter(row => row.producer_name && row.product_name);
            const splitAndTrim = val => typeof val === 'string' ? val.split(',').map(s => s.trim()).filter(Boolean) : Array.isArray(val) ? val : [];
            const wines = rawWines.map(row => {
                // Region object
                const region = {
                    country: row.country || '',
                    region: row.region || '',
                    sub_region: row.sub_region || '',
                    commune_appellation: row.commune_appellation || '',
                    vineyard: row.vineyard || ''
                };
                // Style object
                const style = wineStyles.find((ws) => (ws.category === row.category))
                // Offering object
                const offering = {
                    by_the_glass: (typeof row.by_the_glass === 'string' ? row.by_the_glass.toLowerCase() === 'yes' : !!row.by_the_glass),
                    by_the_bottle: (typeof row.by_the_bottle === 'string' ? row.by_the_bottle.toLowerCase() === 'yes' : !!row.by_the_bottle),
                    glass_price: row.glass_price && !isNaN(Number(row.glass_price)) ? Number(row.glass_price) : undefined,
                    bottle_price: row.bottle_price && !isNaN(Number(row.bottle_price)) ? Number(row.bottle_price) : undefined
                };
                return {
                    producer_name: row.producer_name,
                    product_name: row.product_name,
                    varietals: splitAndTrim(row.varietals),
                    region,
                    vintage: Number(row.vintage),
                    category: row.category ? row.category : '',
                    sub_category: row.sub_category || '',
                    is_filtered: (typeof row.is_filtered === 'string' ? row.is_filtered.toLowerCase() === 'yes' : !!row.is_filtered),
                    has_residual_sugar: (typeof row.has_residual_sugar === 'string' ? row.has_residual_sugar.toLowerCase() === 'yes' : !!row.has_residual_sugar),
                    is_organic: (typeof row.is_organic === 'string' ? row.is_organic.toLowerCase() === 'yes' : !!row.is_organic),
                    is_biodynamic: (typeof row.is_biodynamic === 'string' ? row.is_biodynamic.toLowerCase() === 'yes' : !!row.is_biodynamic),
                    is_vegan: (typeof row.is_vegan === 'string' ? row.is_vegan.toLowerCase() === 'yes' : !!row.is_vegan),
                    offering,
                    restaurant_uuid: data?.restaurant_uuid,
                    style,
                    image_url: row.image_url && row.image_url.trim() !== '' ? row.image_url : '/uploads/default_image_wine.jpg',
                    notes: row.notes || '',
                    status: true
                };
            });



            // Filter out wines that already exist by product_name, producer_name, and vintage
            const existingWines = await GlobalWine.find({}, 'product_name producer_name vintage');
            const restaurantUUIDs = new Set((await Restaurant.find({}, 'uuid')).map(r => r.uuid));
            const existingWineKeys = new Set(existingWines.map(w => `${w.product_name.toLowerCase()}|${w.producer_name.toLowerCase()}|${w.vintage}`));
            const filteredWines = wines.filter(wine => {
                const key = `${wine.product_name.toLowerCase()}|${wine.producer_name.toLowerCase()}|${wine.vintage}`;
                return !existingWineKeys.has(key) && restaurantUUIDs.has(wine.restaurant_uuid);
            });
            const insertedWines = await GlobalWine.insertMany(filteredWines);


            // Add new wines to each restaurant's 
            let uploadErrors = [];
            let successfulWines = [];
            let failedWines = [];
            for (const wine of insertedWines) {
                try {
                    await Restaurant.updateOne(
                        { uuid: wine.restaurant_uuid },
                        { $addToSet: { current_wines: { global_id: wine.uuid, source: "restaurant" } } }
                    );
                    // Log wine creation
                    await Log.create({
                        user_uuid: data?.user_uuid || null,
                        role: data?.role || "system",
                        action: "wine_created",
                        details: {
                            description: `${wine.product_name} added (bulk upload)`,
                            wine_uuid: wine.uuid,
                        },
                    });
                    successfulWines.push(wine);
                } catch (err) {
                    failedWines.push(wine);
                    uploadErrors.push(`Wine: ${wine.product_name} - ${err.message}`);
                }
            }

            // Generate wine lessons
            await Promise.all(
                insertedWines.map(async (wine) => {
                    const generateLessons = await generateLessonsForRestaurant("wine", wine.restaurant_uuid, wine);
                    console.log(generateLessons, "generatedLessons");

                })
            );

            // Send summary email to uploader
            if (data?.user_email && data?.user_name) {

                const transporter = nodemailer.createTransport({
                    service: "Gmail",
                    auth: {
                        user: process.env.MAILTRAP_USER,
                        pass: process.env.MAILTRAP_PASS,
                    },
                });
                const reportText = `Bulk Upload Report\n\nSuccessful uploads: ${successfulWines.length}\nFailed uploads: ${failedWines.length}\n\nErrors:\n${uploadErrors.join('\n')}`;
                await transporter.sendMail({
                    from: process.env.SMTP_USER,
                    to: data.user_email,
                    subject: "Bulk Upload Summary",
                    html: `
                        <div style="font-family:Arial,sans-serif;font-size:15px;">
                            <p>Hi ${data.user_name},</p>
                            <p>Your recent bulk upload has completed. Here is a summary:</p>
                            <ul>
                                <li>Successful uploads: ${successfulWines.length}</li>
                                <li>Failed uploads: ${failedWines.length}</li>
                                <li>Errors: ${uploadErrors.length > 0 ? uploadErrors.join('<br/>') : 'None'}</li>
                            </ul>
                            <p>Please review the attached report for more information.</p>
                            <p>Best regards,<br/>The Speak Your Menu Team</p>
                        </div>
                    `,
                    attachments: [
                        {
                            filename: 'bulk_upload_report.txt',
                            content: reportText
                        }
                    ]
                });
            }

        } else if (bulkUploadType === "menu") {
            const formattedMenus = await Promise.all(data.menus.map(async menu => {
                const restaurant = await Restaurant.findOne({ uuid: menu.restaurant_uuid });

                await Restaurant.updateOne({ uuid: menu.restaurant_uuid }, {
                    menu: menu.uuid
                })

                return {
                    ...menu,
                    name: `${restaurant.name} menu`,
                    _id: new mongoose.Types.ObjectId()
                };
            }));


            const menus = await Menu.insertMany(formattedMenus)

        } else if (bulkUploadType === "lesson") {

            const capitalize = (str) => {
                if (!str) return '';
                return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
            };


            const category = data?.category;
            const unit = data?.unit;
            const unit_name = capitalize(data?.unit_name);
            const chapter = data?.chapter;
            const chapter_name = capitalize(data?.chapter_name);
            const difficulty = data?.difficulty
            const content = data?.content;
            const createdBy = data?.createdBy;
            const menu_items = data?.menu_items;
            const questions = data?.questions;


            const existingLessontemplate = await LessonTemplate.findOne({
                category: category,
                unit: unit,
                chapter: chapter,
            });

            if (existingLessontemplate) {
                throw new Error("Lesson already exist!");
            }

            const newLessonTemplate = await LessonTemplate.create({
                category: category,
                unit: unit,
                unit_name: unit_name,
                chapter: chapter,
                chapter_name: chapter_name,
                difficulty: difficulty,
                content: content,
                createdBy: createdBy,
                menu_items: menu_items,
                questions: questions,
            });

            const generateLessons = await generateLessonForNewTemplate(newLessonTemplate);
            console.log(generateLessons, "generatedLessons");
            return newLessonTemplate;



        }

    } catch (err) {
        console.error("Error inserting data dynamically:", err);
        throw err;
    }
};

export const importToDatabase = async (req, res) => {
    let filePath; // Declare outside to access it in finally
    try {
        const { bulkUploadType } = req.params;
        const restaurant_uuid = req?.body?.restaurant_uuid;

        const excel_sheet = req.file;

        if (!excel_sheet) {
            return res.status(400).json({ message: "No file uploaded" });
        }


        filePath = excel_sheet.path;

        // Read the file as a buffer
        const fileBuffer = await fs.readFile(filePath);
        let dataFile;
        if (filePath.endsWith('.xlsx') || filePath.endsWith('.xls') || filePath.endsWith('.csv')) {
            // Parse Excel file
            const workbook = XLSX.read(fileBuffer, { type: 'buffer' });
            const sheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[sheetName];
            dataFile = XLSX.utils.sheet_to_json(worksheet, { defval: "" });
        } else if (filePath.endsWith('.csv')) {
            // Parse CSV file
            const workbook = XLSX.read(fileBuffer, { type: 'buffer' });
            const sheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[sheetName];
            dataFile = XLSX.utils.sheet_to_json(worksheet, { defval: "" });
        } else if (filePath.endsWith('.json')) {
            // Parse JSON file
            const fileContent = fileBuffer.toString('utf-8');
            dataFile = JSON.parse(fileContent);
        } else {
            return res.status(400).json({ message: "Unsupported file format. Please upload .xlsx, .csv, or .json files." });
        }

        const configFile = validDishTypes;

        const data = {
            ...dataFile,
            restaurant_uuid: restaurant_uuid,
            role: req?.user?.role,
            user_uuid: req?.user?.uuid,
            user_name: `${req?.user?.first_name} ${req?.user?.first_name}`,
            user_email: req?.user?.email,
            config: {
                validDishTypes: configFile
            },
            bulkUploadType: bulkUploadType
        };

        console.log(data, "data");

        // Call your dynamic insert function here
        const result = await insertDataDynamically(data);

        return res.status(200).json({ message: "Data imported successfully" /*, result: result*/ });
    } catch (error) {
        console.error("Error:", error);
        return res.status(500).json({ message: "Error importing data", error: error.message });
    } finally {
        // ✅ Delete file whether success or failure
        if (filePath) {
            try {
                await fs.unlink(filePath);
                console.log(`File ${filePath} deleted successfully.`);
            } catch (deleteError) {
                console.error(`Error deleting file: ${deleteError.message}`);
            }
        }
    }
};


