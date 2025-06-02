import React, { useState } from 'react';
import { Layout, Dropdown, Avatar, Space, message, Button } from 'antd';
import { UserOutlined, LogoutOutlined, LockOutlined, MenuFoldOutlined, MenuUnfoldOutlined, MenuOutlined } from '@ant-design/icons';
import { signOut } from 'next-auth/react';
import { useAuth } from '../../hooks/useAuth';
import ChangePasswordModal from '../ChangePassword/ChangePasswordModal';

const { Header } = Layout;

interface AppHeaderProps {
  collapsed?: boolean;
  setCollapsed?: (collapsed: boolean) => void;
  setMobileDrawerOpen?: (open: boolean) => void;
  isMobile?: boolean;
}

const AppHeader: React.FC<AppHeaderProps> = ({ 
  collapsed = false, 
  setCollapsed, 
  setMobileDrawerOpen,
  isMobile = false
}) => {
  const { user } = useAuth();
  const [changePasswordModalOpen, setChangePasswordModalOpen] = useState(false);

  const handleLogout = () => {
    message.success('Đăng xuất thành công');
    signOut({ callbackUrl: '/login' });
  };

  const handleChangePassword = () => {
    setChangePasswordModalOpen(true);
  };

  const menuItems = [
    {
      key: '1',
      icon: <LockOutlined />,
      label: 'Đổi mật khẩu',
      onClick: handleChangePassword,
    },
    {
      key: '2',
      icon: <LogoutOutlined />,
      label: 'Đăng xuất',
      onClick: handleLogout,
    },
  ];

  return (
    <>
      <Header className="bg-white px-4 flex justify-between items-center shadow-sm sticky top-0 z-10 w-full" style={{ backgroundColor: '#ffffff', padding: '0 16px' }}>
        <div className="flex items-center">
          {isMobile ? (
            <Button
              type="text"
              icon={<MenuOutlined />}
              onClick={() => setMobileDrawerOpen && setMobileDrawerOpen(true)}
              className="text-base p-0 mr-2"
            />
          ) : (
            <Button
              type="text"
              icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
              onClick={() => setCollapsed && setCollapsed(!collapsed)}
              className="text-base p-0 mr-2"
            />
          )}
          <span className="text-base font-medium">TikTok Dashboard</span>
        </div>
        
        <div>
          <Dropdown menu={{ items: menuItems }} placement="bottomRight">
            <Space className="cursor-pointer">
              <Avatar icon={<UserOutlined />} />
              <span>{user?.name || 'Người dùng'}</span>
            </Space>
          </Dropdown>
        </div>
      </Header>
      
      <ChangePasswordModal 
        open={changePasswordModalOpen}
        onClose={() => setChangePasswordModalOpen(false)}
      />
    </>
  );
};

export default AppHeader; 