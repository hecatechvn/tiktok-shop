import React, { useState } from 'react';
import { Form, Input, Button, message, Card, Typography, Alert, Space } from 'antd';
import { LockOutlined } from '@ant-design/icons';
import { userService } from '../../services/userService';
import { ChangePasswordDto } from '../../types/userTypes';

const { Title } = Typography;

interface ChangePasswordFormProps {
  onSuccess?: () => void;
}

const ChangePasswordForm: React.FC<ChangePasswordFormProps> = ({ onSuccess }) => {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const onFinish = async (values: ChangePasswordDto) => {
    try {
      setLoading(true);
      setSuccess(false);
      setErrorMessage(null);
      
      // Kiểm tra mật khẩu mới và xác nhận mật khẩu có khớp không
      if (values.newPassword !== values.confirmPassword) {
        message.error('Mật khẩu mới và xác nhận mật khẩu không khớp');
        setErrorMessage('Mật khẩu mới và xác nhận mật khẩu không khớp');
        setLoading(false);
        return;
      }

      const response = await userService.changePassword(values);
      
      if (response.success) {
        setSuccess(true);
        message.success(response.message);
        form.resetFields();
        
        // Call onSuccess callback if provided
        if (onSuccess) {
          setTimeout(() => {
            onSuccess();
          }, 1500);
        }
      } else {
        setErrorMessage(response.message || 'Đổi mật khẩu thất bại');
        message.error(response.message || 'Đổi mật khẩu thất bại');
      }
    } catch (error) {
      console.error('Change password error:', error);
      if (error instanceof Error) {
        setErrorMessage(error.message);
        message.error(error.message);
      } else {
        setErrorMessage('Đổi mật khẩu thất bại');
        message.error('Đổi mật khẩu thất bại');
      }
    } finally {
      setLoading(false);
    }
  };

  // Remove Card wrapper when used in modal
  const formContent = (
    <>
      <Space direction="vertical" style={{ width: '100%', marginBottom: 16 }}>
        {success && (
          <Alert
            message="Đổi mật khẩu thành công"
            description="Mật khẩu của bạn đã được cập nhật thành công."
            type="success"
            showIcon
            closable
          />
        )}
        
        {errorMessage && (
          <Alert
            message="Đổi mật khẩu thất bại"
            description={errorMessage}
            type="error"
            showIcon
            closable
          />
        )}
      </Space>
      
      <Form
        form={form}
        name="change_password"
        onFinish={onFinish}
        layout="vertical"
      >
        <Form.Item
          name="currentPassword"
          label="Mật khẩu hiện tại"
          rules={[
            { required: true, message: 'Vui lòng nhập mật khẩu hiện tại' },
          ]}
        >
          <Input.Password 
            prefix={<LockOutlined />} 
            placeholder="Nhập mật khẩu hiện tại" 
          />
        </Form.Item>

        <Form.Item
          name="newPassword"
          label="Mật khẩu mới"
          rules={[
            { required: true, message: 'Vui lòng nhập mật khẩu mới' },
            { min: 8, message: 'Mật khẩu phải có ít nhất 8 ký tự' },
          ]}
          hasFeedback
        >
          <Input.Password 
            prefix={<LockOutlined />} 
            placeholder="Nhập mật khẩu mới" 
          />
        </Form.Item>

        <Form.Item
          name="confirmPassword"
          label="Xác nhận mật khẩu mới"
          dependencies={['newPassword']}
          rules={[
            { required: true, message: 'Vui lòng xác nhận mật khẩu mới' },
            ({ getFieldValue }) => ({
              validator(_, value) {
                if (!value || getFieldValue('newPassword') === value) {
                  return Promise.resolve();
                }
                return Promise.reject(new Error('Mật khẩu xác nhận không khớp với mật khẩu mới'));
              },
            }),
          ]}
          hasFeedback
        >
          <Input.Password 
            prefix={<LockOutlined />} 
            placeholder="Xác nhận mật khẩu mới" 
          />
        </Form.Item>

        <Form.Item>
          <Button 
            type="primary" 
            htmlType="submit" 
            loading={loading} 
            style={{ width: '100%' }}
          >
            Đổi mật khẩu
          </Button>
        </Form.Item>
      </Form>
    </>
  );

  // If used in a page (not in a modal), wrap with Card
  if (!onSuccess) {
    return (
      <Card style={{ maxWidth: 500, margin: '0 auto', marginTop: 24 }}>
        <Title level={3} style={{ textAlign: 'center', marginBottom: 24 }}>
          Đổi mật khẩu
        </Title>
        {formContent}
      </Card>
    );
  }

  // If used in a modal, return without Card wrapper
  return formContent;
};

export default ChangePasswordForm; 