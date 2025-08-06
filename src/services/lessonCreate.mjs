import { v4 as uuidv4 } from 'uuid';
// Helper to assign a unique uuid to each question
const assignQuestionUUIDs = (questions) => {
    return questions.map(q => ({
        ...q,
        // uuid: q.uuid || uuidv4()
    }));
};
import { Lesson } from "../schema/lessonschema.mjs";
import { User } from "../schema/userschema.mjs";
import { Restaurant } from "../schema/restaurantschema.mjs";
import { LessonTemplate } from "../schema/lessonTemplate.mjs";
import nodemailer from "nodemailer";

import { Dish } from "../schema/dishschema.mjs";
import validDishTypes from "../config/dishTypes.mjs";
import dietaryRestrictions from "../config/dietaryRestrictions.mjs";
import foodAllergens from "../config/foodAllergens.mjs";
import temperatureOptions from "../config/temperatureOptions.mjs";
import accommodationOptions from "../config/accommodationOptions.mjs";

import { GlobalWine } from "../schema/wineschema.mjs";
import wineStyles from "../config/wineStyles.mjs";
import wineCategories from "../config/wineCategories.mjs";

const transporter = nodemailer.createTransport({
    service: "Gmail",
    auth: {
        user: process.env.MAILTRAP_USER, // Your Mailtrap username
        pass: process.env.MAILTRAP_PASS, // Your Mailtrap password
    },
});

// Utility function to shuffle array
const shuffle = (array) => {
    const newArray = [...array];
    for (let i = newArray.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [newArray[i], newArray[j]] = [newArray[j], newArray[i]];
    }
    return newArray;
};

const formatter = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD'
});
// Utility function to generate price options
const generatePriceOptions = (price, variation) => {
    const options = new Set();


    options.add(formatter.format(price));

    while (options.size < 4) {
        const variationAmount = Math.floor(Math.random() * variation);
        const isAdd = Math.random() > 0.5;
        const newPrice = isAdd ? price + variationAmount : price - variationAmount;

        if (newPrice > 0) {
            options.add(formatter.format(newPrice));
        }
    }

    return shuffle(Array.from(options));
};

// Utility function to generate price range options
const generatePriceRangeOptions = (priceRange, variation) => {
    const [min, max] = priceRange;
    const options = new Set();
    options.add(`${min}-${max}`);

    const variationAmount = Math.floor(Math.random() * variation);
    const isAdd = Math.random() > 0.5;
    const newMin = isAdd ? min + variationAmount : min - variationAmount;
    const newMax = isAdd ? max + variationAmount : max - variationAmount;
    if (newMin > 0 && newMax > newMin) {
        options.add(`${newMin}-${newMax}`);
    }
    return shuffle(Array.from(options));
};

// Function to convert content object to Map
const convertContentToMap = (content) => {
    const contentMap = new Map();
    if (typeof content === 'object' && content !== null) {
        Object.entries(content).forEach(([key, value]) => {
            if (typeof value === 'string') {
                contentMap.set(key, value);
            }
        });
    }
    return contentMap;
};

const VALID_QUESTION_TYPES = [
    "single_select",
    "multiple_choice",
    "text",
    "true_false",
    "fill_in_the_blank",
    "short_answer"
];

const normalizeQuestionType = (type) => {
    // Map any invalid or alternate types to valid ones
    if (type === "multiple_select") return "multiple_choice";
    if (VALID_QUESTION_TYPES.includes(type)) return type;
    // Fallback to single_select if unknown
    return "single_select";
};

const toStringArray = (arr) => {
    if (!Array.isArray(arr)) return [];
    return arr.map(opt => {
        if (typeof opt === 'string') return opt;
        if (typeof opt === 'number') return String(opt);
        if (typeof opt === 'object' && opt !== null) {
            if ('source' in opt) return String(opt.source);
            return JSON.stringify(opt);
        }
        return String(opt);
    });
};

const toStringSingle = (val) => {
    if (typeof val === 'string') return val;
    if (typeof val === 'number') return String(val);
    if (typeof val === 'object' && val !== null) {
        if ('source' in val) return String(val.source);
        return JSON.stringify(val);
    }
    return String(val);
};

