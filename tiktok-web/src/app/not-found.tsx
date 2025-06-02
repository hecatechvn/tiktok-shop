"use client";

import React from "react";
import { Button, Typography, Space, Result } from "antd";
import { useRouter } from "next/navigation";
import Link from "next/link";

const { Title, Text } = Typography;

export default function NotFound() {
  const router = useRouter();

  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-8 text-center bg-gray-50">
      <Result
        status="404"
        title={
          <Title level={1} className="text-6xl my-2">
            404
          </Title>
        }
        subTitle={
          <Space direction="vertical" size="large">
            <Title level={3} className="font-normal m-0">
              Rất tiếc! Không tìm thấy trang
            </Title>
            <Text type="secondary" className="text-base">
              Trang bạn đang tìm kiếm không tồn tại hoặc đã được di chuyển.
            </Text>
          </Space>
        }
        extra={
          <Space size="middle" className="mt-8">
            <Button type="primary" size="large" onClick={() => router.back()}>
              Quay lại
            </Button>
            <Link href="/" passHref>
              <Button size="large">Trang chủ</Button>
            </Link>
          </Space>
        }
      />
    </div>
  );
} 