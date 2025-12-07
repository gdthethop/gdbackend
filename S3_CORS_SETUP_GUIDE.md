# S3 CORS Configuration Guide

## Problem
You're getting this error when uploading videos:
```
Access to XMLHttpRequest at 'https://gdplayervideos.s3.us-east-1.amazonaws.com/...' 
from origin 'http://localhost:3000' has been blocked by CORS policy
```

## Solution: Configure CORS on Your S3 Buckets

### Option 1: AWS Console (Recommended - Easiest)

1. **Go to AWS S3 Console**
   - Visit: https://s3.console.aws.amazon.com/s3/buckets
   - Sign in with your AWS account

2. **Configure Main Videos Bucket (`gdplayervideos`)**
   - Click on the bucket name: `gdplayervideos`
   - Go to the **Permissions** tab
   - Scroll down to **Cross-origin resource sharing (CORS)**
   - Click **Edit**
   - Paste this configuration:

```json
[
    {
        "AllowedHeaders": [
            "*"
        ],
        "AllowedMethods": [
            "GET",
            "PUT",
            "POST",
            "DELETE",
            "HEAD"
        ],
        "AllowedOrigins": [
            "http://localhost:3000",
            "http://localhost:3001",
            "https://yourdomain.com",
            "*"
        ],
        "ExposeHeaders": [
            "ETag",
            "x-amz-server-side-encryption",
            "x-amz-request-id",
            "x-amz-id-2"
        ],
        "MaxAgeSeconds": 3000
    }
]
```

   - Click **Save changes**

3. **Configure Thumbnails Bucket (`gdplayerthubnails`)**
   - Repeat the same steps for the thumbnails bucket
   - Use the same CORS configuration

### Option 2: AWS CLI (If you have it installed)

```bash
# For videos bucket
aws s3api put-bucket-cors \
  --bucket gdplayervideos \
  --cors-configuration file://S3_CORS_CONFIGURATION.json

# For thumbnails bucket
aws s3api put-bucket-cors \
  --bucket gdplayerthubnails \
  --cors-configuration file://S3_CORS_CONFIGURATION.json
```

### Option 3: Update IAM Permissions (Then use the script)

Add this permission to your IAM user `gd-video-upload-app`:

```json
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Effect": "Allow",
            "Action": [
                "s3:PutBucketCORS",
                "s3:GetBucketCORS"
            ],
            "Resource": [
                "arn:aws:s3:::gdplayervideos",
                "arn:aws:s3:::gdplayerthubnails"
            ]
        }
    ]
}
```

Then run: `node scripts/configureCORS.js`

---

## For Production

When deploying to production, update the CORS configuration to include your production domain:

```json
"AllowedOrigins": [
    "http://localhost:3000",
    "https://yourdomain.com",
    "https://www.yourdomain.com"
]
```

**Remove the `"*"` wildcard** for better security in production!

---

## Verification

After configuring CORS:

1. **Wait 1-2 minutes** for changes to propagate
2. **Refresh your browser** (Cmd+Shift+R or Ctrl+Shift+F5)
3. **Try uploading again**

The upload should now work! ✅

---

## Why This Happened

- Your frontend (localhost:3000) tries to upload directly to S3
- S3 requires CORS configuration to allow cross-origin requests
- Without CORS, browsers block the request for security reasons
- This is a **standard requirement** for client-side S3 uploads

## Will This Work in Production?

**YES!** Once CORS is configured:
- ✅ Works in development (localhost)
- ✅ Works in production (your domain)
- ✅ Secure (only allows specified origins)
- ✅ Fast (direct upload to S3, no proxy needed)