const generateQuestionOptions = (question, dish, config, restaurant, allDishes, index, unit, chapter) => {

    if (!question.options_variable || !question.correct_answer_variable) {
        return question;
    }



    let options = [];
    let correctAnswer = "";

    // Handle options_variable based on source and question type
    if (typeof question.options_variable === 'object' && question.options_variable !== null && question.options_variable.source) {
        switch (question.options_variable.source) {
            // Unit 1 Chapter 1 - Dish Types
            case 'config.validDishTypes':
                if (dish?.type?.[0]) {
                    const availableTypes = config.validDishTypes.filter(type => type !== dish.type[0]);
                    const shuffledTypes = shuffle(availableTypes);
                    options = shuffle([...shuffledTypes.slice(0, 3), dish.type[0]]);
                    correctAnswer = dish.type[0];
                }
                break;

            // Unit 1 Chapter 2 - Price Questions
            case 'generatePriceOptions(current_dish.price, 15)':
                if (dish?.price) {
                    options = generatePriceOptions(dish.price, 15);

                    correctAnswer = new Intl.NumberFormat('en-US', {
                        style: 'currency',
                        currency: 'USD'
                    }).format(dish.price);

                }
                break;

            case 'generatePriceRangeOptions(link_to_restaurant.current_dishes.filter(dish => dish.type.includes(food_course)).map(dish => dish.price).reduce((a, b) => [Math.min(a, b), Math.max(a, b)]), 40)':
                const courseType = question.placeholders?.food_course;
                if (Array.isArray(config.validDishTypes)) {
                    let generatedQuestions = [];


                    const type = courseType;

                    const dishesOfType = allDishes
                        .filter(dish => Array.isArray(dish.type) ? dish.type.includes(type) : dish.type === type)
                        .map(dish => dish.price)
                        .filter(price => price !== undefined);

                    console.log(dishesOfType, "dishesOfType");

                    if (dishesOfType.length > 0) {
                        const priceRange = [Math.min(...dishesOfType), Math.max(...dishesOfType)];
                        const opts = generatePriceRangeOptions(priceRange, 40);

                        const correct = `${priceRange[0]}-${priceRange[1]}`;

                        generatedQuestions.push({
                            ...question,
                            question_text: question.question_text.replace('{food_course}', type),
                            options_variable: toStringArray(opts),
                            correct_answer_variable: [toStringSingle(correct)],
                            placeholders: {
                                ...question.placeholders,
                                food_course: type
                            }
                        });
                    }


                    return generatedQuestions;
                } else if (courseType && Array.isArray(allDishes)) {
                    const dishesOfType = allDishes
                        .filter(dish => Array.isArray(dish.type) ? dish.type.includes(courseType) : dish.type === courseType)
                        .map(dish => dish.price)
                        .filter(price => price !== undefined);
                    if (dishesOfType.length > 0) {
                        const priceRange = [Math.min(...dishesOfType), Math.max(...dishesOfType)];
                        options = generatePriceRangeOptions(priceRange, 40);
                        correctAnswer = `${priceRange[0]}-${priceRange[1]}`;
                    }
                }
                break;

            // Additional question types
            case 'config.dietaryRestrictions.health':
                options = shuffle([...config.dietaryRestrictions.health]);
                correctAnswer = dish?.dietary_restrictions?.health || options[0];
                break;

            case 'config.dietaryRestrictions.belief':
                options = shuffle([...config.dietaryRestrictions.belief]);
                correctAnswer = dish?.dietary_restrictions?.belief || options[0];
                break;

            case 'config.dietaryRestrictions.lifestyle':
                options = shuffle([...config.dietaryRestrictions.lifestyle]);
                correctAnswer = dish?.dietary_restrictions?.lifestyle || options[0];
                break;

            case 'config.foodAllergens':
                options = shuffle([...config.foodAllergens]);
                correctAnswer = dish?.allergens || options[0];
                break;

            case 'config.tempratureOptions':
                options = shuffle([...config.temperatureOptions]);

                correctAnswer = dish?.temperature || options[0];

                break;

            case 'config.accommodationOptions':
                options = shuffle([...config.accommodationOptions]);
                correctAnswer = dish?.accommodations?.[0] || options[0];
                break;

            case 'link_to_restaurant.current_dishes.filter(dish => dish._id !== dish_id).map(dish => dish.name)': {
                // Get all dish names except the current dish
                let dishId = dish?.uuid;
                // allDishes is available, use it
                const otherDishes = (Array.isArray(allDishes) ? allDishes : [])
                    .map(d => d.name)
                    .filter(Boolean);
                let optionsArr = [...otherDishes];


                options = shuffle(optionsArr);

                // If the correct answer is supposed to be another dish's name, try to infer it
                // (If your template provides a way to know which is correct, set it here. Otherwise, leave as first option or empty)
                correctAnswer = dish?.name || '';
                break;
            }

            default:
                if (Array.isArray(question.options_variable)) {
                    options = question.options_variable;
                    // If the correct answer is about accommodations, use dish.accommodations
                    if (
                        question.correct_answer_variable &&
                        question.correct_answer_variable.source === 'current_dish.ingredients.accommodations'
                    ) {
                        correctAnswer = Array.isArray(dish.accommodations) ? dish.accommodations : [];
                    } else if (Array.isArray(question.correct_answer_variable) && question.correct_answer_variable.length > 0) {
                        correctAnswer = question.correct_answer_variable[0];
                    } else {
                        correctAnswer = '';
                    }
                }
        }
    } else if (Array.isArray(question.options_variable)) {
        options = question.options_variable;
        // If the correct answer is about accommodations, use dish.accommodations
        if (
            question.correct_answer_variable &&
            question.correct_answer_variable.source === 'current_dish.ingredients.accommodations'
        ) {
            correctAnswer = Array.isArray(dish.accommodations) ? dish.accommodations : [];
        } else if (Array.isArray(question.correct_answer_variable) && question.correct_answer_variable.length > 0) {
            correctAnswer = question.correct_answer_variable[0];
        } else {
            correctAnswer = '';
        }
    }

    // Handle Yes/No questions
    if (Array.isArray(question.options_variable) && question.options_variable.includes('Yes') && question.options_variable.includes('No')) {
        // Try to infer the correct answer from the question text and dish properties
        const qText = question.question_text.toLowerCase();
        let answer = 'No';
        // Example logic: if question is about a property and that property is truthy, answer is Yes
        if (qText.includes('is') || qText.includes('does') || qText.includes('has')) {
            // Try to extract the property name from the question text
            // e.g. 'Is {dish_name} vegetarian?' => check dish.dietary_restrictions includes 'Vegetarian'
            if (qText.includes('vegetarian')) {
                answer = (dish.dietary_restrictions && dish.dietary_restrictions.includes('Vegetarian')) ? 'Yes' : 'No';
            } else if (qText.includes('vegan')) {
                answer = (dish.dietary_restrictions && dish.dietary_restrictions.includes('Vegan')) ? 'Yes' : 'No';
            } else if (qText.includes('gluten')) {
                answer = (dish.dietary_restrictions && dish.dietary_restrictions.includes('Gluten-Free')) ? 'Yes' : 'No';
            } else if (qText.includes('dairy')) {
                answer = (dish.dietary_restrictions && dish.dietary_restrictions.includes('Dairy-Free')) ? 'Yes' : 'No';
            } else if (qText.includes('nut')) {
                answer = (dish.allergens && dish.allergens.includes('Nuts')) ? 'Yes' : 'No';
            } else if (qText.includes('spicy')) {
                answer = (dish.notes && dish.notes.toLowerCase().includes('spicy')) ? 'Yes' : 'No';
            } else if (qText.includes('hot')) {
                answer = (dish.temperature && dish.temperature.toLowerCase() === 'hot') ? 'Yes' : 'No';
            } else if (qText.includes('cold')) {
                answer = (dish.temperature && dish.temperature.toLowerCase() === 'cold') ? 'Yes' : 'No';
            } else if (qText.includes('substitute')) {
                answer = dish.can_substitute ? 'Yes' : 'No';
            } else if (qText.includes('health restrictions')) {
                answer = (dish.dietary_restrictions.health[0] !== 'None') ? 'Yes' : 'No';
            } else if (qText.includes('belief accommodations')) {
                answer = (dish.dietary_restrictions.belief[0] !== 'None') ? 'Yes' : 'No';
            } else if (qText.includes('lifestyle accommodations')) {
                answer = (dish.dietary_restrictions.lifestyle[0] !== 'None') ? 'Yes' : 'No';
            } else if (qText.includes('cross-contact')) {
                answer = dish?.is_cross_contact ? 'Yes' : 'No';
            }
            else if (qText.includes('allergens')) {
                answer = (dish.allergens && dish.allergens.length > 0 && dish.allergens[0] !== 'None') ? 'Yes' : 'No';
            }
        } else if (qText.includes('be prerpared without')) {
            if (qText.includes('allergens')) {
                answer = (dish.allergens && dish.allergens.length > 0 && dish.allergens[0] === 'None') ? 'Yes' : 'No';
            }
        }
        options = question.options_variable;
        correctAnswer = answer;
    }

    // Replace placeholders in question text
    const question_text = question.question_text.replace(/{(.*?)}/g, (_, key) => {
        switch (key) {
            case 'dish_name':
                return dish?.name || '';
            case 'dish_description':
                return dish?.description
            case 'dish_type':
                return dish?.type?.[0] || '';
            case 'dish_price':
                return dish?.price?.toString() || '';
            case 'food_course':
                return dish?.type?.[0] || question.placeholders?.food_course || '';
            case 'dish_image':
                return dish.image_url
            default:
                return '';
        }
    });

    // Ensure we have valid options and correct answer
    if (!Array.isArray(options)) options = [options].filter(Boolean);
    if (options.length === 0 || !correctAnswer) {
        console.warn('Warning: Question generation failed to produce valid options or correct answer');
        return question;
    }

    // Normalize options_variable and correct_answer_variable to arrays of strings
    const normalizedOptions = toStringArray(options);
    const normalizedCorrectAnswer = Array.isArray(correctAnswer) ? correctAnswer : [toStringSingle(correctAnswer)];

    // Normalize question_type
    const normalizedQuestionType = normalizeQuestionType(question.question_type);

    return {
        ...(question?._doc || question),
        question_text,
        menu_item: dish.uuid || 'etrsdfcsd3',
        question_number: index + 1,
        question_type: normalizedQuestionType,
        options_variable: normalizedOptions,
        correct_answer_variable: normalizedCorrectAnswer,
        placeholders: {
            ...question.placeholders,
            dish_name: dish?.name || '',
            dish_type: dish?.type?.[0] || '',
            dish_price: dish?.price?.toString() || '',
            food_course: question.placeholders?.food_course || dish?.type?.[0] || ''
        }
    };
};

