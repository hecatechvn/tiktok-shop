"use client";

import React, { useState, useEffect } from "react";
import { Layout, Menu, Grid, Image, Drawer } from "antd";
import {
  DashboardOutlined,
} from "@ant-design/icons";
import Link from "next/link";
import { usePathname } from "next/navigation";
import AppHeader from "../../components/Header/AppHeader";

const { Sider, Content } = Layout;
const { useBreakpoint } = Grid;

export default function AdminLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const [collapsed, setCollapsed] = useState(true);
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);
  const screens = useBreakpoint();
  const pathname = usePathname();
  
  // Handle collapsing sidebar on smaller screens
  useEffect(() => {
    if (screens.md === false) {
      setCollapsed(true);
    }
  }, [screens.md]);

  const menuItems = [
    {
      key: "dashboard",
      icon: <DashboardOutlined />,
      label: <Link href="/">Dashboard</Link>,
    }
  ];

  // Determine the selected key based on the current path
  const getSelectedKey = () => {
    if (pathname === "/" || pathname === "") {
      return "dashboard";
    }
    return "";
  };

  const selectedKey = getSelectedKey();

  const SidebarContent = () => (
    <>
      <div className="h-16 flex items-center justify-center px-4 border-b border-gray-100">
        {collapsed ? (
          <div className="w-8 h-8 overflow-hidden">
            <Image
              src="/hecatech.png"
              alt="Hecatech Logo"
              preview={false}
              className="object-contain max-w-full max-h-full"
            />
          </div>
        ) : (
          <Image
            src="/hecatech.png"
            alt="Hecatech Logo"
            preview={false}
            height={32}
            className="object-contain"
          />
        )}
      </div>
      <Menu
        theme="light"
        mode="inline"
        selectedKeys={[selectedKey]}
        items={menuItems}
        className="border-r-0"
        onClick={() => screens.lg === false && setMobileDrawerOpen(false)}
      />
    </>
  );

  return (
    <Layout style={{ minHeight: '100vh' }}>
      {/* For larger screens, use the regular Sider */}
      {screens.lg ? (
        <Sider 
          trigger={null} 
          collapsible 
          collapsed={collapsed}
          theme="light"
          style={{
            boxShadow: '0 2px 8px rgba(0, 0, 0, 0.15)',
            zIndex: 10,
            height: '100vh',
            position: 'fixed',
            left: 0,
            top: 0,
            bottom: 0,
            overflow: 'hidden'
          }}
          width={200}
          collapsedWidth={64}
        >
          <SidebarContent />
        </Sider>
      ) : null}

      {/* For mobile screens, use Drawer component */}
      <Drawer
        placement="left"
        closable={false}
        onClose={() => setMobileDrawerOpen(false)}
        open={!screens.lg && mobileDrawerOpen}
        width={200}
        maskClosable={true}
        styles={{
          body: { padding: 0 },
        }}
      >
        <SidebarContent />
      </Drawer>
      
      <Layout style={{ 
        marginLeft: screens.lg ? (collapsed ? '64px' : '200px') : '0',
        transition: 'all 0.2s'
      }}>
        <AppHeader 
          collapsed={collapsed}
          setCollapsed={setCollapsed}
          setMobileDrawerOpen={setMobileDrawerOpen}
          isMobile={!screens.lg}
        />
        <Content
          style={{
            margin: '24px',
            padding: '24px',
            background: '#ffffff',
            borderRadius: '8px',
            boxShadow: '0 1px 2px rgba(0, 0, 0, 0.05)',
            minHeight: '280px',
            overflow: 'auto'
          }}
        >
          {children}
        </Content>
      </Layout>
    </Layout>
  );
} 