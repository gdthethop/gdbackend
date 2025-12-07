const { S3Client, CreateMultipartUploadCommand, UploadPartCommand, CompleteMultipartUploadCommand, AbortMultipartUploadCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');

const s3Client = new S3Client({
    region: process.env.AWS_REGION,
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    },
});

// Initialize multipart upload
exports.initializeMultipartUpload = async (req, res) => {
    try {
        const { fileName, fileType } = req.body;

        if (!fileName) {
            return res.status(400).json({ message: 'fileName is required' });
        }

        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
        const key = `${uniqueSuffix}-${fileName}`;

        const command = new CreateMultipartUploadCommand({
            Bucket: process.env.AWS_BUCKET_NAME_VIDEOS,
            Key: key,
            ContentType: fileType || 'video/mp4',
        });

        const multipartUpload = await s3Client.send(command);

        res.status(200).json({
            uploadId: multipartUpload.UploadId,
            key: key,
        });
    } catch (error) {
        console.error('Error initializing multipart upload:', error);
        res.status(500).json({ message: 'Failed to initialize upload', error: error.message });
    }
};

// Get presigned URLs for uploading parts
exports.getPresignedUrls = async (req, res) => {
    try {
        const { uploadId, key, parts } = req.body;

        if (!uploadId || !key || !parts) {
            return res.status(400).json({ message: 'uploadId, key, and parts are required' });
        }

        const presignedUrls = [];

        for (let i = 0; i < parts; i++) {
            const command = new UploadPartCommand({
                Bucket: process.env.AWS_BUCKET_NAME_VIDEOS,
                Key: key,
                UploadId: uploadId,
                PartNumber: i + 1,
            });

            const presignedUrl = await getSignedUrl(s3Client, command, { expiresIn: 3600 }); // 1 hour
            presignedUrls.push({ partNumber: i + 1, url: presignedUrl });
        }

        res.status(200).json({ presignedUrls });
    } catch (error) {
        console.error('Error generating presigned URLs:', error);
        res.status(500).json({ message: 'Failed to generate presigned URLs', error: error.message });
    }
};

// Complete multipart upload
exports.completeMultipartUpload = async (req, res) => {
    try {
        const { uploadId, key, parts } = req.body;

        if (!uploadId || !key || !parts) {
            return res.status(400).json({ message: 'uploadId, key, and parts are required' });
        }

        const command = new CompleteMultipartUploadCommand({
            Bucket: process.env.AWS_BUCKET_NAME_VIDEOS,
            Key: key,
            UploadId: uploadId,
            MultipartUpload: {
                Parts: parts.map(part => ({
                    ETag: part.ETag,
                    PartNumber: part.PartNumber,
                })),
            },
        });

        const result = await s3Client.send(command);

        const videoUrl = `https://${process.env.AWS_BUCKET_NAME_VIDEOS}.s3.${process.env.AWS_REGION}.amazonaws.com/${key}`;

        res.status(200).json({
            message: 'Upload completed successfully',
            videoUrl: videoUrl,
            location: result.Location,
        });
    } catch (error) {
        console.error('Error completing multipart upload:', error);
        res.status(500).json({ message: 'Failed to complete upload', error: error.message });
    }
};

// Abort multipart upload (cleanup on failure)
exports.abortMultipartUpload = async (req, res) => {
    try {
        const { uploadId, key } = req.body;

        if (!uploadId || !key) {
            return res.status(400).json({ message: 'uploadId and key are required' });
        }

        const command = new AbortMultipartUploadCommand({
            Bucket: process.env.AWS_BUCKET_NAME_VIDEOS,
            Key: key,
            UploadId: uploadId,
        });

        await s3Client.send(command);

        res.status(200).json({ message: 'Upload aborted successfully' });
    } catch (error) {
        console.error('Error aborting multipart upload:', error);
        res.status(500).json({ message: 'Failed to abort upload', error: error.message });
    }
};
