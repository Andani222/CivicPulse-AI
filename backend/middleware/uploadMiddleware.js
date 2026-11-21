
const multer = require('multer');

// Store uploaded images temporarily in memory.
// Express will forward them to the Python AI service.
const storage = multer.memoryStorage();

const fileFilter = (req, file, callback) => {
    console.log('Uploaded filename:', file.originalname);
    console.log('Uploaded MIME type:', file.mimetype);

    if (!file.mimetype || !file.mimetype.startsWith('image/')) {
        return callback(new Error('Only image files are allowed.'));
    }

    callback(null, true);
};

const upload = multer({
    storage,
    fileFilter,
    limits: {
        fileSize: 10 * 1024 * 1024, // 10 MB maximum
        files: 1
    }
});

module.exports = upload;
