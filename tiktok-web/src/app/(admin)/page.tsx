"use client";

import React, { useState, useEffect } from "react";
import {
  Typography,
  Button,
  Form,
  message,
  ConfigProvider,
  Spin,
  Alert,
} from "antd";
import { PlusOutlined } from "@ant-design/icons";
import { TikTokAccount, PaginationType, UpdateTaskDto } from "../../types/tikTokTypes";
import { AccountsTable, AccountModal, DataRetrievalCard } from "../../components/TikTokAccounts";
import { tikTokAccountService } from "../../services/tikTokAccountService";
import { useAuth } from "../../lib/auth";

const { Title } = Typography;

export default function TikTokAccountsPage() {
  const { isAdmin, isLoading: isAuthLoading } = useAuth();
  const [accounts, setAccounts] = useState<TikTokAccount[]>([]);
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [form] = Form.useForm();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [messageApi, contextHolder] = message.useMessage();
  const [selectedAccountIds, setSelectedAccountIds] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingAll, setIsLoadingAll] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [currentAccount, setCurrentAccount] = useState<TikTokAccount | undefined>(undefined);
  const [pagination, setPagination] = useState<PaginationType>({
    current: 1,
    pageSize: 5,
    total: 0,
  });

  // Kiểm tra kích thước màn hình cho thiết kế responsive
  useEffect(() => {
    const checkScreenSize = () => {
      setIsMobile(window.innerWidth < 768);
    };
    
    checkScreenSize();
    window.addEventListener('resize', checkScreenSize);
    
    return () => {
      window.removeEventListener('resize', checkScreenSize);
    };
  }, []);

  // Lấy danh sách tài khoản khi component được mount
  useEffect(() => {
    if (isAdmin) {
      fetchAccounts();
    }
  }, [isAdmin]);

  // Kiểm tra ủy quyền thành công khi tải trang
  useEffect(() => {
    const successParam = new URLSearchParams(window.location.search).get('success');
    if (successParam === 'true') {
      messageApi.success('Tài khoản đã được thêm thành công!');
      // Xóa tham số success khỏi URL
      window.history.replaceState({}, document.title, window.location.pathname);
      
      // Làm mới danh sách tài khoản
      fetchAccounts();
    }
  }, [messageApi]);

  const fetchAccounts = async () => {
    try {
      setIsLoading(true);
      const data = await tikTokAccountService.getAllAccounts();
      setAccounts(data);
      setPagination(prev => ({ ...prev, total: data.length }));
    } catch (error) {
      messageApi.error("Không thể tải danh sách tài khoản");
      console.error("Lỗi khi lấy danh sách tài khoản:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const showModal = async (account?: TikTokAccount) => {
    setEditingId(account?._id || null);
    setCurrentAccount(account);
    
    if (account) {
      form.setFieldsValue({
        appKey: account.appKey,
        appSecret: account.appSecret,
        serviceId: account.serviceId || "",
        sheetId: account.sheetId || "",
      });
      
      // Nếu có ID nhưng không có đầy đủ thông tin tài khoản, lấy thông tin chi tiết
      if (account._id && !account.shopCipher) {
        try {
          const completeAccount = await tikTokAccountService.getAccountById(account._id);
          setCurrentAccount(completeAccount);
        } catch (error) {
          messageApi.error("Không thể tải thông tin chi tiết tài khoản");
          console.error("Lỗi khi lấy thông tin chi tiết tài khoản:", error);
        }
      }
    } else {
      form.resetFields();
    }
    
    setIsModalVisible(true);
  };

  const handleCancel = () => {
    setIsModalVisible(false);
    form.resetFields();
    setCurrentAccount(undefined);
  };

  const handleDelete = async (id: string) => {
    try {
      await tikTokAccountService.deleteAccount(id);
      setAccounts(accounts.filter((account) => account._id !== id));
      messageApi.success("Xóa tài khoản thành công!");
    } catch (error) {
      console.error("Lỗi khi xóa:", error);
      messageApi.error("Có lỗi xảy ra khi xóa tài khoản");
    }
  };

  const toggleStatus = async (id: string) => {
    try {
      const account = accounts.find(acc => acc._id === id);
      if (!account) return;
      
      // Đảo ngược trạng thái isActive của task
      const newTaskStatus = !(account.task?.isActive || false);
      
      // Cập nhật state trước để UI phản hồi ngay lập tức
      setAccounts(
        accounts.map((acc) => {
          if (acc._id === id && acc.task) {
            return {
              ...acc,
              task: {
                ...acc.task,
                isActive: newTaskStatus
              }
            };
          }
          return acc;
        })
      );
      
      // Cập nhật trạng thái task
      await tikTokAccountService.updateAccountTask(id, { isActive: newTaskStatus });
      
      messageApi.success(`Cron job đã ${newTaskStatus ? 'được kích hoạt' : 'bị vô hiệu hóa'}`);
    } catch (error) {
      console.error("Lỗi khi thay đổi trạng thái task:", error);
      messageApi.error("Có lỗi xảy ra khi thay đổi trạng thái cron job");
      
      // Nếu có lỗi, rollback lại state
      fetchAccounts();
    }
  };

  // Các hàm cho việc tự động lấy dữ liệu
  const handleAccountSelect = (value: string[]) => {
    setSelectedAccountIds(value);
  };

  const handleFetchCurrentMonth = async () => {
    if (selectedAccountIds.length === 0) {
      messageApi.error("Vui lòng chọn ít nhất một tài khoản!");
      return;
    }

    setIsLoading(true);
    try {
      // Xử lý từng tài khoản đã chọn
      const promises = selectedAccountIds.map(async (id) => {
        return tikTokAccountService.runAccountTask(id, false);
      });
      
      await Promise.all(promises);
      messageApi.success(`Đã cập nhật dữ liệu tháng hiện tại cho ${selectedAccountIds.length} tài khoản!`);
    } catch (error) {
      console.error("Lỗi khi lấy dữ liệu tháng hiện tại:", error);
      messageApi.error("Có lỗi xảy ra khi cập nhật dữ liệu!");
    } finally {
      setIsLoading(false);
    }
  };

  const handleFetchAllMonths = async () => {
    if (selectedAccountIds.length === 0) {
      messageApi.error("Vui lòng chọn ít nhất một tài khoản!");
      return;
    }

    setIsLoadingAll(true);
    try {
      // Xử lý từng tài khoản đã chọn
      const promises = selectedAccountIds.map(async (id) => {
        return tikTokAccountService.runAccountTask(id, true);
      });
      
      await Promise.all(promises);
      messageApi.success(`Đã cập nhật dữ liệu tất cả các tháng cho ${selectedAccountIds.length} tài khoản!`);
    } catch (error) {
      console.error("Lỗi khi lấy dữ liệu tất cả các tháng:", error);
      messageApi.error("Có lỗi xảy ra khi cập nhật dữ liệu!");
    } finally {
      setIsLoadingAll(false);
    }
  };

  const handleUpdateTask = async (accountId: string, taskData: UpdateTaskDto) => {
    try {
      await tikTokAccountService.updateAccountTask(accountId, taskData);
      messageApi.success("Cập nhật lịch trình thành công!");
      
      // Làm mới danh sách tài khoản để lấy thông tin task đã cập nhật
      fetchAccounts();
    } catch (error) {
      console.error("Lỗi khi cập nhật task:", error);
      messageApi.error("Có lỗi xảy ra khi cập nhật lịch trình!");
    }
  };

  if (isAuthLoading) {
    return (
      <div className="flex justify-center items-center h-screen">
        <Spin size="large" tip="Đang kiểm tra quyền truy cập..." />
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="p-8">
        <Alert
          message="Không có quyền truy cập"
          description="Bạn cần có quyền admin để truy cập trang này."
          type="error"
          showIcon
        />
      </div>
    );
  }

  if (isLoading && accounts.length === 0) {
    return (
      <div className="flex justify-center items-center h-screen">
        <Spin size="large" tip="Đang tải dữ liệu..." />
      </div>
    );
  }

  return (
    <ConfigProvider componentSize={isMobile ? "small" : "middle"}>
      <div>
        {contextHolder}
        <div className={`flex ${isMobile ? 'flex-col' : 'flex-row'} ${isMobile ? 'items-start' : 'items-center'} justify-between mb-4 ${isMobile ? 'gap-4' : ''}`}>
          <Title level={isMobile ? 3 : 2}>Cấu hình tài khoản TikTok</Title>
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => showModal()}
          >
            Thêm tài khoản
          </Button>
        </div>

        <AccountsTable 
          accounts={accounts}
          isMobile={isMobile}
          pagination={pagination}
          setPagination={setPagination}
          toggleStatus={toggleStatus}
          showModal={showModal}
          handleDelete={handleDelete}
          isLoading={isLoading}
        />

        <DataRetrievalCard 
          accounts={accounts}
          selectedAccountIds={selectedAccountIds}
          isLoading={isLoading}
          isLoadingAll={isLoadingAll}
          isMobile={isMobile}
          handleAccountSelect={handleAccountSelect}
          handleFetchCurrentMonth={handleFetchCurrentMonth}
          handleFetchAllMonths={handleFetchAllMonths}
          handleUpdateTask={handleUpdateTask}
        />

        <AccountModal 
          isModalVisible={isModalVisible}
          form={form}
          editingId={editingId}
          isMobile={isMobile}
          handleOk={() => {}}
          handleCancel={handleCancel}
          currentAccount={currentAccount}
          isSubmitting={false}
        />
      </div>
    </ConfigProvider>
  );
} 