#!/usr/bin/env node

/**
 * Script to configure CORS for S3 buckets
 * This fixes the "No 'Access-Control-Allow-Origin' header" error
 * when uploading directly to S3 from the browser
 */

require('dotenv').config();
const { S3Client, PutBucketCorsCommand, GetBucketCorsCommand } = require('@aws-sdk/client-s3');

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
                'http://localhost:3001',
                'https://yourdomain.com', // Replace with your actual production domain
                '*' // Allow all origins (remove this in production for better security)
            ],
            ExposeHeaders: [
                'ETag',
                'x-amz-server-side-encryption',
                'x-amz-request-id',
                'x-amz-id-2'
            ],
            MaxAgeSeconds: 3000
        }
    ]
};

async function configureCORS(bucketName) {
    try {
        console.log(`\n🔧 Configuring CORS for bucket: ${bucketName}...`);

        // Apply CORS configuration
        const putCommand = new PutBucketCorsCommand({
            Bucket: bucketName,
            CORSConfiguration: corsConfiguration,
        });

        await s3Client.send(putCommand);
        console.log(`✅ CORS configuration applied successfully to ${bucketName}`);

        // Verify the configuration
        const getCommand = new GetBucketCorsCommand({ Bucket: bucketName });
        const response = await s3Client.send(getCommand);

        console.log(`\n📋 Current CORS configuration for ${bucketName}:`);
        console.log(JSON.stringify(response.CORSRules, null, 2));

    } catch (error) {
        console.error(`❌ Error configuring CORS for ${bucketName}:`, error.message);
        throw error;
    }
}

async function main() {
    console.log('🚀 Starting S3 CORS Configuration...\n');

    const buckets = [
        process.env.AWS_BUCKET_NAME, // Main videos bucket
        process.env.AWS_BUCKET_NAME_THUMBNAILS, // Thumbnails bucket
    ].filter(Boolean); // Remove undefined buckets

    if (buckets.length === 0) {
        console.error('❌ No bucket names found in environment variables!');
        console.log('Please set AWS_BUCKET_NAME and/or AWS_BUCKET_NAME_THUMBNAILS in your .env file');
        process.exit(1);
    }

    for (const bucket of buckets) {
        await configureCORS(bucket);
    }

    console.log('\n✨ All done! Your S3 buckets are now configured for CORS.');
    console.log('You can now upload videos directly from the browser.\n');
}

// Run the script
main().catch((error) => {
    console.error('\n💥 Script failed:', error);
    process.exit(1);
});
