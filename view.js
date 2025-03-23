import express from 'express';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { Image } from './models/Image.js';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const port = process.env.PORT || 3000;

// Rate limiting
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100 // limit each IP to 100 requests per windowMs
});

// Security middleware
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            imgSrc: ["'self'", "data:", "blob:"],
            styleSrc: ["'self'", "'unsafe-inline'"],
        },
    },
}));
app.use(cors());
app.use(limiter);

let isConnected = false;

const connectDB = async () => {
    if (isConnected) return;
    
    try {
        await mongoose.connect(process.env.MONGODB_URI, {
            dbName: 'whatsapp_images',
            useNewUrlParser: true,
            useUnifiedTopology: true,
            serverSelectionTimeoutMS: 5000,
            socketTimeoutMS: 45000,
        });
        isConnected = true;
        console.log('Connected to MongoDB');
    } catch (error) {
        console.error('MongoDB connection error:', error);
    }
};

// Error handling middleware
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({
        error: 'Something went wrong!',
        message: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
});

// Route to serve image data
app.get('/api/image/:id', async (req, res) => {
    try {
        await connectDB();
        const image = await Image.findById(req.params.id);
        if (!image) {
            return res.status(404).send('Image not found');
        }
        res.set('Content-Type', image.contentType);
        res.set('Cache-Control', 'public, max-age=31536000');
        res.send(image.imageData);
    } catch (error) {
        console.error('Error serving image:', error);
        res.status(500).send('Error serving image');
    }
});

// Route to display all images
app.get('/api/images', async (req, res) => {
    try {
        await connectDB();
        const images = await Image.find().sort({ timestamp: -1 });
        res.set('Cache-Control', 'public, max-age=300');
        res.json(images);
    } catch (error) {
        console.error('Error fetching images:', error);
        res.status(500).json({ error: 'Error fetching images' });
    }
});

app.get('/', async (req, res) => {
    try {
        await connectDB();
        const images = await Image.find().sort({ timestamp: -1 });
        res.set('Cache-Control', 'public, max-age=300');
        res.send(`
            <html>
                <head>
                    <title>WhatsApp Images</title>
                    <meta name="viewport" content="width=device-width, initial-scale=1.0">
                    <style>
                        body { 
                            font-family: Arial, sans-serif; 
                            margin: 20px;
                            background-color: #f5f5f5;
                        }
                        .container {
                            max-width: 1200px;
                            margin: 0 auto;
                        }
                        .image-grid { 
                            display: grid; 
                            grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); 
                            gap: 20px;
                            padding: 20px;
                        }
                        .image-card { 
                            border: 1px solid #ddd; 
                            padding: 10px; 
                            border-radius: 8px;
                            background-color: white;
                            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
                            transition: transform 0.2s;
                        }
                        .image-card:hover {
                            transform: translateY(-5px);
                        }
                        .image-card img { 
                            width: 100%; 
                            height: 300px; 
                            object-fit: cover; 
                            border-radius: 4px;
                        }
                        .image-info { 
                            margin-top: 10px;
                            padding: 10px;
                        }
                        .timestamp { 
                            color: #666; 
                            font-size: 0.9em;
                        }
                        .download-btn { 
                            display: inline-block; 
                            padding: 8px 16px; 
                            background: #4CAF50; 
                            color: white; 
                            text-decoration: none; 
                            border-radius: 4px;
                            margin-top: 10px;
                            transition: background 0.2s;
                        }
                        .download-btn:hover { 
                            background: #45a049;
                        }
                        h1 {
                            text-align: center;
                            color: #333;
                            margin-bottom: 30px;
                        }
                        .loading {
                            text-align: center;
                            padding: 20px;
                            font-size: 1.2em;
                            color: #666;
                        }
                    </style>
                </head>
                <body>
                    <div class="container">
                        <h1>WhatsApp Images</h1>
                        <div class="image-grid">
                            ${images.map(image => `
                                <div class="image-card">
                                    <img src="/api/image/${image._id}" alt="WhatsApp Image" loading="lazy">
                                    <div class="image-info">
                                        <p><strong>Sender:</strong> ${image.sender}</p>
                                        <p><strong>Caption:</strong> ${image.caption || 'No caption'}</p>
                                        <p class="timestamp"><strong>Date:</strong> ${new Date(image.timestamp).toLocaleString()}</p>
                                        <a href="/api/image/${image._id}" download="whatsapp-image-${image._id}.jpg" class="download-btn">Download Image</a>
                                    </div>
                                </div>
                            `).join('')}
                        </div>
                    </div>
                </body>
            </html>
        `);
    } catch (error) {
        console.error('Error fetching images:', error);
        res.status(500).send('Error fetching images');
    }
});

if (process.env.NODE_ENV !== 'production') {
    app.listen(port, () => {
        console.log(`View your images at http://localhost:${port}`);
    });
}

export default app; 