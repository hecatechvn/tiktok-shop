import React from "react";
import { Modal, Form, Input, FormInstance, Tabs, Typography } from "antd";
import {
  KeyOutlined,
  CodeOutlined,
  LinkOutlined,
} from "@ant-design/icons";
import { TikTokAccount } from "../../types/tikTokTypes";

const { TabPane } = Tabs;
const { Text } = Typography;

interface AccountModalProps {
  isModalVisible: boolean;
  form: FormInstance;
  editingId: string | null;
  isMobile: boolean;
  handleOk: () => void;
  handleCancel: () => void;
  currentAccount?: TikTokAccount;
  isSubmitting?: boolean;
}

const AccountModal: React.FC<AccountModalProps> = ({
  isModalVisible,
  form,
  editingId,
  isMobile,
  handleOk,
  handleCancel,
  currentAccount,
  isSubmitting = false,
}) => {
  return (
    <Modal
      title={editingId ? "Chỉnh sửa tài khoản TikTok" : "Thêm tài khoản TikTok"}
      open={isModalVisible}
      onOk={handleOk}
      onCancel={handleCancel}
      okText={editingId ? "Cập nhật" : "Thêm"}
      cancelText="Hủy"
      width={isMobile ? "95%" : 600}
      centered
      confirmLoading={isSubmitting}
    >
      <Tabs defaultActiveKey="basic">
        <TabPane tab="Thông tin cơ bản" key="basic">
          <Form
            form={form}
            layout="vertical"
            name="tiktok_account_form"
            size={isMobile ? "small" : "middle"}
          >
            <Form.Item
              name="appKey"
              label="App Key"
              rules={[
                {
                  required: true,
                  message: "Vui lòng nhập App Key!",
                },
              ]}
            >
              <Input prefix={<KeyOutlined />} placeholder="Nhập App Key" />
            </Form.Item>
            <Form.Item
              name="appSecret"
              label="App Secret"
              rules={[
                {
                  required: true,
                  message: "Vui lòng nhập App Secret!",
                },
              ]}
            >
              <Input.Password prefix={<KeyOutlined />} placeholder="Nhập App Secret" />
            </Form.Item>
            <Form.Item
              name="authCode"
              label="Auth Code"
              rules={[
                {
                  required: true,
                  message: "Vui lòng nhập Auth Code!",
                },
              ]}
            >
              <Input prefix={<CodeOutlined />} placeholder="Nhập Auth Code" />
            </Form.Item>
            <Form.Item
              name="sheets"
              label="Link Google Sheet"
            >
              <Input prefix={<LinkOutlined />} placeholder="Nhập link Google Sheet (không bắt buộc)" />
            </Form.Item>
          </Form>
        </TabPane>
        
        {editingId && (
          <TabPane tab="Thông tin Shop" key="shops">
            <div style={{ padding: "16px 0" }}>
              {currentAccount?.shopCipher && currentAccount.shopCipher.length > 0 ? (
                <div>
                  {currentAccount.shopCipher.map((shop) => (
                    <div key={shop.id} style={{ marginBottom: 16, padding: 16, border: '1px solid #f0f0f0', borderRadius: 8 }}>
                      <Typography.Title level={5}>{shop.name}</Typography.Title>
                      <div>
                        <Text strong>ID: </Text>
                        <Text>{shop.id}</Text>
                      </div>
                      <div>
                        <Text strong>Region: </Text>
                        <Text>{shop.region}</Text>
                      </div>
                      <div>
                        <Text strong>Seller Type: </Text>
                        <Text>{shop.seller_type}</Text>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ textAlign: 'center', padding: '20px 0' }}>
                  <Text type="secondary">Chưa có thông tin Shop</Text>
                </div>
              )}
            </div>
          </TabPane>
        )}
        
        {editingId && (
          <TabPane tab="Thông tin Token" key="token">
            <div style={{ padding: "16px 0" }}>
              <div style={{ marginBottom: 16 }}>
                <Text strong>Access Token: </Text>
                <Text>{currentAccount?.accessToken ? `${currentAccount.accessToken.substring(0, 10)}...` : "Không có"}</Text>
              </div>
              <div style={{ marginBottom: 16 }}>
                <Text strong>Refresh Token: </Text>
                <Text>{currentAccount?.refreshToken ? `${currentAccount.refreshToken.substring(0, 10)}...` : "Không có"}</Text>
              </div>
              <div style={{ marginBottom: 16 }}>
                <Text strong>Access Token Expire In: </Text>
                <Text>{currentAccount?.accessTokenExpireIn || "Không có"}</Text>
              </div>
              <div style={{ marginBottom: 16 }}>
                <Text strong>Refresh Token Expire In: </Text>
                <Text>{currentAccount?.refreshTokenExpireIn || "Không có"}</Text>
              </div>
            </div>
          </TabPane>
        )}
      </Tabs>
    </Modal>
  );
};

export default AccountModal; 