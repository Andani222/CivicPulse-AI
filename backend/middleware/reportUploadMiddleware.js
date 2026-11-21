
const multer = require('multer');
const path = require('path');
const crypto = require('crypto');

// Store submitted report photographs on the backend computer.
const storage = multer.diskStorage({
    destination: (req, file, callback) => {
        callback(null, path.join(__dirname, '..', 'uploads', 'reports'));
    },

    filename: (req, file, callback) => {
        const extension = path.extname(file.originalname).toLowerCase();
        const uniqueName = `${Date.now()}-${crypto.randomUUID()}${extension}`;

        callback(null, uniqueName);
    }
});

// Only accept supported image formats.
const fileFilter = (req, file, callback) => {
    const allowedTypes = [
        'image/jpeg',
        'image/png',
        'image/webp'
    ];

    if (!allowedTypes.includes(file.mimetype)) {
        return callback(
            new Error('Only JPEG, PNG and WebP images are allowed.')
        );
    }

    callback(null, true);
};

const reportUpload = multer({
    storage,
    fileFilter,
    limits: {
        fileSize: 10 * 1024 * 1024,
        files: 1
    }
});

module.exports = reportUpload;
