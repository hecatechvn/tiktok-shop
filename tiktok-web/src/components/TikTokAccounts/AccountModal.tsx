import React, { useState } from "react";
import { Modal, Form, Input, FormInstance, Tabs, Typography, Button, message, Radio, Space, RadioChangeEvent, Alert } from "antd";
import {
  KeyOutlined,
  LoginOutlined,
  GlobalOutlined,
  ShopOutlined,
} from "@ant-design/icons";
import { TikTokAccount } from "../../types/tikTokTypes";
import { generateTikTokAuthUrl } from "../../utils/tiktokAuth";

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
  const [market, setMarket] = useState<'us' | 'global'>('global');
  
  const handleMarketChange = (e: RadioChangeEvent) => {
    setMarket(e.target.value);
  };
  
  const handleAuthorize = () => {
    try {
      // Xác thực các trường form trước
      form.validateFields(['appKey', 'appSecret', 'serviceId', 'shopName'])
        .then(values => {
          // Lưu dữ liệu tài khoản đang chờ xử lý vào localStorage
          const pendingAccountData = {
            ...values,
            id: editingId || undefined
          };
          
          localStorage.setItem('pendingTikTokAccount', JSON.stringify(pendingAccountData));
          
          // Tạo URL ủy quyền TikTok dựa trên thị trường đã chọn
          const authUrl = generateTikTokAuthUrl(values.serviceId, market);
          
          // Chuyển hướng đến trang ủy quyền TikTok
          window.location.href = authUrl;
        })
        .catch(error => {
          console.error('Xác thực thất bại:', error);
          message.error('Vui lòng điền đầy đủ thông tin trước khi ủy quyền');
        });
    } catch (error) {
      console.error('Lỗi trong quá trình ủy quyền:', error);
      message.error('Có lỗi xảy ra khi xử lý ủy quyền');
    }
  };

  return (
    <Modal
      title={editingId ? "Chỉnh sửa tài khoản TikTok" : "Thêm tài khoản TikTok"}
      open={isModalVisible}
      onOk={handleOk}
      onCancel={handleCancel}
      okText="Lưu"
      cancelText="Hủy"
      width={isMobile ? "95%" : 600}
      centered
      confirmLoading={isSubmitting}
      footer={[
        <Button key="cancel" onClick={handleCancel}>
          Hủy
        </Button>,
        <Button 
          key="authorize" 
          type="primary" 
          icon={<LoginOutlined />}
          onClick={handleAuthorize}
        >
          Ủy quyền với TikTok
        </Button>
      ]}
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
              name="shopName"
              label={
                <span>
                  <ShopOutlined /> Tên Shop(Sheet)
                </span>
              }
              rules={[
                {
                  required: true,
                  message: "Vui lòng nhập tên Shop!",
                },
              ]}
            >
              <Input placeholder="Nhập tên Shop của bạn" />
            </Form.Item>
            
            <Form.Item
              name="serviceId"
              label="ID Shop"
              rules={[
                {
                  required: true,
                  message: "Vui lòng nhập ID Shop!",
                },
              ]}
            >
              <Input placeholder="Nhập ID Shop (service_id)" />
            </Form.Item>
            
            <Form.Item
              label={
                <span>
                  <GlobalOutlined /> Thị trường
                </span>
              }
              required
            >
              <Radio.Group onChange={handleMarketChange} value={market}>
                <Space direction={isMobile ? 'vertical' : 'horizontal'}>
                  <Radio value="global">Global (Quốc tế)</Radio>
                  <Radio value="us">US (Hoa Kỳ)</Radio>
                </Space>
              </Radio.Group>
            </Form.Item>
            
            <Form.Item
              name="appKey"
              label="App Key"
              rules={[
                {
                  required: true,
                  message: "Vui lòng nhập khóa ứng dụng!",
                },
              ]}
            >
              <Input prefix={<KeyOutlined />} placeholder="Nhập khóa ứng dụng" />
            </Form.Item>
            <Form.Item
              name="appSecret"
              label="App Secret"
              rules={[
                {
                  required: true,
                  message: "Vui lòng nhập khóa bí mật ứng dụng!",
                },
              ]}
            >
              <Input.Password prefix={<KeyOutlined />} placeholder="Nhập khóa bí mật ứng dụng" />
            </Form.Item>
          </Form>
          
          <div className="mt-4">
            <Alert
              message="Nhấn nút &quot;Ủy quyền với TikTok&quot; để tiếp tục. Bạn sẽ được chuyển hướng đến trang đăng nhập TikTok Shop. Sau khi ủy quyền thành công, tài khoản sẽ tự động được thêm vào hệ thống."
              type="info"
              showIcon
            />
          </div>
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