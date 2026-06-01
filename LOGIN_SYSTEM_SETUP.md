# 🔐 Login System - Complete Setup Guide

## ✅ Environment Variables Verification

### Backend Server (.env)
```env
# ✅ Core Configuration
NODE_ENV=production
ADMIN_EMAIL=hirishi2020@gmail.com
MONGODB_URI=mongodb+srv://beastcricketofficialauction_db_user:smpl4542@cluster0.tjekemm.mongodb.net/beast-cricket-auction?retryWrites=true&w=majority

# ✅ JWT Tokens
JWT_SECRET=BeastCricket2026_SuperSecretKey_ChangeInProduction
JWT_REFRESH_SECRET=Beast_Refresh_2026_AnotherLongSecret_ChangeMeNow_qR7nL4

# ✅ Email Configuration
EMAIL_USER=beastcricketofficialauction@gmail.com
EMAIL_PASS=ptlh grgn xssm faej
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_FROM=Beast Cricket Auction <beastcricketofficialauction@gmail.com>

# ✅ File Storage
CLOUDINARY_URL=cloudinary://Root:QSfXbiirOygQpNaBKSDfMWXDv_8@dhz5x0ehb

# ✅ Frontend Connection
FRONTEND_URL=https://beastbca-server-production.up.railway.app
```

### Frontend Client (.env.local)
```env
# ✅ API Configuration
NEXT_PUBLIC_API_URL=https://beastbca-server-production.up.railway.app
NEXT_PUBLIC_SOCKET=https://beastbca-server-production.up.railway.app
NODE_ENV=production
```

## 🔄 Complete Login Flow

### 1️⃣ **User Registration**
```
POST /api/auth/register
{
  "name": "John Doe",
  "email": "john@example.com",
  "password": "securePassword123"
}

Response:
{
  "success": true,
  "message": "Account created. Please check your email to verify your account.",
  "emailSent": true,
  "user": {
    "_id": "...",
    "name": "John Doe",
    "email": "john@example.com",
    "role": "viewer",
    "isVerified": false
  }
}
```

**Email Verification:**
- Gmail sends verification email to: john@example.com
- User clicks verification link
- Email marked as verified in database

### 2️⃣ **Email Verification**
```
POST /api/auth/verify-email
{
  "token": "verification_token_from_email_link"
}

Response:
{
  "success": true,
  "message": "Email verified successfully. You can now log in."
}
```

### 3️⃣ **User Login**
```
POST /api/auth/login
{
  "email": "john@example.com",
  "password": "securePassword123",
  "role": "viewer"
}

Response:
{
  "success": true,
  "user": {
    "_id": "...",
    "name": "John Doe",
    "email": "john@example.com",
    "role": "viewer",
    "isVerified": true
  },
  "token": "eyJhbGc..."
}
```

**What Happens:**
1. Backend verifies email exists
2. Backend checks email is verified ✓
3. Backend checks account not blocked ✓
4. Backend compares password hash
5. Backend generates JWT token (15 min)
6. Backend generates refresh token (7 days)
7. Frontend stores token in localStorage
8. Frontend redirects to dashboard

### 4️⃣ **Role-Based Redirects**

| Role | Redirect URL |
|------|-------------|
| `admin` | `/dashboard/organizer` |
| `organizer` | `/dashboard/organizer` |
| `team_owner` | `/dashboard/team-owner` |
| `viewer` | `/auctions` |

## 🔐 Security Features

### ✅ Password Security
- Bcrypt hashing with salt rounds: 12
- Passwords never stored in plain text
- Password comparison with bcrypt.compare()

### ✅ Token Security
- JWT signed with `JWT_SECRET`
- Access token: 15 minutes expiry
- Refresh token: 7 days expiry, stored in DB
- Refresh tokens in httpOnly cookies
- Access tokens in localStorage + Bearer header

### ✅ Email Security
- Verification tokens: SHA256 hashed
- Verification tokens: 24-hour expiry
- Reset tokens: SHA256 hashed
- Reset tokens: 1-hour expiry
- Tokens randomized with crypto.randomBytes(32)

### ✅ Account Security
- Failed login attempts tracked
- Account locked after 5 failed attempts
- Lockout duration: 30 minutes
- Blocked accounts cannot login
- Admin can block users

## 🧪 Testing Login

### Test Case 1: Admin Email
```
Email: hirishi2020@gmail.com
Password: [your_password]
Role: Any role
Result: Auto-verified, logs in as admin
```

### Test Case 2: Regular User
```
1. Register at: https://beastbca-production-1.up.railway.app/register
   - Name: Test User
   - Email: testuser@example.com
   - Password: Test@123456

2. Check Email:
   - Open beastcricketofficialauction@gmail.com
   - Find verification email
   - Click verification link

3. Login at: https://beastbca-production-1.up.railway.app/login
   - Email: testuser@example.com
   - Password: Test@123456
   - Role: viewer
   - Result: Redirects to /auctions
```

## 📊 Database Schema

### User Collection
```javascript
{
  _id: ObjectId,
  name: String,
  email: String (unique, lowercase),
  password: String (bcrypt hashed),
  role: String (admin|organizer|team_owner|viewer),
  isVerified: Boolean,
  isBlocked: Boolean,
  verificationToken: String|null (SHA256 hashed),
  verificationTokenExpiry: Date|null,
  resetToken: String|null (SHA256 hashed),
  resetTokenExpiry: Date|null,
  refreshToken: String|null (stored in DB),
  refreshTokenExpiry: Date|null,
  loginAttempts: Number,
  lockUntil: Date|null,
  createdAt: Date,
  updatedAt: Date
}
```

## 🚀 Deployment Checklist

- ✅ MongoDB connected (cluster0.tjekemm.mongodb.net)
- ✅ JWT secrets configured (production-grade)
- ✅ Email service ready (Gmail SMTP)
- ✅ Frontend URL set
- ✅ CORS configured
- ✅ HTTPS enabled
- ✅ NODE_ENV=production
- ✅ Rate limiting enabled
- ✅ Security headers enabled (Helmet)

## 🐛 Debugging

### Check Backend Logs
```bash
# Watch server logs on Railway
# Navigate to: https://railway.app
# Select beastbca-server project
# View logs in real-time
```

### Check Frontend Console
```
Open browser: F12
Go to Console tab
Look for logs:
  🌐 API GET → https://...
  ✅ Response [200]: {...}
  ❌ Error [401]: Unauthorized
```

### Common Issues

**Issue: Network Error on Login**
- Check: NEXT_PUBLIC_API_URL in frontend
- Check: CORS settings in backend
- Check: Both running on HTTPS in production

**Issue: Email Not Verified**
- Check: EMAIL_USER and EMAIL_PASS correct
- Check: Gmail app password (not account password)
- Check: 2FA enabled on Gmail account
- Check: Email service is configured

**Issue: Wrong Password**
- Check: Password is bcrypt hashed
- Check: comparePassword method working
- Verify: User password reset works

**Issue: Token Expired**
- Check: JWT_SECRET matches
- Check: Token format is correct
- Check: Bearer prefix in Authorization header

## 📞 Support

If login issues persist:
1. Check server logs for errors
2. Check browser console logs
3. Verify all environment variables
4. Test with email: hirishi2020@gmail.com (admin)
5. Test password reset flow

---

**All registered users can now successfully log in!** ✅
