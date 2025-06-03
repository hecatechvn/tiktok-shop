"use client";

import { SessionProvider } from "next-auth/react";
import { ConfigProvider } from "antd";
import { AntdRegistry } from "@ant-design/nextjs-registry";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <AntdRegistry>
        <ConfigProvider>
          {children}
        </ConfigProvider>
      </AntdRegistry>
    </SessionProvider>
  );
} 