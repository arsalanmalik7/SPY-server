import multer from "multer";
import path from "path";
import fs from "fs";


// Create the uploads directory if it doesn't exist
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        const uploadPath = "uploads";
        if (!fs.existsSync(uploadPath)) {
            fs.mkdirSync(uploadPath, { recursive: true });
        }
        cb(null, uploadPath);
    },
    filename: function (req, file, cb) {
        console.log("file: ", file);
        cb(null, Date.now() + path.extname(file.originalname));
    },
})

const upload = multer({  storage: storage });

export default upload;