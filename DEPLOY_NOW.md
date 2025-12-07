# Quick Deployment Steps

## ✅ Fixed Issues
- Fixed case-sensitive file imports (Video → video)
- Committed and pushed to GitHub

## 🚀 Deploy to Render.com (5 minutes)

### Step 1: Go to Render
1. Visit: https://render.com
2. Sign in with GitHub

### Step 2: Create New Web Service
1. Click **"New +"** → **"Web Service"**
2. Connect repository: `gdthethop/gdbackend`
3. Click **"Connect"**

### Step 3: Configure Service
Render will auto-detect settings from `render.yaml`, but verify:
- **Name**: `gdplayer-backend`
- **Environment**: `Node`
- **Build Command**: `npm install`
- **Start Command**: `npm start`
- **Plan**: `Free`

### Step 4: Add Environment Variables
Click **"Advanced"** and add these:

```
MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/gdplayer?retryWrites=true&w=majority
JWT_SECRET=your_super_secret_key_here
AWS_ACCESS_KEY_ID=AKIAVYV5ZTASDMZUAVFF
AWS_SECRET_ACCESS_KEY=your_aws_secret_key
EMAIL_USER=your_email@gmail.com
EMAIL_PASS=your_app_password
```

### Step 5: Deploy!
1. Click **"Create Web Service"**
2. Wait 2-3 minutes for deployment
3. Your backend URL will be: `https://gdplayer-backend.onrender.com`

## 📝 Post-Deployment

### Update Frontend
Edit `Gdplayer/.env`:
```
REACT_APP_BACKEND_URL=https://gdplayer-backend.onrender.com
```

Then redeploy frontend:
```bash
cd Gdplayer
npm run deploy
```

### Update S3 CORS
Add your backend URL to S3 CORS:
```json
"AllowedOrigins": [
    "http://localhost:3000",
    "https://gdthethop.github.io",
    "https://gdplayer-backend.onrender.com"
]
```

### Update MongoDB Network Access
1. Go to MongoDB Atlas
2. Network Access → Add IP Address
3. Click **"Allow Access from Anywhere"**
4. Confirm

## ✅ Test Your Deployment

```bash
# Test backend health
curl https://gdplayer-backend.onrender.com/

# Test API
curl https://gdplayer-backend.onrender.com/api/videos
```

## 🎉 Done!

Your full stack app is now deployed:
- Frontend: https://gdthethop.github.io/Gdplayer
- Backend: https://gdplayer-backend.onrender.com

## ⚠️ Important Notes

### Free Tier Limitations
- Service sleeps after 15 min of inactivity
- First request after sleep takes ~30 seconds
- Upgrade to $7/month for always-on

### If Deployment Fails
Check Render logs for errors:
1. Go to your service dashboard
2. Click **"Logs"** tab
3. Look for error messages

Common issues:
- Missing environment variables
- MongoDB connection string incorrect
- AWS credentials wrong

---

**Need help? Check the full DEPLOYMENT_GUIDE.md**
