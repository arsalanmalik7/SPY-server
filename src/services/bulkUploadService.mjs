import { parse } from 'csv-parse';
import { Readable } from 'stream';
import { Dish } from '../schema/dishschema.mjs';
import { GlobalWine } from '../schema/wineschema.mjs';
import { User } from '../schema/userschema.mjs';
import { Restaurant } from '../schema/restaurantschema.mjs';
import { RestaurantWine } from '../schema/restaurantWineSchema.mjs';
import * as XLSX from 'xlsx';
import bcrypt from 'bcrypt';
import crypto from 'crypto';

class BulkUploadService {
  static async validateCSVFormat(file, type) {
    const requiredFields = {
      dishes: [
        'name',
        'description',
        'price',
        'category',
        'ingredients',
        'allergens',
        'temperature',
        'dietary_restrictions',
        'can_substitute',
        'substitution_notes',
        'imageUrl'
      ],
      wines: [
        'producer_name',
        'product_name',
        'varietals',
        'country',
        'major_region',
        'vintage',
        'category',
        'style',
        'price',
        'imageUrl'
      ],
      employees: [
        'email',
        'firstName',
        'lastName',
        'role'
      ]
    };

    // Check if the file is an Excel file
    if (file.mimetype === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
      file.mimetype === 'application/vnd.ms-excel') {
      return this.parseExcelFile(file, requiredFields[type]);
    }

    // Otherwise, parse as CSV
    return new Promise((resolve, reject) => {
      const results = [];
      const parser = parse({
        columns: true,
        skip_empty_lines: true
      });

      Readable.from(file.buffer)
        .pipe(parser)
        .on('data', (row) => {
          // Validate required fields
          const missingFields = requiredFields[type].filter(field => {
            const value = row[field];
            return value === undefined || value === null || value === '';
          });

          if (missingFields.length > 0) {
            reject(new Error(`Missing required fields: ${missingFields.join(', ')}`));
            return;
          }

          // Validate price format
          if (type === 'dishes' || type === 'wines') {
            const price = parseFloat(row.price);
            if (isNaN(price) || price <= 0) {
              reject(new Error(`Invalid price format: ${row.price}. Price must be a positive number.`));
              return;
            }
          }

          // Validate email format for employees
          if (type === 'employees') {
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (!emailRegex.test(row.email)) {
              reject(new Error(`Invalid email format: ${row.email}`));
              return;
            }
          }

          // Validate role for employees
          if (type === 'employees') {
            const validRoles = ['waiter', 'manager', 'chef', 'director', 'employee'];
            if (!validRoles.includes(row.role.toLowerCase())) {
              reject(new Error(`Invalid role: ${row.role}. Must be one of: ${validRoles.join(', ')}`));
              return;
            }
          }

          results.push(row);
        })
        .on('end', () => {
          if (results.length === 0) {
            reject(new Error('No valid data rows found in the file'));
            return;
          }
          resolve(results);
        })
        .on('error', reject);
    });
  }

