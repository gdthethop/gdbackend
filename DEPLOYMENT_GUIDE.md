# GD Player Backend - Deployment Guide

## Recommended Platform: Render.com (Free Tier Available)

Render is perfect for your backend because:
- ✅ Free tier available
- ✅ Supports Node.js/Express
- ✅ MongoDB Atlas integration
- ✅ Environment variables
- ✅ Automatic deployments from GitHub
- ✅ HTTPS included
- ✅ Supports ffmpeg

---

## Option 1: Deploy to Render.com (Recommended)

### Step 1: Prepare Your Backend

1. **Create a `.gitignore` file** (if not exists):
```
node_modules/
.env
tmp_thumbs/
.DS_Store
```

2. **Commit and push to GitHub**:
```bash
cd gdbackend
git init
git add .
git commit -m "Initial backend commit"
git branch -M main
git remote add origin https://github.com/yourusername/gdplayer-backend.git
git push -u origin main
```

### Step 2: Deploy on Render

1. Go to https://render.com and sign up/login
2. Click **"New +"** → **"Web Service"**
3. Connect your GitHub repository
4. Configure:
   - **Name**: `gdplayer-backend`
   - **Environment**: `Node`
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Plan**: Free

5. **Add Environment Variables** (click "Advanced"):
   ```
   NODE_ENV=production
   PORT=5000
   MONGODB_URI=your_mongodb_connection_string
   JWT_SECRET=your_jwt_secret
   AWS_ACCESS_KEY_ID=your_aws_key
   AWS_SECRET_ACCESS_KEY=your_aws_secret
   AWS_REGION=us-east-1
   AWS_BUCKET_NAME=gdplayervideos
   AWS_BUCKET_NAME_THUMBNAILS=gdplayerthubnails
   EMAIL_USER=your_email
   EMAIL_PASS=your_email_password
   FRONTEND_URL=https://gdthethop.github.io/Gdplayer
   ```

6. Click **"Create Web Service"**

7. **Get your backend URL**: `https://gdplayer-backend.onrender.com`

8. **Update your frontend `.env`**:
   ```
   REACT_APP_BACKEND_URL=https://gdplayer-backend.onrender.com
   ```

---

## Option 2: Deploy to Railway.app

1. Go to https://railway.app
2. Sign in with GitHub
3. Click **"New Project"** → **"Deploy from GitHub repo"**
4. Select your backend repository
5. Add environment variables (same as above)
6. Deploy!

---

## Option 3: Deploy to Heroku

```bash
# Install Heroku CLI
brew install heroku/brew/heroku

# Login
heroku login

# Create app
cd gdbackend
heroku create gdplayer-backend

# Add buildpack for ffmpeg
heroku buildpacks:add --index 1 https://github.com/jonathanong/heroku-buildpack-ffmpeg-latest.git

# Set environment variables
heroku config:set NODE_ENV=production
heroku config:set MONGODB_URI=your_mongodb_uri
heroku config:set JWT_SECRET=your_secret
# ... add all other env vars

# Deploy
git push heroku main
```

---

## Post-Deployment Checklist

### 1. Update Frontend CORS
Update your frontend to use the production backend URL:

**Gdplayer/.env**:
```
REACT_APP_BACKEND_URL=https://your-backend-url.onrender.com
```

### 2. Update S3 CORS
Add your production backend URL to S3 CORS configuration:
```json
"AllowedOrigins": [
    "http://localhost:3000",
    "https://gdthethop.github.io",
    "https://your-backend-url.onrender.com"
]
```

### 3. Update MongoDB Network Access
In MongoDB Atlas:
- Go to **Network Access**
- Click **"Add IP Address"**
- Click **"Allow Access from Anywhere"** (or add Render's IPs)

### 4. Test Your Deployment
```bash
# Test health endpoint
curl https://your-backend-url.onrender.com/

# Test API
curl https://your-backend-url.onrender.com/api/videos
```

---

## Important Notes

### FFmpeg on Render
Render includes ffmpeg by default, so thumbnail generation will work!

### Free Tier Limitations
- Render free tier: Service spins down after 15 minutes of inactivity
- First request after spin-down takes ~30 seconds
- Upgrade to paid tier ($7/month) for always-on service

### MongoDB Connection
Make sure your MongoDB connection string uses:
```
mongodb+srv://username:password@cluster.mongodb.net/dbname?retryWrites=true&w=majority
```

---

## Troubleshooting

### Backend won't start
- Check logs in Render dashboard
- Verify all environment variables are set
- Check MongoDB connection string

### CORS errors
- Update S3 CORS configuration
- Update backend CORS settings in `index.js`

### Upload fails
- Verify AWS credentials are correct
- Check S3 bucket permissions
- Ensure CORS is configured on S3

---

## Next Steps

1. Deploy backend to Render
2. Get your production backend URL
3. Update frontend `.env` with new backend URL
4. Rebuild and redeploy frontend: `npm run deploy`
5. Test everything!

**Your app will be fully deployed and accessible at:**
- Frontend: https://gdthethop.github.io/Gdplayer
- Backend: https://gdplayer-backend.onrender.com
