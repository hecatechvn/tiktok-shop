"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { parseTikTokCallback } from "../../utils/tiktokAuth";
import { tikTokAccountService } from "../../services/tikTokAccountService";
import { Typography } from "antd";
import crypto from 'crypto';

const { Text } = Typography;

// Thời gian tối đa cho phép xử lý callback (5 phút)
const MAX_CALLBACK_TIME = 5 * 60 * 1000;

export default function CallbackPage() {
  const router = useRouter();
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [errorMessage, setErrorMessage] = useState<string>('');

  useEffect(() => {
    const handleCallback = async () => {
      try {
        // Lấy URL đầy đủ
        const fullUrl = window.location.href;
        
        // Phân tích tham số callback
        const { code, appKey, state } = parseTikTokCallback(fullUrl);
        
        if (!code || !appKey) {
          setStatus('error');
          setErrorMessage('Không tìm thấy mã ủy quyền hoặc app key trong URL callback.');
          return;
        }

        // Xác thực state để ngăn chặn tấn công CSRF
        const savedState = localStorage.getItem('tiktok_auth_state');
        if (!state || state !== savedState) {
          setStatus('error');
          setErrorMessage('Xác thực state thất bại. Vui lòng thử lại.');
          return;
        }
        
        // Kiểm tra thời gian bắt đầu quá trình xác thực
        const authStartTime = localStorage.getItem('tiktok_auth_timestamp');
        if (!authStartTime || (Date.now() - parseInt(authStartTime)) > MAX_CALLBACK_TIME) {
          setStatus('error');
          setErrorMessage('Phiên xác thực đã hết hạn. Vui lòng thử lại.');
          localStorage.removeItem('tiktok_auth_state');
          localStorage.removeItem('tiktok_auth_timestamp');
          localStorage.removeItem('pendingTikTokAccount');
          return;
        }
        
        // Xóa state và timestamp đã sử dụng
        localStorage.removeItem('tiktok_auth_state');
        localStorage.removeItem('tiktok_auth_timestamp');

        // Kiểm tra xem có dữ liệu tài khoản đang chờ xử lý trong localStorage không
        const encryptedData = localStorage.getItem('pendingTikTokAccount');
        
        if (!encryptedData) {
          setStatus('error');
          setErrorMessage('Không tìm thấy thông tin tài khoản đang chờ xử lý.');
          return;
        }

        // Giải mã dữ liệu tài khoản
        let accountData;
        try {
          accountData = JSON.parse(decodeURIComponent(encryptedData));
          
          // Xác minh hash nếu có
          if (accountData.dataHash) {
            const { dataHash, ...dataToVerify } = accountData;
            const verifyHash = crypto.createHash('sha256')
              .update(JSON.stringify(dataToVerify) + state)
              .digest('hex');
            
            if (dataHash !== verifyHash) {
              throw new Error('Data integrity check failed');
            }
          }
        } catch {
          setStatus('error');
          setErrorMessage('Dữ liệu tài khoản không hợp lệ hoặc đã bị sửa đổi.');
          localStorage.removeItem('pendingTikTokAccount');
          return;
        }
        
        // Xác minh rằng app key khớp
        if (accountData.appKey !== appKey) {
          setStatus('error');
          setErrorMessage('App Key không khớp với tài khoản đang chờ xử lý.');
          return;
        }

        // Tạo tài khoản với mã ủy quyền
        const createData = {
          ...accountData,
          authCode: code
        };
        
        // Loại bỏ trường dataHash nếu có
        if (createData.dataHash) {
          delete createData.dataHash;
        }

        // Nếu có ID, cập nhật tài khoản hiện có, nếu không thì tạo mới
        if (accountData.id) {
          await tikTokAccountService.updateAccount(accountData.id, createData);
        } else {
          await tikTokAccountService.createAccount(createData);
        }

        // Xóa dữ liệu tài khoản đang chờ xử lý
        localStorage.removeItem('pendingTikTokAccount');
        
        // Đặt trạng thái thành công
        setStatus('success');
        
        // Chuyển hướng trở lại trang tài khoản sau 2 giây với tham số thành công
        setTimeout(() => {
          router.push('/?success=true');
        }, 2000);
      } catch (error) {
        console.error('Lỗi xử lý callback:', error);
        setStatus('error');
        setErrorMessage('Có lỗi xảy ra khi xử lý ủy quyền. Vui lòng thử lại.');
        
        // Xóa dữ liệu nhạy cảm trong trường hợp lỗi
        localStorage.removeItem('tiktok_auth_state');
        localStorage.removeItem('tiktok_auth_timestamp');
        localStorage.removeItem('pendingTikTokAccount');
      }
    };

    handleCallback();
    
    // Cleanup function
    return () => {
      // Đảm bảo dữ liệu nhạy cảm được xóa khi component unmount
      localStorage.removeItem('tiktok_auth_state');
      localStorage.removeItem('tiktok_auth_timestamp');
      localStorage.removeItem('pendingTikTokAccount');
    };
  }, [router]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-white to-gray-100 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-lg p-8 max-w-md w-full border border-gray-100">
        {status === 'loading' && (
          <div className="flex flex-col items-center justify-center py-10">
            <div className="relative">
              <div className="w-16 h-16 border-t-4 border-b-4 border-blue-500 rounded-full animate-spin"></div>
              <div className="absolute top-0 left-0 w-16 h-16 border-t-4 border-blue-300 rounded-full animate-ping opacity-20"></div>
            </div>
            <Text className="mt-6 text-lg font-medium text-gray-700">Đang xử lý ủy quyền từ TikTok...</Text>
            <p className="text-gray-500 mt-2 text-center">Vui lòng đợi trong giây lát</p>
          </div>
        )}

        {status === 'error' && (
          <div className="text-center py-6">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-red-100 mb-6">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </div>
            <h2 className="text-2xl font-bold text-gray-800 mb-2">Ủy quyền thất bại</h2>
            <p className="text-gray-600 mb-6">{errorMessage}</p>
            <button 
              className="px-6 py-3 bg-gradient-to-r from-blue-500 to-blue-600 text-white rounded-lg hover:from-blue-600 hover:to-blue-700 shadow-md transition-all duration-200 font-medium"
              onClick={() => router.push('/')}
            >
              Quay lại trang quản lý
            </button>
          </div>
        )}

        {status === 'success' && (
          <div className="text-center py-6">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-green-100 mb-6">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h2 className="text-2xl font-bold text-gray-800 mb-2">Ủy quyền thành công</h2>
            <p className="text-gray-600">Tài khoản TikTok đã được thêm thành công.</p>
            <p className="text-gray-500 mt-2">Đang chuyển hướng về trang quản lý...</p>
            <div className="mt-4 w-full bg-gray-200 rounded-full h-1.5">
              <div className="bg-blue-500 h-1.5 rounded-full w-0 animate-[progress_2s_ease-in-out_forwards]"></div>
            </div>
          </div>
        )}
      </div>
      <style jsx>{`
        @keyframes progress {
          0% { width: 0%; }
          100% { width: 100%; }
        }
      `}</style>
    </div>
  );
} 