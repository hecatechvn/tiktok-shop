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
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [currentAccount, setCurrentAccount] = useState<TikTokAccount | undefined>(undefined);
  const [pagination, setPagination] = useState<PaginationType>({
    current: 1,
    pageSize: 5,
    total: 0,
  });

  // Check screen size for responsive design
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

  // Fetch accounts on component mount
  useEffect(() => {
    if (isAdmin) {
      fetchAccounts();
    }
  }, [isAdmin]);

  const fetchAccounts = async () => {
    try {
      setIsLoading(true);
      const data = await tikTokAccountService.getAllAccounts();
      setAccounts(data);
      setPagination(prev => ({ ...prev, total: data.length }));
    } catch (error) {
      messageApi.error("Không thể tải danh sách tài khoản");
      console.error("Error fetching accounts:", error);
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
        authCode: account.authCode,
        sheets: account.sheets || "",
      });
      
      // If we have an ID but not all account details, fetch the complete account
      if (account._id && !account.shopCipher) {
        try {
          const completeAccount = await tikTokAccountService.getAccountById(account._id);
          setCurrentAccount(completeAccount);
        } catch (error) {
          messageApi.error("Không thể tải thông tin chi tiết tài khoản");
          console.error("Error fetching account details:", error);
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

  const handleOk = async () => {
    try {
      setIsSubmitting(true);
      const values = await form.validateFields();
      
      if (editingId) {
        // Update existing account
        await tikTokAccountService.updateAccount(editingId, values);
        messageApi.success("Cập nhật tài khoản thành công!");
      } else {
        // Add new account
        await tikTokAccountService.createAccount(values);
        messageApi.success("Thêm tài khoản thành công!");
      }
      
      setIsModalVisible(false);
      form.resetFields();
      fetchAccounts(); // Refresh the accounts list
    } catch (error) {
      console.error("Validate or submit failed:", error);
      messageApi.error("Có lỗi xảy ra khi lưu tài khoản");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await tikTokAccountService.deleteAccount(id);
      setAccounts(accounts.filter((account) => account._id !== id));
      messageApi.success("Xóa tài khoản thành công!");
    } catch (error) {
      console.error("Delete failed:", error);
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
      console.error("Toggle task status failed:", error);
      messageApi.error("Có lỗi xảy ra khi thay đổi trạng thái cron job");
      
      // Nếu có lỗi, rollback lại state
      fetchAccounts();
    }
  };

  // Functions for auto data retrieval
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
      // Process each selected account
      const promises = selectedAccountIds.map(async (id) => {
        return tikTokAccountService.runAccountTask(id);
      });
      
      await Promise.all(promises);
      messageApi.success(`Đã cập nhật dữ liệu tháng hiện tại cho ${selectedAccountIds.length} tài khoản!`);
    } catch (error) {
      console.error("Fetch current month error:", error);
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
      // Process each selected account
      const promises = selectedAccountIds.map(async (id) => {
        return tikTokAccountService.runAccountTask(id);
      });
      
      await Promise.all(promises);
      messageApi.success(`Đã cập nhật dữ liệu tất cả các tháng cho ${selectedAccountIds.length} tài khoản!`);
    } catch (error) {
      console.error("Fetch all months error:", error);
      messageApi.error("Có lỗi xảy ra khi cập nhật dữ liệu!");
    } finally {
      setIsLoadingAll(false);
    }
  };

  const handleUpdateTask = async (accountId: string, taskData: UpdateTaskDto) => {
    try {
      await tikTokAccountService.updateAccountTask(accountId, taskData);
      messageApi.success("Cập nhật lịch trình thành công!");
      
      // Refresh accounts to get updated task information
      fetchAccounts();
    } catch (error) {
      console.error("Update task error:", error);
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
          handleOk={handleOk}
          handleCancel={handleCancel}
          currentAccount={currentAccount}
          isSubmitting={isSubmitting}
        />
      </div>
    </ConfigProvider>
  );
} 