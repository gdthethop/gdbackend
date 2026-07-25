const {
  S3Client,
  CreateMultipartUploadCommand,
  UploadPartCommand,
  CompleteMultipartUploadCommand,
  AbortMultipartUploadCommand,
} = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');

// Dedicated S3 client for multipart uploads (separate from the multer-s3 instance in config/s3.js)
const s3Client = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId:     process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

/**
 * POST /api/multipart-upload/initialize  [protected]
 * Step 1: Initialises an S3 multipart upload session.
 * Returns an uploadId and S3 key that must be passed to subsequent steps.
 * Body: { fileName, fileType? }
 */
exports.initializeMultipartUpload = async (req, res) => {
  try {
    const { fileName, fileType } = req.body;
    if (!fileName) return res.status(400).json({ message: 'fileName is required' });

    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    const key          = `${uniqueSuffix}-${fileName}`;

    const command        = new CreateMultipartUploadCommand({
      Bucket:      process.env.AWS_BUCKET_NAME_VIDEOS,
      Key:         key,
      ContentType: fileType || 'video/mp4',
    });
    const multipartUpload = await s3Client.send(command);

    res.status(200).json({ uploadId: multipartUpload.UploadId, key });
  } catch (error) {
    console.error('Error initializing multipart upload:', error);
    res.status(500).json({ message: 'Failed to initialize upload', error: error.message });
  }
};

/**
 * POST /api/multipart-upload/presigned-urls  [protected]
 * Step 2: Generates pre-signed PUT URLs for each part the client needs to upload.
 * Each URL expires after 1 hour. The client uploads directly to S3 using these URLs.
 * Body: { uploadId, key, parts }  (parts = total number of chunks)
 */
exports.getPresignedUrls = async (req, res) => {
  try {
    const { uploadId, key, parts } = req.body;
    if (!uploadId || !key || !parts) {
      return res.status(400).json({ message: 'uploadId, key, and parts are required' });
    }

    const presignedUrls = [];
    for (let i = 0; i < parts; i++) {
      const command = new UploadPartCommand({
        Bucket:     process.env.AWS_BUCKET_NAME_VIDEOS,
        Key:        key,
        UploadId:   uploadId,
        PartNumber: i + 1,
      });
      const url = await getSignedUrl(s3Client, command, { expiresIn: 3600 });
      presignedUrls.push({ partNumber: i + 1, url });
    }

    res.status(200).json({ presignedUrls });
  } catch (error) {
    console.error('Error generating presigned URLs:', error);
    res.status(500).json({ message: 'Failed to generate presigned URLs', error: error.message });
  }
};

/**
 * POST /api/multipart-upload/complete  [protected]
 * Step 3: Finalises the multipart upload after all parts have been uploaded.
 * S3 assembles all parts into the final object and returns the video URL.
 * Body: { uploadId, key, parts }  (parts = [{ ETag, PartNumber }, ...])
 */
exports.completeMultipartUpload = async (req, res) => {
  try {
    const { uploadId, key, parts } = req.body;
    if (!uploadId || !key || !parts) {
      return res.status(400).json({ message: 'uploadId, key, and parts are required' });
    }

    const command = new CompleteMultipartUploadCommand({
      Bucket:           process.env.AWS_BUCKET_NAME_VIDEOS,
      Key:              key,
      UploadId:         uploadId,
      MultipartUpload:  { Parts: parts.map((p) => ({ ETag: p.ETag, PartNumber: p.PartNumber })) },
    });

    await s3Client.send(command);

    const videoUrl = `https://${process.env.AWS_BUCKET_NAME_VIDEOS}.s3.${process.env.AWS_REGION}.amazonaws.com/${key}`;
    res.status(200).json({ message: 'Upload completed successfully', videoUrl });
  } catch (error) {
    console.error('Error completing multipart upload:', error);
    res.status(500).json({ message: 'Failed to complete upload', error: error.message });
  }
};

/**
 * POST /api/multipart-upload/abort  [protected]
 * Aborts an in-progress multipart upload and instructs S3 to clean up the uploaded parts.
 * Should be called if the upload fails or is cancelled to avoid storage charges.
 * Body: { uploadId, key }
 */
exports.abortMultipartUpload = async (req, res) => {
  try {
    const { uploadId, key } = req.body;
    if (!uploadId || !key) {
      return res.status(400).json({ message: 'uploadId and key are required' });
    }

    const command = new AbortMultipartUploadCommand({
      Bucket:   process.env.AWS_BUCKET_NAME_VIDEOS,
      Key:      key,
      UploadId: uploadId,
    });
    await s3Client.send(command);

    res.status(200).json({ message: 'Upload aborted successfully' });
  } catch (error) {
    console.error('Error aborting multipart upload:', error);
    res.status(500).json({ message: 'Failed to abort upload', error: error.message });
  }
};