  static async parseExcelFile(file, requiredFields) {
    try {
      // Read the Excel file
      const workbook = XLSX.read(file.buffer, { type: 'buffer' });

      // Get the first worksheet
      const firstSheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[firstSheetName];

      // Get the headers from the first row
      const range = XLSX.utils.decode_range(worksheet['!ref']);
      const headers = [];
      for (let C = range.s.c; C <= range.e.c; ++C) {
        const cell = worksheet[XLSX.utils.encode_cell({ r: 0, c: C })];
        headers[C] = cell ? cell.v : undefined;
      }

      // Log headers for debugging
      console.log('Excel headers:', headers);

      // Create a mapping of column names to their indices
      const columnMap = {};
      headers.forEach((header, index) => {
        if (header) {
          // Store both the original and lowercase version of the header
          columnMap[header] = index;
          columnMap[header.toLowerCase()] = index;
        }
      });

      // Map required fields to their corresponding column indices
      const fieldMap = {};
      const missingFields = [];

      // Define common variations of field names
      const fieldVariations = {
        // Dish fields
        name: ['name', 'title', 'dish name', 'item name', 'product name'],
        description: ['description', 'desc', 'details', 'about'],
        price: ['price', 'cost', 'amount', 'retail price', 'sale price', 'bottle price', 'wine price', 'list price'],
        category: ['category', 'type', 'dish type', 'item type'],
        ingredients: ['ingredients', 'ingredient list', 'components'],
        allergens: ['allergens', 'allergen info', 'contains'],
        temperature: ['temperature', 'temp', 'serving temp', 'serving temperature'],
        dietary_restrictions: ['dietary restrictions', 'dietary', 'restrictions', 'dietary info'],
        can_substitute: ['can substitute', 'substitute allowed', 'substitution allowed'],
        substitution_notes: ['substitution notes', 'sub notes', 'sub info'],
        imageUrl: ['imageurl', 'image url', 'image', 'photo', 'picture', 'img', 'label image'],

        // Wine fields
        producer_name: ['producer name', 'producer', 'winery', 'maker', 'brand'],
        product_name: ['product name', 'wine name', 'name', 'label'],
        varietals: ['varietals', 'variety', 'grape variety', 'grape varietal', 'grape'],
        country: ['country', 'origin', 'country of origin'],
        major_region: ['major region', 'region', 'wine region', 'appellation'],
        vintage: ['vintage', 'year'],
        category: ['category', 'wine type', 'type'],
        style: ['style', 'wine style'],
        wineType: ['wine type', 'wine style', 'style']
      };

      // Try to map each required field to a column
      for (const field of requiredFields) {
        let found = false;

        // Check the field variations
        if (fieldVariations[field]) {
          for (const variation of fieldVariations[field]) {
            if (columnMap[variation] !== undefined) {
              fieldMap[field] = columnMap[variation];
              found = true;
              break;
            }
          }
        }

        // If not found through variations, try direct match
        if (!found && columnMap[field] !== undefined) {
          fieldMap[field] = columnMap[field];
          found = true;
        }

        if (!found) {
          missingFields.push(field);
        }
      }

      if (missingFields.length > 0) {
        // Provide more helpful error message for missing price
        if (missingFields.includes('price')) {
          throw new Error(`Missing required column: price. Please add a column for the price. Found columns: ${headers.filter(Boolean).join(', ')}`);
        }

        throw new Error(`Missing required columns: ${missingFields.join(', ')}. Found columns: ${headers.filter(Boolean).join(', ')}`);
      }

      // Convert to JSON with proper field mapping
      const rawData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

      // Skip the header row and map the data
      const results = [];
      for (let i = 1; i < rawData.length; i++) {
        const row = rawData[i];
        if (!row || row.length === 0) continue;

        const mappedRow = {};
        for (const [field, index] of Object.entries(fieldMap)) {
          mappedRow[field] = row[index];
        }

        // Check for missing values
        const missingValues = requiredFields.filter(field => !mappedRow[field]);
        if (missingValues.length > 0) {
          console.warn(`Row ${i + 1} is missing values for: ${missingValues.join(', ')}`);
          // Continue processing other rows
        }

        results.push(mappedRow);
      }

      if (results.length === 0) {
        throw new Error('No valid data rows found in the Excel file');
      }

      return results;
    } catch (error) {
      console.error('Excel parsing error:', error);
      throw new Error(`Error parsing Excel file: ${error.message}`);
    }
  }