// Wine-specific question options generator
const generateWineQuestionOptions = (question, wine, config, restaurant, allWines, index) => {


    let options = [];
    let correctAnswer = "";

    // Helper for shuffling
    const shuffle = arr => arr.sort(() => Math.random() - 0.5);

    const isCurrencyString = (value) => typeof value === 'string' && /^\$\d/.test(value);
    const parseCurrency = (str) => parseFloat(str.replace(/[^0-9.-]+/g, ''));

    const usdFormatter = new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD'
    });


    // Helper for number options
    const generateNumberOptions = (num, variation = 3) => {
        const wantCurrency = isCurrencyString(num);
        const baseNum = wantCurrency ? parseCurrency(num) : Number(num);
        const opts = new Set([wantCurrency ? usdFormatter.format(baseNum) : baseNum]);

        // Add 0 as an option if it's not currency and baseNum is not 0
        if (!wantCurrency && baseNum !== 0) {
            opts.add(0);
        }

        let i = 1;
        while (opts.size < 4) {
            const higher = baseNum + i;
            const lower = baseNum - i;
            if (wantCurrency) {
                opts.add(usdFormatter.format(higher));
                if (lower > 0) opts.add(usdFormatter.format(lower));
            } else {
                opts.add(higher);
                if (lower > 0) opts.add(lower);
            }
            i++;
        }

        let arr = Array.from(opts).slice(0, 4);

        // Ensure correct answer is present
        const correctFormatted = wantCurrency ? usdFormatter.format(baseNum) : baseNum;
        if (!arr.includes(correctFormatted)) {
            arr[0] = correctFormatted;
        }

        // Fill missing values if any
        while (arr.length < 4) {
            const candidate = wantCurrency
                ? usdFormatter.format(Math.floor(Math.random() * (baseNum + variation)))
                : Math.floor(Math.random() * (baseNum + variation));
            if (!arr.includes(candidate)) arr.push(candidate);
        }

        // Deduplicate and shuffle
        arr = Array.from(new Set(arr));
        return shuffle(arr);
    };


    // Handle options_variable patterns
    if (typeof question.options_variable === 'string' && question.options_variable) {
        const ov = question.options_variable;
        // Varietals (excluding current)
        if (ov.includes('varietals[0]') && ov.includes('filter(wine => wine._id !==')) {
            options = shuffle(
                allWines
                    // .filter(w => w.uuid !== wine.uuid)
                    .map(w => w.varietals[0])
                    .filter(v => v && v !== wine.varietals[0])
            ).slice(0, 3);

            if (wine.varietals[0]) options.push(wine.varietals[0]);
            // Fill with dummy varietals if less than 4
            const dummyVarietals = [
                'Cabernet Sauvignon',
                'Merlot',
                'Pinot Noir',
                'Chardonnay',
                'Sauvignon Blanc',
                'Syrah',
                'Zinfandel',
                'Malbec',
                'Riesling',
                'Grenache'
            ];
            let i = 0;
            while (options.length < 4) {
                let candidate = dummyVarietals[i % dummyVarietals.length];
                if (!options.includes(candidate)) {
                    options.push(candidate);
                }
                i++;
            }
            options = shuffle(options);
        }
        // Wine categories (excluding current)
        else if (ov.includes('wineCategories.filter') && ov.includes('category !==')) {
            options = shuffle(config.wineCategories.filter(cat => cat !== wine.category)).slice(0, 3);
            if (wine.category) options.push(wine.category);
            options = shuffle(options);
        }
        // Producer names (excluding current)
        else if (ov.includes('producer_name') && ov.includes('filter(wine => wine._id !==')) {
            options = shuffle(
                allWines
                    // .filter(w => w.uuid !== wine.uuid)
                    .map(w => w.producer_name)
                    .filter(p => p && p !== wine.producer_name)
            ).slice(0, 3);
            if (wine.producer_name) options.push(wine.producer_name);
            // Fill with dummy producer names if less than 4
            const dummyProducers = [
                'Chateau Margaux',
                'Robert Mondavi',
                'Penfolds',
                'Antinori',
                'Beringer',
                'Cloudy Bay',
                'Opus One',
                'Silver Oak',
                'Duckhorn',
                'Torres'
            ];
            let i = 0;
            while (options.length < 4) {
                let candidate = dummyProducers[i % dummyProducers.length];
                if (!options.includes(candidate)) {
                    options.push(candidate);
                }
                i++;
            }
            options = shuffle(options);
        }
        // Wine labels (excluding current)
        else if (ov.includes('image_url') && ov.includes('filter(wine => wine._id !==')) {
            options = shuffle(
                allWines.filter(w => w.uuid !== wine.uuid)
                    .map(w => w.image_url)
                    .filter(l => l && l !== wine.image_url)
            ).slice(0, 3);
            if (wine.image_url) options.push(wine.image_url);
            // Fill with real food image URLs if less than 4
            const dummyImages = [
                'https://plus.unsplash.com/premium_photo-1676590905512-13824f60092a?q=80&w=365&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D',
                'https://images.unsplash.com/photo-1700893417207-99da24343476?q=80&w=870&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D',
                'https://images.unsplash.com/photo-1610631787813-9eeb1a2386cc?q=80&w=435&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D',
                'https://images.unsplash.com/photo-1700893417219-221864536e99?q=80&w=870&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D',
                'https://images.unsplash.com/photo-1586370434639-0fe43b2d32e6?q=80&w=388&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D'
            ];
            let i = 0;
            while (options.length < 4) {
                let candidate = dummyImages[i % dummyImages.length];
                if (!options.includes(candidate) && candidate !== wine.image_url) {
                    options.push(candidate);
                }
                i++;
            }
            options = shuffle(options);
        }
        // Number options (counts/prices)
        else if (ov.includes('generateNumberOptions')) {
            // Try to extract the number from correct_answer_variable
            let num = 0;
            if (typeof question.correct_answer_variable === 'string') {
                // Try to evaluate the count from the correct_answer_variable
                if (question.correct_answer_variable.includes('.length')) {
                    // Example: link_to_restaurant.current_wines.filter(wine => wine.offering.by_the_glass).length

                    if (question.correct_answer_variable.includes('by_the_glass') && question.correct_answer_variable.includes('category ===')) {
                        // For type-specific BTG
                        const match = wine.category || '';
                        num = allWines.filter(w => w.offering?.by_the_glass && w.category === match).length;
                    } else if (question.correct_answer_variable.includes('by_the_glass')) {
                        num = allWines.filter(w => w.offering?.by_the_glass).length || 0;

                    } else if (question.correct_answer_variable.includes('by_the_bottle') && question.correct_answer_variable.includes('category ===')) {
                        const match = question.placeholders?.wine_type || '';
                        num = allWines.filter(w => w.offering?.by_the_bottle && w.category === match).length;
                    } else if (question.correct_answer_variable.includes('by_the_bottle')) {
                        num = allWines.filter(w => w.offering?.by_the_bottle).length || 0;

                    } else if (question.correct_answer_variable.includes('region.country ===')) {
                        const match = wine.region.country || '';
                        num = allWines.filter(w => w.region?.country === match).length;
                    } else if (question.correct_answer_variable.includes('varietals.includes')) {
                        const match = wine.varietals || '';
                        num = allWines.filter(w => w.varietals && w.varietals.includes(match)).length;
                    }
                } else if (question.correct_answer_variable.includes('bottle_price')) {
                    num = new Intl.NumberFormat('en-US', {
                        style: 'currency',
                        currency: 'USD'
                    }).format(wine?.offering?.bottle_price) || formatter.format(0);
                    console.log(num, "num bottle")
                } else if (question.correct_answer_variable.includes('glass_price')) {
                    num = new Intl.NumberFormat('en-US', {
                        style: 'currency',
                        currency: 'USD'
                    }).format(wine?.offering?.glass_price) || formatter.format(0);
                    console.log(num, "num glass")
                }
            }
            options = generateNumberOptions(num, 3);
        }
        else if (typeof ov === 'string' && ov.startsWith('[') && ov.includes('correct_answer')) {
            // Q2/Q3: How many wines do you offer from {wine_major_region}, {wine_country}? (and by type)
            // correct_answer is already calculated above or will be calculated below
            let correct = 0;
            if (question.correct_answer_variable && typeof question.correct_answer_variable === 'string' && question.correct_answer_variable.includes('filter(wine =>')) {
                // Q2: all wines from region/country
                if (question.correct_answer_variable.includes('wine.region.major_region ===') && question.correct_answer_variable.includes('wine.region.country ===') && !question.correct_answer_variable.includes('wine.category ===')) {
                    const wine_major_region = wine.region.region;
                    const wine_country = question.region?.country;
                    correct = allWines.filter(w => w.region?.region === wine_major_region && w.region?.country === wine_country).length;
                    console.log(correct, "region length correct answer");
                }
                // Q3: by type
                else if (question.correct_answer_variable.includes('wine.category ===') && question.correct_answer_variable.includes('wine.region.major_region ===') && question.correct_answer_variable.includes('wine.region.country ===')) {
                    const wine_major_region = wine.region.region;
                    const wine_country = question.placeholders?.wine_country;
                    const wine_type = question.placeholders?.wine_type;
                    correct = allWines.filter(w => w.category === wine_type && w.region?.region === wine_major_region && w.region?.country === wine_country).length;
                }
            }

            // Generate options and ensure uniqueness (no duplicates)
            let rawOptions = [Math.max(0, correct - 2), correct, correct + 2, correct + 3];
            // Remove duplicates and ensure correct answer is present only once
            options = Array.from(new Set(rawOptions));
            // If less than 4 options, add more plausible dummy options
            let tries = 0;
            while (options.length < 4 && tries < 10) {
                // Generate a plausible dummy number (between 0 and correct+5, but not the correct answer)
                let dummy = Math.floor(Math.random() * (Math.max(5, correct + 5) + 1));
                if (!options.includes(dummy)) {
                    options.push(dummy);
                }
                tries++;
            }
            // Shuffle options
            options = options.sort(() => Math.random() - 0.5);

            correctAnswer = correct;
        }
        // Country/region lists
        else if (ov.includes('map(wine => wine.region.country)')) {
            options = [...new Set(allWines.map(w => w.region?.country).filter(Boolean))];
            // Fill with dummy country names if less than 4
            const correctCountry = wine.region?.country;
            const dummyCountries = [
                'France',
                'Italy',
                'Spain',
                'USA',
                'Australia',
                'Argentina',
                'Chile',
                'Germany',
                'South Africa',
                'New Zealand'
            ];
            let i = 0;
            while (options.length < 4) {
                let candidate = dummyCountries[i % dummyCountries.length];
                if (!options.includes(candidate) && candidate !== correctCountry) {
                    options.push(candidate);
                }
                i++;
            }
            options = shuffle(options);
        }
        else if (ov.includes('link_to_restaurant.current_wines.filter(wine => wine.region.country === ') && question.question_text.includes('How many wines do you offer from ')) {
            // Extract the wine_country placeholder value (should be a country name)
            const current_wines = allWines;
            const wine_country = wine?.region?.country || '';
            const count = current_wines.filter(wine => wine.region.country === wine_country).length;

            // Set options and correct answer
            options = [count];
            correctAnswer = count;

            // Add dummy options if less than 4
            while (options.length < 4) {
                // Generate a plausible dummy number (between 0 and total wines, but not the correct answer)
                let dummy;
                const max = Math.max(5, current_wines.length + 2); // Make sure we have a reasonable upper bound
                do {
                    dummy = Math.floor(Math.random() * (max + 1));
                } while (options.includes(dummy));
                options.push(dummy);
            }
            // Shuffle options
            options = options.sort(() => Math.random() - 0.5);
        }
        else if (ov.includes('.length + 5].slice(0, 3)') && question.question_text.includes('How many wines BTG')) {
            const current_wines = allWines;
            const wine_country = wine?.region?.country || '';
            const count = current_wines.filter(wine => wine.region.country === wine_country && wine.offering.by_the_glass).length;

            options = [count];
            correctAnswer = count;

            // Add dummy options if less than 4
            while (options.length < 4) {
                // Generate a plausible dummy number (between 0 and total wines, but not the correct answer)
                let dummy;
                const max = Math.max(5, current_wines.length + 2); // Make sure we have a reasonable upper bound
                do {
                    dummy = Math.floor(Math.random() * (max + 1));
                } while (options.includes(dummy));
                options.push(dummy);
            }
            // Shuffle options
            options = options.sort(() => Math.random() - 0.5);

        }
        else if (ov.includes('.length + 5].slice(0, 3)') && question.question_text.includes('How many wines BTB')) {
            const current_wines = allWines;
            const wine_country = wine?.region?.country || '';
            const count = current_wines.filter(wine => wine.region.country === wine_country && wine.offering.by_the_bottle).length;

            options = [count];
            correctAnswer = count;

            // Add dummy options if less than 4
            while (options.length < 4) {
                // Generate a plausible dummy number (between 0 and total wines, but not the correct answer)
                let dummy;
                const max = Math.max(5, current_wines.length + 2); // Make sure we have a reasonable upper bound
                do {
                    dummy = Math.floor(Math.random() * (max + 1));
                } while (options.includes(dummy));
                options.push(dummy);
            }
            // Shuffle options
            options = options.sort(() => Math.random() - 0.5);

        }
        // Major region lists
        else if (ov.includes('map(wine => wine.region.major_region)')) {
            options = [...new Set(allWines.map(w => w.region?.region).filter(Boolean))];
            // Fill with dummy major region names if less than 4
            const correctRegion = wine.region?.region;
            const dummyMajorRegions = [
                'Bordeaux',
                'Tuscany',
                'Napa Valley',
                'Rioja',
                'Barossa',
                'Mendoza',
                'Mosel',
                'Douro',
                'Piedmont',
                'Champagne'
            ];
            let i = 0;
            while (options.length < 4) {
                let candidate = dummyMajorRegions[i % dummyMajorRegions.length];
                if (!options.includes(candidate) && candidate !== correctRegion) {
                    options.push(candidate);
                }
                i++;
            }
            options = shuffle(options);
        }
        // Wine styles (for a category)
        // else if(ov.includes("wine => wine.category === 'white'")){
        //     const whiteWinesExists = allWines.filter(wine=> wine.category === 'White');

        //     if(whiteWinesExists.length > 0 ){
        //         options.push(whiteWinesExists[0]);

        //     }

        // }

        else if (ov.includes('wine.product_name')) {
            // Q1: What is the name of this wine?
            options = allWines
                .filter(w => w.category === wine.category && w.product_name !== wine.product_name)
                .map(w => w.product_name)
                .slice(0, 3);
            if (wine.product_name) options.push(wine.product_name);
            // Fill with dummy product names if less than 4
            const dummyProductNames = [
                'Chateau Margaux, Grand Vin',
                'Penfolds, Grange',
                'Duckhorn, Merlot',
                'Torres, Sangre de Toro'
            ];
            let i = 0;
            while (options.length < 4) {
                let candidate = dummyProductNames[i % dummyProductNames.length];
                if (!options.includes(candidate) && candidate !== wine.product_name) {
                    options.push(candidate);
                }
                i++;
            }
            options = shuffle(options);
        }
        else if (ov.includes('wine.style.name')) {
            // Extract style_name from placeholder
            const styleName = wine.style.name;
            const category = wine.category;
            options = shuffle(
                allWines.filter(w => w.category === category && w.style?.name !== styleName)
                    .map(w => w.style?.name)
                    .filter(n => n && n !== styleName)
            ).slice(0, 3);
            if (styleName) options.push(styleName);
            // Fill with dummy wine style names if less than 4
            const dummyWineStyles = [
                'Crisp White',
                'Bold Red',
                'Fruity Rosé',
                'Classic Sparkling',
                'Rich Dessert',
                'Aromatic Orange',
                'Earthy Red',
                'Mineral White',
                'Sweet Moscato',
                'Dry Champagne'
            ];
            let i = 0;
            while (options.length < 4) {
                let candidate = dummyWineStyles[i % dummyWineStyles.length];
                if (!options.includes(candidate) && candidate !== styleName) {
                    options.push(candidate);
                }
                i++;
            }
            options = shuffle(options);
        }
        // Glass/Bottle/Both
        else if (ov === JSON.stringify(["Glass", "Bottle", "Both"])) {
            options = ["Glass", "Bottle", "Both"];
        }
        // Single Grape/Blend
        else if (ov === JSON.stringify(["Single Grape", "Blend"])) {
            options = ["Single Grape", "Blend"];
        }
        // Special handling for unit 2 chapter 3 (repeat Varietals BTG/BTB by Price)
        else if (typeof ov === 'string' && ov.includes('map(wine => `${wine.producer_name}, ${wine.product_name}')) {
            // Determine if BTG or BTB
            const isBTG = ov.includes('by_the_glass');
            const varietal = question.placeholders?.wine_varietal;
            const price = question.placeholders?.wine_price;
            // Find all wines with this varietal and by_the_glass/by_the_bottle
            const filteredWines = allWines.filter(w => w.varietals && w.varietals.includes(varietal) && (isBTG ? w.offering?.by_the_glass : w.offering?.by_the_bottle));
            // Find the correct wine (by price)
            let correctWine = filteredWines.find(w => (isBTG ? w.offering?.glass_price?.toString() : w.offering?.bottle_price?.toString()) === price);
            let correctStr = correctWine ? `${correctWine.producer_name}, ${correctWine.product_name}` : '';
            // Build options: up to 3 wines (excluding the correct one), plus the correct one
            let optionsArr = filteredWines
                .filter(w => `${w.producer_name}, ${w.product_name}` !== correctStr)
                .map(w => `${w.producer_name}, ${w.product_name}`)
                .slice(0, 3);
            if (correctStr) optionsArr.push(correctStr);
            // Fill with dummy if less than 4
            const dummyNames = [
                'Chateau Margaux, Grand Vin',
                'Penfolds, Grange',
                'Duckhorn, Merlot',
                'Torres, Sangre de Toro'
            ];
            let i = 0;
            while (optionsArr.length < 4) {
                let candidate = dummyNames[i % dummyNames.length];
                if (!optionsArr.includes(candidate)) optionsArr.push(candidate);
                i++;
            }
            options = optionsArr.sort(() => Math.random() - 0.5);
            correctAnswer = correctStr;
            // Ensure correct answer is in options
            if (correctAnswer && !options.includes(correctAnswer)) {
                options[0] = correctAnswer;
                options = options.sort(() => Math.random() - 0.5);
            }
            // If no correct answer, fallback to first option
            if (!correctAnswer && options.length > 0) correctAnswer = options[0];

        } else if (typeof ov === 'string' && ov.includes('.length + [Math.max(0,')) {
            // Count-based options for varietal BTG/BTB
            const isBTG = ov.includes('by_the_glass');
            const varietal = question.placeholders?.wine_varietal;
            const filteredWines = allWines.filter(w => w.varietals && w.varietals.includes(varietal) && (isBTG ? w.offering?.by_the_glass : w.offering?.by_the_bottle));
            const count = filteredWines.length;
            options = [count, Math.max(0, count - 2), count + 2, count + 3].sort(() => Math.random() - 0.5);
            correctAnswer = count;
        }
        // Special handling for unit 2 chapter 4 (wine major regions)
        else if (typeof ov === 'string' && ov.includes('filter(wine => wine.region.country ===') && ov.includes('map(wine => wine.region.major_region)')) {
            // Q1: Which major wine region within {wine_country} is it from?
            const wine_country = question.placeholders?.wine_country;
            const correct_region = wine.region?.region;
            // Get all unique major regions for this country
            let regionOptions = allWines.filter(w => w.region?.country === wine_country).map(w => w.region?.region).filter((region, idx, arr) => region && arr.indexOf(region) === idx);
            regionOptions = regionOptions.slice(0, 3);
            if (correct_region && !regionOptions.includes(correct_region)) regionOptions.push(correct_region);
            // Fill with dummy if less than 4
            const dummyMajorRegions = ['Bordeaux', 'Tuscany', 'Napa Valley', 'Rioja', 'Barossa', 'Mendoza', 'Mosel', 'Douro', 'Piedmont', 'Champagne'];
            let i = 0;
            while (regionOptions.length < 4) {
                let candidate = dummyMajorRegions[i % dummyMajorRegions.length];
                if (!regionOptions.includes(candidate) && candidate !== correct_region) regionOptions.push(candidate);
                i++;
            }
            options = regionOptions.sort(() => Math.random() - 0.5);
            correctAnswer = correct_region;
        }
        // Default: try to parse as array
        else {
            try {
                const arr = JSON.parse(ov);
                if (Array.isArray(arr)) options = arr;
            } catch {
                // fallback
                options = [];
            }
        }
    } else if (Array.isArray(question.options_variable)) {
        options = question.options_variable;
    }

    // Handle correct_answer_variable patterns
    if (typeof question.correct_answer_variable === 'string' && question.correct_answer_variable) {
        const cav = question.correct_answer_variable;
        if (cav.includes('varietals[0]')) {
            correctAnswer = wine.varietals[0];
        } else if (cav.includes('producer_name')) {
            correctAnswer = wine.producer_name;
        } else if (cav.includes('image_url')) {
            correctAnswer = wine.image_url;
        }
        else if (cav.includes('link_to_restaurant.current_wines[{wine_id}].category')) {
            correctAnswer = wine.category || '';
        }
        else if (cav.includes('link_to_restaurant.current_wines[{wine_id}].region.country')) {
            correctAnswer = wine.region?.country;
        }
        else if (cav.includes('link_to_restaurant.current_wines[{wine_id}].region.major_region')) {
            correctAnswer = wine.region?.region;
        }

        else if (cav.includes('style.name')) {
            correctAnswer = wine.style?.name;
        } else if (cav.includes('product_name')) {
            correctAnswer = wine.product_name;
        }
        else if (cav.includes('offering.bottle_price') && !question.question_text.includes('{number}')) {
            correctAnswer = usdFormatter.format(wine.offering?.bottle_price || formatter.format(0));
        } else if (cav.includes('offering.glass_price') && !question.question_text.includes('{number}')) {
            correctAnswer = usdFormatter.format(wine.offering?.glass_price || formatter.format(0));
        } else if (cav.includes('varietals.length > 1')) {
            correctAnswer = (wine.varietals && wine.varietals.length > 1) ? 'Blend' : 'Single Grape';
        }
        else if (cav.includes('offering.by_the_bottle && wine.region.country ===') && question.question_text.includes('How many wines BTB')) {
            const wine_country = wine.region.country
            const count = allWines.filter(wine => wine.region.country === wine_country && wine.offering.by_the_bottle).length;
            correctAnswer = count || 0;
        }
        else if (cav.includes('offering.by_the_glass && wine.region.country ===') && question.question_text.includes('How many wines BTG')) {
            const wine_country = wine.region.country
            const count = allWines.filter(wine => wine.region.country === wine_country && wine.offering.by_the_glass).length;
            correctAnswer = count || 0;
        }
        else if (cav.includes('by_the_glass') && cav.includes('category ===')) {
            // For type-specific BTG
            const match = wine.category || '';
            correctAnswer = allWines.filter(w => w.offering?.by_the_glass && w.category === match).length;
        } else if (cav.includes('by_the_bottle') && cav.includes('category ===')) {
            const match = wine.category || '';
            correctAnswer = allWines.filter(w => w.offering?.by_the_bottle && w.category === match).length;
        } else if (cav.includes('offering.by_the_bottle') && cav.includes('offering.by_the_glass')) {
            correctAnswer = wine.offering?.by_the_bottle && wine.offering?.by_the_glass
                ? 'Both'
                : wine.offering?.by_the_bottle
                    ? 'Bottle'
                    : 'Glass';
            console.log(correctAnswer, 'correctAnswer');
        } else if (cav.includes('offering.by_the_glass') && !question.question_text.includes('{number}')) {
            correctAnswer = allWines.filter(w => w.offering?.by_the_glass).length || 0;
        }

        else if (cav.includes('offering.by_the_bottle') && !question.question_text.includes('{number}')) {
            correctAnswer = allWines.filter(w => w.offering?.by_the_bottle).length || 0;
        } else if (cav.includes('filter(wine => wine.offering.by_the_glass && wine.region.country ===')) {
            const match = wine.region.country || '';
            correctAnswer = allWines.filter(w => w.offering?.by_the_glass && w.region?.country === match).length;
        } else if (cav.includes('filter(wine => wine.offering.by_the_bottle && wine.region.country ===')) {
            const match = wine.region.country || '';
            correctAnswer = allWines.filter(w => w.offering?.by_the_bottle && w.region?.country === match).length;
        } else if (cav.includes('filter(wine => wine.region.country ===')) {
            const match = wine.region.country || '';
            correctAnswer = allWines.filter(w => w.region?.country === match).length;
        } else if (cav.includes('filter(wine => wine.varietals.includes')) {
            const match = wine.varietals || '';
            correctAnswer = allWines.filter(w => w.varietals && w.varietals.includes(match)).length;
        } else if (cav.includes('find(wine => wine.varietals.includes')) {
            // Find the wine with the matching varietal and price
            const matchVarietal = wine.varietals[0] || '';
            const matchPrice = question.placeholders?.wine_price || '';
            const found = allWines.find(w => w.varietals && w.varietals.includes(matchVarietal) && (w.offering?.glass_price?.toString() === matchPrice || w.offering?.bottle_price?.toString() === matchPrice));
            correctAnswer = found ? `${found.producer_name}, ${found.product_name}` : '';
        } else if (cav.includes('filter(wine => wine.category ===') && cav.includes('offering.by_the_bottle') && cav.includes('offering.by_the_glass')) {
            const matchType = question.placeholders?.wine_type || '';
            correctAnswer = allWines.filter(w => w.category === matchType && w.offering?.by_the_bottle && !w.offering?.by_the_glass).length;
        } else if (cav.includes('filter(wine => wine.category ===') && cav.includes('offering.by_the_bottle')) {
            const matchType = question.placeholders?.wine_type || '';
            correctAnswer = allWines.filter(w => w.category === matchType && w.offering?.by_the_bottle).length;
        } else if (cav.includes('filter(wine => wine.category ===') && cav.includes('offering.by_the_glass')) {
            const matchType = question.placeholders?.wine_type || '';
            correctAnswer = allWines.filter(w => w.category === matchType && w.offering?.by_the_glass).length;
        } else if (cav.includes('filter(wine => wine.region.major_region ===')) {
            const matchRegion = wine.region.region || '';
            const wine_country = wine.region?.country;
            correctAnswer = allWines.filter(w => w.region?.region === matchRegion && w.region.country === wine_country).length;
            console.log(correctAnswer, "region length answer");
        } else if (cav.includes('filter(wine => wine.category ===') && cav.includes('region.major_region ===')) {
            const matchType = question.placeholders?.wine_type || '';
            const matchRegion = wine.region.region || '';
            correctAnswer = allWines.filter(w => w.category === matchType && w.region?.region === matchRegion).length;
        } else {
            // fallback
            correctAnswer = '';
        }
    } else if (Array.isArray(question.correct_answer_variable) && question.correct_answer_variable.length > 0) {
        correctAnswer = question.correct_answer_variable[0];
    }

    // Yes/No logic (as in food)
    if (options.includes('Yes') && options.includes('No')) {
        const qText = question.question_text.toLowerCase();
        if (qText.includes('organic')) correctAnswer = wine.is_organic ? 'Yes' : 'No';
        else if (qText.includes('vegan')) correctAnswer = wine.is_vegan ? 'Yes' : 'No';
        else if (qText.includes('biodynamic')) correctAnswer = wine.is_biodynamic ? 'Yes' : 'No';
        else if (qText.includes('filtered')) correctAnswer = wine.is_filtered ? 'Yes' : 'No';
        else if (qText.includes('sugar')) correctAnswer = wine.has_residual_sugar ? 'Yes' : 'No';
    }


    // Replace placeholders in question text
    const question_text = question.question_text.replace(/{(.*?)}/g, (_, key) => {
        switch (key) {

            case 'wine_name': return wine.product_name || '';
            case 'wine_category': return wine.category || '';
            case 'wine_vintage': return wine.vintage?.toString() || '';
            case 'wine_style': return wine.style?.body || '';
            case 'wine_variable': return wine.producer_name || '';
            case 'wine_label': return wine.image_url || '';
            case 'wine_type': return wine.category || '';
            case 'producer_name': return wine.producer_name || '';
            case 'product_name': return wine.product_name || '';
            case 'label_image': return wine.image_url || '';
            case 'wine_varietal': return wine.varietals[0] || '';
            case 'wine_price': return formatter.format(question.placeholders?.wine_price) || '';
            case 'wine_country': return wine.region.country || '';
            case 'wine_major_region': return wine.region.region || '';
            case 'number': return question.placeholders?.number || '';
            case 'style_name': return wine.style.name || '';
            case 'noun_quantity':
                return question.placeholders?.number == 1 ? 'wine' : 'wines';
            default: return '';
        }
    });

    const hint = question?.hint.replace(/{(.*?)}/g, (_, key) => {
        switch (key) {
            case 'wine_name': return wine.product_name || '';
            case 'wine_category': return wine.category || '';
            case 'wine_vintage': return wine.vintage?.toString() || '';
            case 'wine_style': return wine.style?.body || '';
            case 'wine_variable': return wine.producer_name || '';
            case 'wine_label': return wine.image_url || '';
            case 'wine_type': return wine.category || '';
            case 'producer_name': return wine.producer_name || '';
            case 'product_name': return wine.product_name || '';
            case 'label_image': return wine.image_url || '';
            case 'wine_varietal': return wine.varietals[0] || '';
            case 'wine_price': return formatter.format(question.placeholders?.wine_price) || '';
            case 'wine_country': return wine.region.country || '';
            case 'wine_major_region': return wine.region.region || '';
            case 'number': return question.placeholders?.number || '';
            case 'style_name': return wine.style.name || '';
            default: return '';
        }
    });

    return {
        ...(question?._doc || question),
        question_text,
        menu_item: wine.uuid,
        question_number: index + 1,
        options_variable: options,
        correct_answer_variable: Array.isArray(correctAnswer) ? correctAnswer : [correctAnswer],
        hint: hint,
        placeholders: {
            ...question.placeholders,
            wine_name: wine.product_name,
            wine_category: wine.category,
            wine_vintage: wine.vintage?.toString(),
            wine_style: wine.style?.body,
            producer_name: wine.producer_name,
            product_name: wine.product_name,
            label_image: wine.image_url
        }
    };
};

