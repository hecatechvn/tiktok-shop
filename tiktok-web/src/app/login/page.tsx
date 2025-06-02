"use client";

import { useState } from "react";
import { Button, Form, Input, Typography, message, Card, Space } from "antd";
import { UserOutlined, LockOutlined } from "@ant-design/icons";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";

const { Title, Text } = Typography;

interface LoginFormValues {
  username: string;
  password: string;
}

// Color theme options - uncomment one set to use
// Blue theme
const primaryColor = "#1677ff";
const secondaryColor = "#f0f7ff";

// Green theme
// const primaryColor = "#10b981";
// const secondaryColor = "#ecfdf5";

// Purple theme
// const primaryColor = "#8b5cf6";
// const secondaryColor = "#f5f3ff";

export default function LoginPage() {
  const [loading, setLoading] = useState(false);
  const [messageApi, contextHolder] = message.useMessage();
  const router = useRouter();

  const onFinish = async (values: LoginFormValues) => {
    setLoading(true);
    try {
      const result = await signIn("credentials", {
        username: values.username,
        password: values.password,
        redirect: false,
      });

      if (result?.error) {
        messageApi.error("Đăng nhập thất bại!");
        return;
      }

      messageApi.success("Đăng nhập thành công!");
      router.push("/");
    } catch (error: unknown) {
      console.error("Login error:", error);
      messageApi.error("Đăng nhập thất bại!");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen w-full items-center justify-center p-4" style={{ backgroundColor: secondaryColor }}>
      {contextHolder}
      <Card
        className="w-full max-w-[420px] rounded-lg shadow-lg border-none"
        styles={{ body: { padding: 24 } }}
      >
        <Space direction="vertical" size="large" className="w-full">
          <div className="text-center">
            <Title level={2} className="mb-2" style={{ color: primaryColor }}>
              Chào mừng trở lại
            </Title>
            <Text type="secondary">Đăng nhập vào tài khoản của bạn</Text>
          </div>

          <Form
            name="login"
            initialValues={{ remember: true }}
            onFinish={onFinish}
            layout="vertical"
            size="large"
          >
            <Form.Item
              name="username"
              rules={[{ required: true, message: "Vui lòng nhập tên đăng nhập!" }]}
              label="Tên đăng nhập"
            >
              <Input
                prefix={<UserOutlined className="text-gray-400" />}
                placeholder="Tên đăng nhập"
              />
            </Form.Item>

            <Form.Item
              name="password"
              rules={[{ required: true, message: "Vui lòng nhập mật khẩu!" }]}
              label="Mật khẩu"
            >
              <Input.Password
                prefix={<LockOutlined className="text-gray-400" />}
                placeholder="Mật khẩu"
              />
            </Form.Item>

            <Form.Item>
              <Button
                type="primary"
                htmlType="submit"
                loading={loading}
                className="w-full h-12"
                style={{ 
                  backgroundColor: primaryColor,
                  borderColor: primaryColor
                }}
              >
                Đăng nhập
              </Button>
            </Form.Item>
          </Form>
        </Space>
      </Card>
    </div>
  );
} 