import React, { useState } from "react";
import { Modal, Form, Input, FormInstance, Tabs, Typography, Button, message, Radio, Space, RadioChangeEvent, Alert, Card, Row, Col } from "antd";
import {
  KeyOutlined,
  LoginOutlined,
  GlobalOutlined,
  ShopOutlined,
  MailOutlined,
  IdcardOutlined
} from "@ant-design/icons";
import { TikTokAccount } from "../../types/tikTokTypes";
import { generateTikTokAuthUrl } from "../../utils/tiktokAuth";

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
      form.validateFields(['appKey', 'appSecret', 'serviceId', 'shopName', 'email'])
        .then(values => {
          // Lưu dữ liệu tài khoản đang chờ xử lý vào localStorage
          const pendingAccountData = {
            ...values,
            id: editingId || undefined,
            sheetEmails: [values.email]
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

  // Define tab items for the Tabs component
  const tabItems = [
    {
      key: 'basic',
      label: 'Thông tin cơ bản',
      children: (
        <>
          <Form
            form={form}
            layout="vertical"
            name="tiktok_account_form"
            size={isMobile ? "small" : "middle"}
          >
            <Card title="Thông tin Shop" variant="outlined" size="small">
              <Row gutter={16}>
                <Col span={isMobile ? 24 : 12}>
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
                </Col>
                <Col span={isMobile ? 24 : 12}>
                  <Form.Item
                    name="serviceId"
                    label={
                      <span>
                        <IdcardOutlined /> ID Shop
                      </span>
                    }
                    rules={[
                      {
                        required: true,
                        message: "Vui lòng nhập ID Shop!",
                      },
                    ]}
                  >
                    <Input placeholder="Nhập ID Shop (service_id)" />
                  </Form.Item>
                </Col>
              </Row>
              
              <Row gutter={16}>
                <Col span={isMobile ? 24 : 12}>
                  <Form.Item
                    name="email"
                    label={
                      <span>
                        <MailOutlined /> Email
                      </span>
                    }
                    rules={[
                      {
                        required: true,
                        type: "email",
                        message: "Vui lòng nhập email hợp lệ!",
                      },
                    ]}
                  >
                    <Input placeholder="Nhập email của bạn" />
                  </Form.Item>
                </Col>
                <Col span={isMobile ? 24 : 12}>
                  <Form.Item
                    label={
                      <span>
                        <GlobalOutlined /> Thị trường
                      </span>
                    }
                    required
                  >
                    <Radio.Group onChange={handleMarketChange} value={market}>
                      <Space direction="horizontal">
                        <Radio value="global">Global</Radio>
                        <Radio value="us">US</Radio>
                      </Space>
                    </Radio.Group>
                  </Form.Item>
                </Col>
              </Row>
            </Card>
            
            <Card title="Thông tin API" variant="outlined" size="small" className="mt-3">
              <Row gutter={16}>
                <Col span={isMobile ? 24 : 12}>
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
                </Col>
                <Col span={isMobile ? 24 : 12}>
                  <Form.Item
                    name="appSecret"
                    label="App Secret"
                    rules={[
                      {
                        required: true,
                        message: "Vui lòng nhập khóa bí mật!",
                      },
                    ]}
                  >
                    <Input.Password prefix={<KeyOutlined />} placeholder="Nhập khóa bí mật ứng dụng" />
                  </Form.Item>
                </Col>
              </Row>
            </Card>
          </Form>
          
          <Alert
            className="mt-3"
            message="Nhấn nút &quot;Ủy quyền với TikTok&quot; để tiếp tục. Bạn sẽ được chuyển hướng đến trang đăng nhập TikTok Shop."
            type="info"
            showIcon
          />
        </>
      )
    }
  ];

  // Add conditional tabs for editing mode
  if (editingId) {
    tabItems.push({
      key: 'shops',
      label: 'Thông tin Shop',
      children: (
        <div style={{ padding: "16px 0" }}>
          {currentAccount?.shopCipher && currentAccount.shopCipher.length > 0 ? (
            <div>
              {currentAccount.shopCipher.map((shop) => (
                <Card key={shop.id} size="small" variant="outlined" style={{ marginBottom: 16 }}>
                  <Typography.Title level={5}>{shop.name}</Typography.Title>
                  <Row gutter={16}>
                    <Col span={8}>
                      <Text strong>ID: </Text>
                      <Text>{shop.id}</Text>
                    </Col>
                    <Col span={8}>
                      <Text strong>Region: </Text>
                      <Text>{shop.region}</Text>
                    </Col>
                    <Col span={8}>
                      <Text strong>Seller Type: </Text>
                      <Text>{shop.seller_type}</Text>
                    </Col>
                  </Row>
                </Card>
              ))}
            </div>
          ) : (
            <div style={{ textAlign: 'center', padding: '20px 0' }}>
              <Text type="secondary">Chưa có thông tin Shop</Text>
            </div>
          )}
        </div>
      )
    });

    tabItems.push({
      key: 'token',
      label: 'Thông tin Token',
      children: (
        <Card size="small" variant="outlined">
          <Row gutter={[16, 16]}>
            <Col span={12}>
              <Text strong>Access Token: </Text>
              <Text>{currentAccount?.accessToken ? `${currentAccount.accessToken.substring(0, 10)}...` : "Không có"}</Text>
            </Col>
            <Col span={12}>
              <Text strong>Refresh Token: </Text>
              <Text>{currentAccount?.refreshToken ? `${currentAccount.refreshToken.substring(0, 10)}...` : "Không có"}</Text>
            </Col>
            <Col span={12}>
              <Text strong>Access Token Expire In: </Text>
              <Text>{currentAccount?.accessTokenExpireIn || "Không có"}</Text>
            </Col>
            <Col span={12}>
              <Text strong>Refresh Token Expire In: </Text>
              <Text>{currentAccount?.refreshTokenExpireIn || "Không có"}</Text>
            </Col>
          </Row>
        </Card>
      )
    });
  }

  return (
    <Modal
      title={editingId ? "Chỉnh sửa tài khoản TikTok" : "Thêm tài khoản TikTok"}
      open={isModalVisible}
      onOk={handleOk}
      onCancel={handleCancel}
      okText="Lưu"
      cancelText="Hủy"
      width={isMobile ? "95%" : 700}
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
      <Tabs defaultActiveKey="basic" items={tabItems} />
    </Modal>
  );
};

export default AccountModal; 