const generateLessonsForRestaurant = async (category, restaurant_uuid, newEntry) => {
    try {
        const restaurant = await Restaurant.findOne({ uuid: restaurant_uuid });
        if (!restaurant) {
            return false;
        }

        const restaurantUsers = await User.find({ assigned_restaurants: restaurant_uuid });



        if (category === "food") {
            // Fetch all dish objects for the restaurant's current dishes
            const dishIds = restaurant.current_dishes.map(d => d.dish_id);
            const allDishes = await Dish.find({ isDeleted: false, uuid: { $in: dishIds } });

            // Get all food lesson templates
            const lessonTemplates = await LessonTemplate.find({ category: "food", }).sort({ unit: 1, chapter: 1 }).lean();


            // If newEntry is provided, only generate lessons for that dish
            if (newEntry) {
                const createdLessons = [];
                for (const template of lessonTemplates) {
                    try {
                        console.log(`Processing template: ${template.unit_name} - ${template.chapter_name}`);

                        const config = {
                            validDishTypes,
                            dietaryRestrictions,
                            foodAllergens,
                            temperatureOptions,
                            accommodationOptions
                        };

                        let questionCounter = 1;
                        const processedQuestions = template.questions.flatMap((question) => {
                            if (question.repeat_for && question.repeat_for.source === 'config.validDishTypes') {
                                // return config.validDishTypes.flatMap(type => {
                                const type = config.validDishTypes.find(vd => vd === newEntry.type[0]);
                                const questionForType = {
                                    ...question,
                                    placeholders: { ...question.placeholders, food_course: type }
                                };
                                const result = generateQuestionOptions(
                                    questionForType,
                                    newEntry,
                                    config,
                                    restaurant,
                                    allDishes,
                                    questionCounter,
                                    template.unit,
                                    template.chapter
                                );
                                if (Array.isArray(result)) {
                                    return result.map(q => ({ ...q, question_number: questionCounter++, menu_item: newEntry.uuid }));
                                } else {
                                    return { ...result, question_number: questionCounter++, menu_item: newEntry.uuid };
                                }
                                // });
                            } else {
                                const result = generateQuestionOptions(
                                    question,
                                    newEntry,
                                    config,
                                    restaurant,
                                    allDishes,
                                    questionCounter,
                                    template.unit,
                                    template.chapter
                                );
                                if (Array.isArray(result)) {
                                    return result.map(q => ({ ...q, question_number: questionCounter++, menu_item: newEntry.uuid }));
                                } else {
                                    return { ...result, question_number: questionCounter++, menu_item: newEntry.uuid };
                                }
                            }
                        });

                        const existingRestaurantLesson = await Lesson.findOne({
                            restaurant_uuid: restaurant_uuid,
                            category: "food",
                            unit: template.unit,
                            chapter: template.chapter
                        });



                        if (existingRestaurantLesson) {
                            const updateLesson = await Lesson.findOneAndUpdate(
                                { uuid: existingRestaurantLesson.uuid },
                                {
                                    $addToSet: { menu_items: newEntry.uuid }, // add only if not present
                                    $push: { questions: { $each: processedQuestions } }, // append all new questions
                                    menu_items_model: "Dish",
                                },
                                { new: true }
                            );
                            console.log(`Successfully updated lesson for ${newEntry.name} from template ${template.unit_name} - ${template.chapter_name}`);
                        } else {

                            const userProgresses = restaurantUsers.map((ru) => {
                                return {
                                    employeeId: ru.uuid,
                                    status: "not_started"
                                }
                            });

                            // Create a new lesson based on the template
                            const newLesson = new Lesson({
                                category: template.category,
                                unit: template.unit,
                                unit_name: template.unit_name,
                                chapter: template.chapter,
                                chapter_name: template.chapter_name,
                                restaurant_uuid: restaurant_uuid,
                                assignedEmployees: restaurantUsers.map((r) => r.uuid),
                                progress: userProgresses,
                                menu_items: [newEntry.uuid],
                                menu_items_model: "Dish",
                                difficulty: template.difficulty,
                                content: convertContentToMap(template.content),
                                questions: processedQuestions,
                                createdBy: restaurant.createdBy || "system",
                                lastModifiedBy: restaurant.createdBy || "system"
                            });

                            const savedLesson = await newLesson.save();
                            createdLessons.push(savedLesson);
                            console.log(`Successfully created lesson for ${newEntry.name} from template ${template.unit_name} - ${template.chapter_name}`);
                        }
                    } catch (templateError) {
                        console.error(`Error processing template ${template.unit_name}:`, templateError);
                    }
                }
                // After all lessons are created and assigned, send email to all users
                for (const user of restaurantUsers) {
                    await transporter.sendMail({
                        from: process.env.SMTP_USER,
                        to: user.email,
                        subject: "New Training Lessons Assigned",
                        html: `
                            <div style="font-family:Arial,sans-serif;font-size:15px;">
                                <p>Hi ${user.first_name} ${user.last_name},</p>
                                <p>New training lessons have been assigned to you in Speak Your Menu. Log in to your account to view and complete your lessons.</p>
                                <p>If you have any questions, please contact your manager.</p>
                                <p>Best regards,<br/>The Speak Your Menu Team</p>
                            </div>
                        `
                    });
                }
                return true;
            }

            // After all lessons are created and assigned, send email to all users
            for (const user of restaurantUsers) {
                await transporter.sendMail({
                    from: process.env.SMTP_USER,
                    to: user.email,
                    subject: "New Training Lessons Assigned",
                    html: `
                        <div style="font-family:Arial,sans-serif;font-size:15px;">
                            <p>Hi ${user.first_name} ${user.last_name},</p>
                            <p>New training lessons have been assigned to you in Speak Your Menu. Log in to your account to view and complete your lessons.</p>
                            <p>If you have any questions, please contact your manager.</p>
                            <p>Best regards,<br/>The Speak Your Menu Team</p>
                        </div>
                    `
                });
            }

            return true;
        } else if (category === "wine") {
            // Fetch all wines for the restaurant
            const wines = await GlobalWine.find({ isDeleted: false, restaurant_uuid: restaurant_uuid });
            const lessonTemplates = await LessonTemplate.find({ category: "wine", }).sort({ unit: 1, chapter: 1 }).lean();


            if (newEntry) {
                const createdLessons = [];
                for (const template of lessonTemplates) {
                    try {
                        console.log(`Processing template: ${template.unit_name} - ${template.chapter_name}`);

                        const config = {
                            wineCategories,
                            wineStyles
                        };
                        let questionCounter = 1;
                        // Special handling for unit 2, chapter 3 (repeat Varietals BTG/BTB by Price)
                        let processedQuestions;
                        if (template.unit === 2 && template.chapter === 3) {
                            processedQuestions = template.questions.flatMap(question => {
                                // Only process questions with repeat_for on varietals
                                if (question.repeat_for && question.repeat_for.key_variable === "wine_varietal") {
                                    // Get all unique varietals
                                    const allVarietals = Array.from(new Set(wines.flatMap(w => w.varietals)));
                                    // return allVarietals.flatMap(varietal => {
                                    // BTG question
                                    if (question.question_text.includes("by the glass") || question.question_text.includes("BTG")) {
                                        // Find a wine with this varietal and by_the_glass
                                        const wineForVarietal = wines.find(w => w.varietals.includes(newEntry.varietals[0]) && w.offering?.by_the_glass);
                                        if (!wineForVarietal) return [];
                                        const wine_price = wineForVarietal.offering?.glass_price?.toString() || "";
                                        const number = wines.filter(w => w.varietals.includes(newEntry.varietals[0]) && w.offering?.by_the_glass).length;
                                        const questionForVarietal = {
                                            ...question,
                                            placeholders: {
                                                ...question.placeholders,
                                                wine_varietal: newEntry.varietals[0],
                                                wine_price,
                                                number
                                            }
                                        };
                                        const result = generateWineQuestionOptions(
                                            questionForVarietal,
                                            wineForVarietal,
                                            config,
                                            restaurant,
                                            wines,
                                            questionCounter
                                        );
                                        if (Array.isArray(result)) {
                                            return result.map(q => ({ ...q, question_number: questionCounter++ }));
                                        } else {
                                            return { ...result, question_number: questionCounter++ };
                                        }
                                    }
                                    // BTB question
                                    if (question.question_text.includes("by the bottle") || question.question_text.includes("BTB")) {
                                        const wineForVarietal = wines.find(w => w.varietals.includes(newEntry.varietals[0]) && w.offering?.by_the_bottle);
                                        if (!wineForVarietal) return [];
                                        const wine_price = wineForVarietal.offering?.bottle_price?.toString() || "";
                                        const number = wines.filter(w => w.varietals.includes(newEntry.varietals[0]) && w.offering?.by_the_bottle).length;
                                        const questionForVarietal = {
                                            ...question,
                                            placeholders: {
                                                ...question.placeholders,
                                                wine_varietal: newEntry.varietals[0],
                                                wine_price,
                                                number
                                            }
                                        };
                                        const result = generateWineQuestionOptions(
                                            questionForVarietal,
                                            wineForVarietal,
                                            config,
                                            restaurant,
                                            wines,
                                            questionCounter
                                        );
                                        if (Array.isArray(result)) {
                                            return result.map(q => ({ ...q, question_number: questionCounter++ }));
                                        } else {
                                            return { ...result, question_number: questionCounter++ };
                                        }
                                    }
                                    // For other question types, fallback to default
                                    // return [];
                                    // });
                                }
                                // Fallback to default for non-repeat_for questions
                                const result = generateWineQuestionOptions(
                                    { ...question },
                                    newEntry,
                                    config,
                                    restaurant,
                                    wines,
                                    questionCounter
                                );
                                if (Array.isArray(result)) {
                                    return result.map(q => ({ ...q, question_number: questionCounter++ }));
                                } else {
                                    return { ...result, question_number: questionCounter++ };
                                }
                            });
                        } else {
                            // Default: no special handling
                            processedQuestions = template.questions.flatMap(question => {
                                // Handle repeat_for logic for wine categories
                                if (question.repeat_for && question.repeat_for.source === 'config.wineCategories') {
                                    return wineCategories.flatMap(cat => {
                                        const questionForCat = {
                                            ...question,
                                            placeholders: { ...question.placeholders, wine_category: cat }
                                        };
                                        const result = generateWineQuestionOptions(
                                            questionForCat,
                                            newEntry,
                                            config,
                                            restaurant,
                                            wines,
                                            questionCounter
                                        );
                                        if (Array.isArray(result)) {
                                            return result.map(q => ({ ...q, question_number: questionCounter++ }));
                                        } else {
                                            return { ...result, question_number: questionCounter++ };
                                        }
                                    });
                                }
                                // Default: no repeat_for
                                const result = generateWineQuestionOptions(
                                    { ...question },
                                    newEntry,
                                    config,
                                    restaurant,
                                    wines,
                                    questionCounter
                                );
                                if (Array.isArray(result)) {
                                    return result.map(q => ({ ...q, question_number: questionCounter++ }));
                                } else {
                                    return { ...result, question_number: questionCounter++ };
                                }
                            });
                        }



                        const existingRestaurantLesson = await Lesson.findOne({
                            restaurant_uuid: restaurant_uuid,
                            category: "wine",
                            unit: template.unit,
                            chapter: template.chapter
                        });


                        if (existingRestaurantLesson) {
                            const updateLesson = await Lesson.findOneAndUpdate(
                                { uuid: existingRestaurantLesson.uuid },
                                {
                                    $addToSet: { menu_items: newEntry.uuid }, // add only if not present
                                    $push: { questions: { $each: processedQuestions } }, // append all new questions
                                    menu_items_model: "GlobalWine",
                                },
                                { new: true }
                            );
                            console.log(`Successfully updated lesson for ${newEntry.product_name} from template ${template.unit_name} - ${template.chapter_name}`);

                        } else {

                            const userProgresses = restaurantUsers.map((ru) => {
                                return {
                                    employeeId: ru.uuid,
                                    status: "not_started"
                                }
                            });


                            // Create a new lesson based on the template
                            const newLesson = new Lesson({
                                category: template.category,
                                unit: template.unit,
                                unit_name: template.unit_name,
                                chapter: template.chapter,
                                chapter_name: template.chapter_name,
                                restaurant_uuid: restaurant_uuid,
                                assignedEmployees: restaurantUsers.map((r) => r.uuid),
                                progress: userProgresses,
                                menu_items: [newEntry.uuid],
                                menu_items_model: "GlobalWine",
                                difficulty: template.difficulty,
                                content: convertContentToMap(template.content),
                                questions: processedQuestions,
                                createdBy: restaurant.createdBy || "system",
                                lastModifiedBy: restaurant.createdBy || "system"
                            });

                            const savedLesson = await newLesson.save();
                            createdLessons.push(savedLesson);
                            console.log(`Successfully created lesson for ${newEntry.product_name} from template ${template.unit_name} - ${template.chapter_name}`);
                        }
                    } catch (templateError) {
                        console.error(`Error processing template ${template.unit_name}:`, templateError);
                    }
                }
                // After all lessons are created and assigned, send email to all users

                return createdLessons;
            }
            return true;
        }
    } catch (error) {
        console.error("Error generating lessons for restaurant:", error);
        throw new Error("Error generating lessons for restaurant");
    }
};

