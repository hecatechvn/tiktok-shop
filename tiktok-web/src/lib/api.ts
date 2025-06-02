"use client";

import { getSession, signOut } from "next-auth/react";
import { jwtDecode } from "jwt-decode";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1";

interface JwtPayload {
  sub: string;
  userName: string;
  role: string;
  iat?: number;
  exp?: number;
}

// Hàm kiểm tra xem token đã hết hạn chưa
function isTokenExpired(token: string): boolean {
  try {
    const decodedToken = jwtDecode<JwtPayload>(token);
    if (!decodedToken.exp) return false;
    // Kiểm tra xem thời gian hiện tại có vượt quá thời gian hết hạn không (với đệm 10 giây)
    return Date.now() >= (decodedToken.exp * 1000) - 10000;
  } catch (error) {
    console.error("Lỗi giải mã token:", error);
    return true; // Giả định đã hết hạn nếu không thể giải mã
  }
}

// Lưu trữ promise refresh để tránh nhiều yêu cầu refresh cùng lúc
let refreshingPromise: Promise<string | null> | null = null;

// Hàm làm mới token
async function refreshToken(refreshToken: string): Promise<string | null> {
  try {
    const response = await fetch(`${API_URL}/auth/refresh`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ refresh_token: refreshToken }),
    });

    if (!response.ok) {
      throw new Error("Không thể làm mới token");
    }

    const data = await response.json();
    
    // Cập nhật phiên với token mới
    const session = await getSession();
    if (session) {
      session.accessToken = data.access_token;
      session.refreshToken = data.refresh_token;
    }
    
    return data.access_token;
  } catch (error) {
    console.error("Lỗi khi làm mới token:", error);
    return null;
  }
}

export async function fetchWithAuth(endpoint: string, options: RequestInit = {}) {
  const session = await getSession();
  let accessToken = session?.accessToken;
  const refreshTokenValue = session?.refreshToken;

  // Kiểm tra xem token có tồn tại và đã hết hạn chưa
  if (accessToken && isTokenExpired(accessToken) && refreshTokenValue) {
    console.log("Token đã hết hạn, đang cố gắng làm mới");
    
    // Sử dụng promise refresh hiện có hoặc tạo mới
    if (!refreshingPromise) {
      refreshingPromise = refreshToken(refreshTokenValue);
    }
    
    // Đợi quá trình làm mới hoàn tất
    const newToken = await refreshingPromise;
    refreshingPromise = null;
    
    if (newToken) {
      accessToken = newToken;
    } else {
      // Nếu làm mới thất bại, đăng xuất
      console.log("Làm mới token thất bại, đang đăng xuất");
      signOut({ callbackUrl: "/login" });
      throw new Error("Phiên đã hết hạn. Vui lòng đăng nhập lại.");
    }
  }

  const headers = {
    "Content-Type": "application/json",
    ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
    ...options.headers,
  };

  const response = await fetch(`${API_URL}${endpoint}`, {
    ...options,
    headers,
  });

  // Xử lý lỗi 401 Unauthorized
  if (response.status === 401) {
    console.log("Nhận được lỗi 401 unauthorized, đang đăng xuất người dùng");
    signOut({ callbackUrl: "/login" });
    throw new Error("Phiên đã hết hạn. Vui lòng đăng nhập lại.");
  }

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.message || "Yêu cầu API thất bại");
  }

  return response.json();
}

export const api = {
  get: (endpoint: string) => fetchWithAuth(endpoint),
  
  post: <T extends Record<string, unknown>>(endpoint: string, data: T) =>
    fetchWithAuth(endpoint, {
      method: "POST",
      body: JSON.stringify(data),
    }),
  
  put: <T extends Record<string, unknown>>(endpoint: string, data: T) =>
    fetchWithAuth(endpoint, {
      method: "PUT",
      body: JSON.stringify(data),
    }),
  
  patch: <T extends Record<string, unknown>>(endpoint: string, data: T) =>
    fetchWithAuth(endpoint, {
      method: "PATCH",
      body: JSON.stringify(data),
    }),
  
  delete: (endpoint: string) =>
    fetchWithAuth(endpoint, {
      method: "DELETE",
    }),
}; 