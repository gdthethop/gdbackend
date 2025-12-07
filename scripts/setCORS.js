const { S3Client, PutBucketCorsCommand } = require('@aws-sdk/client-s3');
require('dotenv').config();

const s3Client = new S3Client({
    region: process.env.AWS_REGION,
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    },
});

const corsConfiguration = {
    CORSRules: [
        {
            AllowedHeaders: ['*'],
            AllowedMethods: ['GET', 'PUT', 'POST', 'DELETE', 'HEAD'],
            AllowedOrigins: [
                'http://localhost:3000',
                'http://localhost:5000',
                // Add your production domain here when deploying
                // 'https://yourdomain.com'
            ],
            ExposeHeaders: [
                'ETag',
                'x-amz-server-side-encryption',
                'x-amz-request-id',
                'x-amz-id-2'
            ],
            MaxAgeSeconds: 3000,
        },
    ],
};

async function setCORS() {
    try {
        const command = new PutBucketCorsCommand({
            Bucket: process.env.AWS_BUCKET_NAME_VIDEOS,
            CORSConfiguration: corsConfiguration,
        });

        await s3Client.send(command);
        console.log('✅ CORS configuration set successfully for bucket:', process.env.AWS_BUCKET_NAME_VIDEOS);
    } catch (error) {
        console.error('❌ Error setting CORS:', error);
    }
}

setCORS();