const generateLessonForNewTemplate = async (newTemplate) => {
    try {
        // Get all restaurants
        const restaurants = await Restaurant.find({});

        const { category, unit, chapter, menu_items_model } = newTemplate;

        for (const restaurant of restaurants) {
            const restaurantUsers = await User.find({ assigned_restaurants: restaurant.uuid });
            let menuItems = [];
            let processedQuestions = [];
            let menu_items_model_type = menu_items_model || (category === "food" ? "Dish" : "GlobalWine");

            if (category === "food") {
                menuItems = restaurant.current_dishes?.map(d => d.dish_id) || [];
                const allDishes = await Dish.find({ isDeleted: false, uuid: { $in: menuItems } });
                const config = { validDishTypes, dietaryRestrictions, foodAllergens, temperatureOptions, accommodationOptions };
                let questionCounter = 1;
                processedQuestions = [];
                for (const dish of allDishes) {
                    for (const templateQuestion of newTemplate.questions) {
                        let generated = generateQuestionOptions(templateQuestion, dish, config, restaurant, allDishes, questionCounter, unit, chapter);

                        if (Array.isArray(generated)) {
                            generated.forEach(q => {
                                if (Array.isArray(q.options_variable) && Array.isArray(q.correct_answer_variable)) {
                                    processedQuestions.push(q);
                                    questionCounter++;
                                }
                            });
                        } else if (Array.isArray(generated.options_variable) && Array.isArray(generated.correct_answer_variable)) {
                            processedQuestions.push(generated);
                            questionCounter++;
                        }
                    }
                }
                processedQuestions = assignQuestionUUIDs(processedQuestions);
            } else if (category === "wine") {
                const allWines = await GlobalWine.find({ isDeleted: false, restaurant_uuid: restaurant.uuid });
                menuItems = allWines.map(w => w.uuid);
                const config = { wineCategories, wineStyles };
                let questionCounter = 1;
                processedQuestions = [];
                for (const wine of allWines) {
                    for (const templateQuestion of newTemplate.questions) {
                        let generated = generateWineQuestionOptions(templateQuestion, wine, config, restaurant, allWines, questionCounter);
                        if (Array.isArray(generated)) {
                            generated.forEach(q => {
                                if (Array.isArray(q.options_variable) && Array.isArray(q.correct_answer_variable)) {
                                    processedQuestions.push(q);
                                    questionCounter++;
                                }
                            });
                        } else if (Array.isArray(generated.options_variable) && Array.isArray(generated.correct_answer_variable)) {
                            processedQuestions.push(generated);
                            questionCounter++;
                        }
                    }
                }
                processedQuestions = assignQuestionUUIDs(processedQuestions);
            }

            // Check if lesson for this restaurant/unit/chapter/category exists
            const existingLesson = await Lesson.findOne({
                restaurant_uuid: restaurant.uuid,
                category,
                unit,
                chapter
            });

            if (existingLesson) {
                // Update existing lesson

                await Lesson.findOneAndUpdate(
                    { uuid: existingLesson.uuid },
                    {
                        $push: { questions: { $each: processedQuestions } },
                        content: convertContentToMap(newTemplate.content),
                        lastModifiedBy: restaurant.createdBy || "system"
                    },
                    { new: true }
                );
            } else {
                console.log(processedQuestions, "processedQuestions");
                // Create new lesson for this restaurant/unit/chapter/category
                if (processedQuestions.length > 0) {
                    const userProgresses = restaurantUsers.map((ru) => ({ employeeId: ru.uuid, status: "not_started" }));
                    const newLesson = new Lesson({
                        category,
                        unit,
                        unit_name: newTemplate.unit_name,
                        chapter,
                        chapter_name: newTemplate.chapter_name,
                        restaurant_uuid: restaurant.uuid,
                        assignedEmployees: restaurantUsers.map((r) => r.uuid),
                        progress: userProgresses,
                        menu_items: menuItems,
                        menu_items_model: menu_items_model_type,
                        difficulty: newTemplate.difficulty,
                        content: convertContentToMap(newTemplate.content),
                        questions: processedQuestions,
                        createdBy: restaurant.createdBy || "system",
                        lastModifiedBy: restaurant.createdBy || "system"
                    });
                    await newLesson.save();
                }
            }
        }
        return true;
    } catch (error) {
        console.error("Error updating/creating lessons for new template:", error);
        throw new Error("Error updating/creating lessons for new template");
    }
};

