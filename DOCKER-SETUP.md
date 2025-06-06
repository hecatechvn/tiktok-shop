# TikTok Docker Setup Guide

## 📋 Tổng quan dịch vụ

Backend NestTiktok cần các dịch vụ sau:

### ✅ Đã được cấu hình:
- **MongoDB** - Database chính cho users, accounts, shop data
- **Google Sheets API** - Export/Import data (service-account.json)
- **JWT Authentication** - Xác thực người dùng
- **Cron Jobs** - Scheduled tasks

### 🔧 Environment Variables cần thiết:

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

## 🚀 Cách chạy

### Development Mode:
```bash
# Build images
./build-and-push.sh

# Run với port mapping
docker-compose -f docker-compose.dev.yml up -d

# Access:
# Frontend: http://localhost:3000
# Backend: http://localhost:8000
# MongoDB: localhost:27017
```

### Production Mode:
```bash
# Run với Traefik
docker-compose -f docker-compose-fe-be.yml up -d

# Access:
# Frontend: https://hct-it.vn
# Backend: https://api.hct-it.vn
```

## 📊 Services & Ports

| Service | Dev Port | Prod Domain | Container Port |
|---------|----------|-------------|----------------|
| Frontend | 3000 | hct-it.vn | 3000 |
| Backend | 8000 | api.hct-it.vn | 8000 |
| MongoDB | 27017 | internal | 27017 |

## 🔐 Default Credentials

- **MongoDB**: admin/admin123
- **App Admin**: admin/admin123 (tạo tự động khi khởi động)

## 📁 Volumes

- `mongodb_data` - MongoDB data persistence
- `mongodb_config` - MongoDB configuration

## ⚠️ Security Notes

1. Đổi `JWT_SECRET` trong production
2. Đổi MongoDB credentials trong production  
3. File `service-account.json` chứa private key - bảo mật cẩn thận
4. Backup MongoDB data thường xuyên 