  static async processDishUpload(rows, restaurantId) {
    const results = {
      success: [],
      errors: []
    };

    for (const row of rows) {
      try {
        const existingDish = await Dish.findOne({
          isDeleted: false,
          name: row.name,
          restaurantId
        });

        if (existingDish) {
          results.errors.push({
            row,
            error: 'Dish already exists'
          });
          continue;
        }

        // Convert category to type array as per schema
        const type = Array.isArray(row.category) ? row.category : [row.category];

        // Convert string arrays if needed
        const ingredients = Array.isArray(row.ingredients) ? row.ingredients :
          (typeof row.ingredients === 'string' ? row.ingredients.split(',').map(i => i.trim()) : []);

        const allergens = Array.isArray(row.allergens) ? row.allergens :
          (typeof row.allergens === 'string' ? row.allergens.split(',').map(a => a.trim()) : []);

        const dietary_restrictions = Object.isArray(row.dietary_restrictions) ? row.dietary_restrictions :
          (typeof row.dietary_restrictions === 'string' ? row.dietary_restrictions.split(',').map(d => d.trim()) : []);

        const dish = new Dish({
          name: row.name,
          description: row.description,
          type: type,
          price: parseFloat(row.price),
          ingredients: ingredients,
          allergens: allergens,
          temperature: row.temperature,
          dietary_restrictions: dietary_restrictions,
          can_substitute: row.can_substitute === 'true' || row.can_substitute === true,
          substitution_notes: row.substitution_notes,
          image_url: row.imageUrl,
          notes: row.notes || '',
          restaurantId
        });

        console.log(dish, "dish");
        // await dish.save();
        results.success.push(dish);
      } catch (error) {
        results.errors.push({
          row,
          error: error.message
        });
      }
    }

    return results;
  }

  static async processWineUpload(rows, restaurantId) {
    const results = {
      success: [],
      errors: []
    };

    for (const row of rows) {
      try {
        // Check if wine exists in global database
        const existingWine = await GlobalWine.findOne({
          isDeleted: false,
          producer_name: row.producer_name,
          product_name: row.product_name,
          vintage: parseInt(row.vintage)
        });

        let wineId;

        if (existingWine) {
          // If wine exists, use its ID
          wineId = existingWine.uuid;
        } else {
          // Convert varietals to array if needed
          const varietals = Array.isArray(row.varietals) ? row.varietals :
            (typeof row.varietals === 'string' ? row.varietals.split(',').map(v => v.trim()) : []);

          const wine = new GlobalWine({
            producer_name: row.producer_name,
            product_name: row.product_name,
            varietals: varietals,
            region: {
              country: row.country,
              major_region: row.major_region
            },
            vintage: parseInt(row.vintage),
            category: row.category,
            style: {
              name: row.style
            },
            image_url: row.imageUrl
          });

          await wine.save();
          wineId = wine.uuid;
        }

        // Check if this wine is already linked to this restaurant
        const existingRestaurantWine = await RestaurantWine.findOne({
          restaurant_id: restaurantId,
          wine_id: wineId
        });

        if (existingRestaurantWine) {
          // Update the price if it's different
          if (existingRestaurantWine.price !== parseFloat(row.price)) {
            existingRestaurantWine.price = parseFloat(row.price);
            await existingRestaurantWine.save();
          }

          results.success.push({
            wine: existingWine || wineId,
            restaurantWine: existingRestaurantWine
          });
        } else {
          // Create a new restaurant-wine relationship
          const restaurantWine = new RestaurantWine({
            restaurant_id: restaurantId,
            wine_id: wineId,
            price: parseFloat(row.price),
            is_active: true
          });

          await restaurantWine.save();

          results.success.push({
            wine: existingWine || wineId,
            restaurantWine: restaurantWine
          });
        }
      } catch (error) {
        results.errors.push({
          row,
          error: error.message
        });
      }
    }

    return results;
  }

  static async processEmployeeUpload(rows, restaurantId) {
    const results = {
      success: [],
      errors: []
    };

    for (const row of rows) {
      try {
        const existingUser = await User.findOne({
          email: row.email
        });

        if (existingUser) {
          results.errors.push({
            row,
            error: 'Employee already exists'
          });
          continue;
        }

       console.log(row, "row");


        const user = await User.create({
          first_name: row.firstName,
          last_name: row.lastName,
          email: row.email,
          role: row.role.toLowerCase(),
          active: true,
          assigned_restaurants: [restaurantId],
        });

        console.log(user, "user");
        


        results.success.push(user);
      } catch (error) {
        results.errors.push({
          row,
          error: error.message
        });
      }
    }

    return results;
  }
}

export default BulkUploadService; 