const archiveLessons = async (menu_item) => {
    try {
        const archiveLessons = await Lesson.updateMany(
            {
                isDeleted: false,
                "questions.menu_item": menu_item
            },
            {
                $set: {
                    "questions.$[elem].isDeleted": true
                }
            },
            {
                arrayFilters: [{ "elem.menu_item": menu_item }]
            }
        );


        if (!archiveLessons) return false

        return true
    } catch (error) {
        console.log(error, "error")
        throw new Error("Error deleting lessons!")
    }
};

const permenantDeleteLessons = async (menu_item) => {
    try {
        const deleteLessons = await Lesson.deleteMany({ menu_items: menu_item });

        if (!deleteLessons) return false;

        return true;

    } catch (error) {
        console.log(error, "error");
        throw new error(error.message);
    }
}

const restoreLessons = async (menu_item) => {
    try {
        const restoreLessons = await Lesson.updateMany(
            {
                isDeleted: false,
                "questions.menu_item": menu_item
            },
            {
                $set: {
                    "questions.$[elem].isDeleted": false
                }
            },
            {
                arrayFilters: [{ "elem.menu_item": menu_item }]
            }
        );

        if (!restoreLessons) return false

        return true
    } catch (error) {
        console.log(error, "error")
        throw new Error("Error restoring lessons!")
    }
};

export { generateLessonsForRestaurant, archiveLessons, restoreLessons, permenantDeleteLessons, generateLessonForNewTemplate };