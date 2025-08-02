import express from 'express';
import multer from 'multer';
import { importToDatabase } from '../seedData/seedDatabase.mjs';
import BulkUploadController from '../controllers/bulkUploadController.mjs';
import { authMiddleware } from '../middleware/auth.mjs';
import { checkPermission } from '../middleware/auth.mjs';
import globalUpload from '../config/multerConfig.mjs';

const router = express.Router();
const upload = multer({
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
  },
  fileFilter: (req, file, cb) => {
    // Accept CSV and Excel files by mimetype or extension
    const allowedMimes = [
      'text/csv',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-excel'
    ];
    const allowedExts = ['.csv', '.xls', '.xlsx'];
    const ext = file.originalname.slice(file.originalname.lastIndexOf('.')).toLowerCase();
    if (allowedMimes.includes(file.mimetype) || allowedExts.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Only CSV and Excel files (.csv, .xls, .xlsx) are allowed'));
    }
  }
});

// Get upload template information
router.get('/template/:type', authMiddleware, BulkUploadController.getUploadTemplate);

// Download Excel template
router.get('/template/:type/download', authMiddleware, BulkUploadController.downloadTemplate);

// Bulk upload endpoints
router.post('/dishes', authMiddleware, upload.single('file'), BulkUploadController.uploadDishes);
router.post('/wines', authMiddleware, upload.single('file'), BulkUploadController.uploadWines);
router.post('/employees', authMiddleware, upload.single('file'), BulkUploadController.uploadEmployees);
router.post("/create/:bulkUploadType", authMiddleware, globalUpload.single("file"), importToDatabase)

export default router; 