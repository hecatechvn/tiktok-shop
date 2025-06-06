# Environment Variables Setup Guide

## 📋 Tổng quan

Ứng dụng TikTok có 2 phần chính cần cấu hình environment variables:
- **Backend (NestJS)**: Database, JWT, API config
- **Frontend (Next.js)**: NextAuth, API endpoints

## 🔧 Backend Environment Variables

### File: `NestTiktok/.env`

```bash
# MongoDB Configuration
MONGO_URI=mongodb://admin:admin123@mongodb:27017/tiktok-data?authSource=admin

# JWT Configuration
JWT_SECRET=your-super-secret-jwt-key-change-this-in-production
JWT_ACCESS_EXPIRATION=15m
JWT_REFRESH_EXPIRATION=7d

# API Configuration
API_PREFIX=api
API_VERSION=1

# Server Configuration
PORT=8000
NODE_ENV=production
```

## 🌐 Frontend Environment Variables

### File: `tiktok-web/.env.local`

```bash
# NextAuth Configuration
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=your-secret-key-change-this-in-production

# API Configuration  
NEXT_PUBLIC_API_URL=http://localhost:8000/api/v1
```

## 🚀 Production vs Development

### Development (Local):
```bash
# Backend
MONGO_URI=mongodb://admin:admin123@mongodb:27017/tiktok-data?authSource=admin
JWT_SECRET=dev-jwt-secret-key

# Frontend
NEXTAUTH_URL=http://localhost:3000
NEXT_PUBLIC_API_URL=http://localhost:8000/api/v1
```

### Production (VPS):
```bash
# Backend 
MONGO_URI=mongodb://admin:admin123@mongodb:27017/tiktok-data?authSource=admin
JWT_SECRET=your-super-secret-jwt-key-change-this-in-production

# Frontend
NEXTAUTH_URL=https://hct-it.vn
NEXT_PUBLIC_API_URL=https://api.hct-it.vn/api/v1
```

## 📦 Docker Environment Handling

### Cách 1: Hard-code trong docker-compose (Hiện tại)
Environment variables được define trực tiếp trong `docker-compose-fe-be.yml`

### Cách 2: Sử dụng .env file (Khuyên dùng cho production)

Tạo file `.env` trong thư mục root:
```bash
# Root .env file
NODE_ENV=production
JWT_SECRET=your-super-secret-jwt-key
NEXTAUTH_SECRET=your-super-secret-nextauth-key
FRONTEND_DOMAIN=hct-it.vn
BACKEND_DOMAIN=api.hct-it.vn
MONGO_USERNAME=admin
MONGO_PASSWORD=admin123
```

## 🔐 Security Best Practices

1. **Đổi tất cả secrets trong production**
2. **Không commit file .env vào Git**
3. **Sử dụng strong passwords cho MongoDB**
4. **Backup MongoDB data định kỳ**

## 📝 Trên VPS bạn cần:

1. **Không cần tạo file .env riêng** - Tất cả đã được config trong docker-compose
2. **Chỉ cần chạy:** `docker-compose -f docker-compose-fe-be.yml up -d`
3. **Environment variables sẽ được inject tự động vào containers**

## ⚠️ Lưu ý quan trọng:

- **NEXT_PUBLIC_*** variables: Exposed to browser, cần cẩn thận
- **NEXTAUTH_SECRET**: Phải giống nhau giữa build time và runtime  
- **MongoDB connection**: Sử dụng service name `mongodb` trong Docker network
- **API_URL**: Frontend connect đến backend qua domain name trong production 