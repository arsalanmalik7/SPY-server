import BulkUploadService from '../services/bulkUploadService.mjs';
import * as XLSX from 'xlsx';
import nodemailer from "nodemailer"
import jwt from "jsonwebtoken"

class BulkUploadController {
  static async uploadDishes(req, res) {
    try {
      if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
      }

      const rows = await BulkUploadService.validateCSVFormat(req.file, 'dishes');
      const results = await BulkUploadService.processDishUpload(rows, req.user.restaurantId);

      res.json({
        message: 'Bulk upload processed',
        totalProcessed: rows.length,
        successful: results.success.length,
        failed: results.errors.length,
        errors: results.errors
      });
    } catch (error) {
      console.error('Error processing dish upload:', error);

      // Provide more helpful error messages
      let errorMessage = error.message;
      let guidance = 'Please ensure your file is properly formatted.';

      if (errorMessage.includes('Missing required columns')) {
        guidance = 'Your Excel file is missing required columns. Please download a template and follow its format.';
      } else if (errorMessage.includes('No valid data rows found')) {
        guidance = 'Your Excel file appears to be empty or doesn\'t contain any valid data rows.';
      } else if (errorMessage.includes('Error parsing Excel file')) {
        guidance = 'There was an error parsing your Excel file. Please ensure it\'s a valid Excel file and try again.';
      }

      res.status(400).json({
        error: errorMessage,
        details: guidance,
        help: 'You can download a template using the /api/bulk-upload/template/dishes/download endpoint'
      });
    }
  }

  static async uploadWines(req, res) {
    try {
      if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
      }

      const rows = await BulkUploadService.validateCSVFormat(req.file, 'wines');
      const results = await BulkUploadService.processWineUpload(rows, req.user.restaurantId);

      res.json({
        message: 'Bulk upload processed',
        totalProcessed: rows.length,
        successful: results.success.length,
        failed: results.errors.length,
        errors: results.errors
      });
    } catch (error) {
      console.error('Error processing wine upload:', error);

      // Provide more helpful error messages
      let errorMessage = error.message;
      let guidance = 'Please ensure your file is properly formatted.';

      if (errorMessage.includes('Missing required columns')) {
        guidance = 'Your Excel file is missing required columns. Please download a template and follow its format.';
      } else if (errorMessage.includes('No valid data rows found')) {
        guidance = 'Your Excel file appears to be empty or doesn\'t contain any valid data rows.';
      } else if (errorMessage.includes('Error parsing Excel file')) {
        guidance = 'There was an error parsing your Excel file. Please ensure it\'s a valid Excel file and try again.';
      }

      res.status(400).json({
        error: errorMessage,
        details: guidance,
        help: 'You can download a template using the /api/bulk-upload/template/wines/download endpoint'
      });
    }
  }

  static async uploadEmployees(req, res) {
    try {
      const { restaurant_uuid } = req.body;

      if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
      }

     

      const rows = await BulkUploadService.validateCSVFormat(req.file, 'employees');
      const results = await BulkUploadService.processEmployeeUpload(rows, restaurant_uuid);

      // Extract temporary passwords for successful uploads
      const users = results.success.map(user => ({
        email: user.email,
        firstName: user.first_name,
        lastName: user.last_name,
        role: user.role,
        uuid: user.uuid
      }));

      // Send password setup email to each new user
      const transporter = nodemailer.createTransport({
        service: "speakyourmenu.com",
        auth: {
          user: process.env.MAILTRAP_USER,
          pass: process.env.MAILTRAP_PASS,
        },
      });
      for (const user of users) {
        // Generate password reset token
        const resetToken = jwt.sign(
          { uuid: user.uuid },
          process.env.JWT_SECRET,
          { expiresIn: "24h" }
        );
        let resetURL;
        if (process.env.NODE_ENV === "development") {
          resetURL = `http://localhost:3000/reset-password?token=${resetToken}`;
        } else {
          resetURL = `https://beauty.instantsolutionslab.site/reset-password?token=${resetToken}`;
        }
        await transporter.sendMail({
          from: process.env.SMTP_USER,
          to: user.email,
          subject: "Welcome to Speak Your Menu! Activate Your Account",
          html: `
            <div style="font-family:Arial,sans-serif;font-size:15px;">
              <p>Hi ${user.firstName} ${user.lastName},</p>
              <p>You have been invited to join Speak Your Menu. Please click the link below to set your password and activate your account:</p>
              <a href="${resetURL}">${resetURL}</a>
              <p>This link will expire in 24 hours for your security.</p>
              <p>If you did not expect this invitation, please ignore this email.</p>
              <p>Best regards,<br/>The Speak Your Menu Team</p>
            </div>
          `
        });
      }

      // Send summary email to admin/uploader
      if (req.user && req.user.email && req.user.first_name) {
        const reportText = `Bulk Upload Report\n\nSuccessful uploads: ${results.success.length}\nFailed uploads: ${results.errors.length}\n\nErrors:\n${results.errors.map(e => e.message || e).join('\n')}`;
        await transporter.sendMail({
          from: process.env.SMTP_USER,
          to: req.user.email,
          subject: "Bulk Upload Summary",
          html: `
            <div style="font-family:Arial,sans-serif;font-size:15px;">
              <p>Hi ${req.user.first_name},</p>
              <p>Your recent bulk upload has completed. Here is a summary:</p>
              <ul>
                <li>Successful uploads: ${results.success.length}</li>
                <li>Failed uploads: ${results.errors.length}</li>
                <li>Errors: ${results.errors.length > 0 ? results.errors.map(e => e.message || e).join('<br/>') : 'None'}</li>
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

      res.json({
        message: 'Bulk upload processed',
        totalProcessed: rows.length,
        successful: results.success.length,
        failed: results.errors.length,
        errors: results.errors,
        usersWithPasswords: users,
      });
    } catch (error) {
      console.error('Error processing employee upload:', error);

      // Provide more helpful error messages
      let errorMessage = error.message;
      let guidance = 'Please ensure your file is properly formatted.';

      if (errorMessage.includes('Missing required columns')) {
        guidance = 'Your Excel file is missing required columns. Please download a template and follow its format.';
      } else if (errorMessage.includes('No valid data rows found')) {
        guidance = 'Your Excel file appears to be empty or doesn\'t contain any valid data rows.';
      } else if (errorMessage.includes('Error parsing Excel file')) {
        guidance = 'There was an error parsing your Excel file. Please ensure it\'s a valid Excel file and try again.';
      }

      res.status(400).json({
        error: errorMessage,
        details: guidance,
        help: 'You can download a template using the /api/bulk-upload/template/employees/download endpoint'
      });
    }
  }

  static async getUploadTemplate(req, res) {
    const { type } = req.params;
    const templates = {
      dishes: {
        headers: ['name', 'description', 'price', 'category', 'ingredients', 'allergens', 'temperature', 'dietary_restrictions', 'can_substitute', 'substitution_notes', 'imageUrl'],
        example: {
          name: 'Margherita Pizza',
          description: 'Classic tomato and mozzarella pizza',
          price: '12.99',
          category: 'Pizza',
          ingredients: 'Tomato sauce, mozzarella, basil',
          allergens: 'Dairy, gluten',
          temperature: 'Hot',
          dietary_restrictions: 'Vegetarian',
          can_substitute: 'true',
          substitution_notes: 'Can substitute mozzarella with vegan cheese',
          imageUrl: 'https://example.com/pizza.jpg'
        },
        fileFormats: ['CSV', 'Excel (XLSX)'],
        notes: 'For Excel files, ensure the first row contains the column headers. For image URLs, use publicly accessible URLs.'
      },
      wines: {
        headers: ['producer_name', 'product_name', 'varietals', 'country', 'major_region', 'vintage', 'category', 'style', 'price', 'imageUrl'],
        example: {
          producer_name: 'Château Margaux',
          product_name: 'Grand Cru Classé',
          varietals: 'Cabernet Sauvignon, Merlot',
          country: 'France',
          major_region: 'Bordeaux',
          vintage: '2015',
          category: 'red',
          style: 'Full-bodied',
          price: '299.99',
          imageUrl: 'https://example.com/wine.jpg'
        },
        fileFormats: ['CSV', 'Excel (XLSX)'],
        notes: 'For Excel files, ensure the first row contains the column headers. For image URLs, use publicly accessible URLs.'
      },
      employees: {
        headers: ['email', 'firstName', 'lastName', 'role'],
        example: {
          email: 'john.doe@restaurant.com',
          firstName: 'John',
          lastName: 'Doe',
          role: 'waiter'
        },
        fileFormats: ['CSV', 'Excel (XLSX)'],
        notes: 'For Excel files, ensure the first row contains the column headers. Valid roles include: waiter, manager, chef, etc.'
      }
    };

    if (!templates[type]) {
      return res.status(400).json({ error: 'Invalid template type' });
    }

    res.json(templates[type]);
  }

  static async downloadTemplate(req, res) {
    const { type } = req.params;
    const templates = {
      dishes: {
        headers: ['name', 'description', 'price', 'category', 'ingredients', 'allergens', 'temperature', 'dietary_restrictions', 'can_substitute', 'substitution_notes', 'imageUrl'],
        examples: [
          {
            name: 'Margherita Pizza',
            description: 'Classic tomato and mozzarella pizza',
            price: '12.99',
            category: 'Pizza',
            ingredients: 'Tomato sauce, mozzarella, basil',
            allergens: 'Dairy, gluten',
            temperature: 'Hot',
            dietary_restrictions: 'Vegetarian',
            can_substitute: 'true',
            substitution_notes: 'Can substitute mozzarella with vegan cheese',
            imageUrl: 'https://example.com/pizza.jpg'
          },
          {
            name: 'Caesar Salad',
            description: 'Fresh romaine lettuce with Caesar dressing',
            price: '8.99',
            category: 'Salad',
            ingredients: 'Romaine lettuce, parmesan, croutons, Caesar dressing',
            allergens: 'Dairy, gluten, eggs',
            temperature: 'Cold',
            dietary_restrictions: 'Vegetarian',
            can_substitute: 'true',
            substitution_notes: 'Can substitute parmesan with vegan cheese',
            imageUrl: 'https://example.com/salad.jpg'
          }
        ]
      },
      wines: {
        headers: ['producer_name', 'product_name', 'varietals', 'country', 'major_region', 'vintage', 'category', 'style', 'price', 'imageUrl'],
        examples: [
          {
            producer_name: 'Château Margaux',
            product_name: 'Grand Cru Classé',
            varietals: 'Cabernet Sauvignon, Merlot',
            country: 'France',
            major_region: 'Bordeaux',
            vintage: '2015',
            category: 'red',
            style: 'Full-bodied',
            price: '299.99',
            imageUrl: 'https://example.com/wine1.jpg'
          },
          {
            producer_name: 'Domaine de la Romanée-Conti',
            product_name: 'La Tâche',
            varietals: 'Pinot Noir',
            country: 'France',
            major_region: 'Burgundy',
            vintage: '2018',
            category: 'red',
            style: 'Medium-bodied',
            price: '599.99',
            imageUrl: 'https://example.com/wine2.jpg'
          }
        ]
      },
      employees: {
        headers: ['email', 'firstName', 'lastName', 'role'],
        examples: [
          {
            email: 'john.doe@restaurant.com',
            firstName: 'John',
            lastName: 'Doe',
            role: 'waiter'
          },
          {
            email: 'jane.smith@restaurant.com',
            firstName: 'Jane',
            lastName: 'Smith',
            role: 'chef'
          }
        ]
      }
    };

    if (!templates[type]) {
      return res.status(400).json({ error: 'Invalid template type' });
    }

    try {
      // Create a new workbook
      const workbook = XLSX.utils.book_new();

      // Create a worksheet with headers and examples
      const worksheet = XLSX.utils.json_to_sheet(
        templates[type].examples,
        { header: templates[type].headers }
      );

      // Add the worksheet to the workbook
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Template');

      // Generate the Excel file as a buffer
      const excelBuffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

      // Set response headers
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename=${type}_template.xlsx`);

      // Send the file
      res.send(excelBuffer);
    } catch (error) {
      console.error('Error generating template:', error);
      res.status(500).json({ error: 'Failed to generate template' });
    }
  }
}

export default BulkUploadController; 