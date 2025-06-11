import React, { useState, useEffect } from "react";
import {
  Card,
  Row,
  Col,
  Select,
  Form,
  Button,
  Alert,
  Typography,
  Space,
  Tooltip,
  Divider,
  Input,
  Switch,
  message,
  Tag,
  List,
} from "antd";
import {
  QuestionCircleOutlined,
  SyncOutlined,
  DownloadOutlined,
  SaveOutlined,
  DeleteOutlined,
  MailOutlined,
} from "@ant-design/icons";
import { TikTokAccount, UpdateAccountDto, UpdateTaskDto } from "../../types/tikTokTypes";
import cronstrue from 'cronstrue';
import 'cronstrue/locales/vi';

const { Option } = Select;
const { Text } = Typography;

interface DataRetrievalCardProps {
  accounts: TikTokAccount[];
  selectedAccountIds: string[];
  isLoading: boolean;
  isLoadingAll: boolean;
  isMobile: boolean;
  handleAccountSelect: (value: string[]) => void;
  handleFetchCurrentMonth: () => void;
  handleFetchAllMonths: () => void;
  handleUpdateTask: (accountId: string, taskData: UpdateTaskDto) => Promise<void>;
  handleUpdateAccount?: (accountId: string, data: UpdateAccountDto) => Promise<void>;
}

const DataRetrievalCard: React.FC<DataRetrievalCardProps> = ({
  accounts,
  selectedAccountIds,
  isLoading,
  isLoadingAll,
  isMobile,
  handleAccountSelect,
  handleFetchCurrentMonth,
  handleFetchAllMonths,
  handleUpdateTask,
  handleUpdateAccount,
}) => {
  const [form] = Form.useForm();
  const [selectedFrequency, setSelectedFrequency] = useState<string>("daily");
  const [cronExpression, setCronExpression] = useState<string>("0 0 * * *");
  const [cronDescription, setCronDescription] = useState<string>(
    cronstrue.toString("0 0 * * *", { verbose: true, locale: "vi" })
  );
  const [customCron, setCustomCron] = useState<boolean>(false);
  const [isTaskActive, setIsTaskActive] = useState<boolean>(false);
  const [isUpdatingStatus, setIsUpdatingStatus] = useState<boolean>(false);
  
  // Email management states
  const [emailList, setEmailList] = useState<string[]>([]);
  const [newEmail, setNewEmail] = useState<string>("");
  const [emailError, setEmailError] = useState<string>("");
  const [isUpdatingEmails, setIsUpdatingEmails] = useState<boolean>(false);

  // Cập nhật trạng thái isActive khi chọn tài khoản
  useEffect(() => {
    if (selectedAccountIds.length === 1) {
      const selectedAccount = accounts.find(acc => acc._id === selectedAccountIds[0]);
      if (selectedAccount?.task) {
        // Cập nhật trạng thái isActive
        setIsTaskActive(selectedAccount.task.isActive || false);
        
        // Cập nhật biểu thức cron từ dữ liệu của tài khoản
        if (selectedAccount.task.cronExpression) {
          const cronExp = selectedAccount.task.cronExpression;
          setCronExpression(cronExp);
          
          try {
            setCronDescription(cronstrue.toString(cronExp, { verbose: true, locale: "vi" }));
          } catch {
            setCronDescription("Biểu thức cron không hợp lệ");
          }
          
          // Xác định loại tần suất dựa trên biểu thức cron
          if (cronExp.match(/^\d+ \* \* \* \*$/)) {
            setSelectedFrequency("hourly");
            setCustomCron(false);
          } else if (cronExp.match(/^\d+ \d+ \* \* \*$/)) {
            setSelectedFrequency("daily");
            setCustomCron(false);
          } else if (cronExp.match(/^\d+ \d+ \* \* [0-6]$/)) {
            setSelectedFrequency("weekly");
            setCustomCron(false);
            // Cập nhật form fields cho weekly
            const parts = cronExp.split(' ');
            form.setFieldsValue({ 
              weekHour: parts[1],
              weekDay: parts[4]
            });
          } else if (cronExp.match(/^\d+ \d+ \d+ \* \*$/)) {
            setSelectedFrequency("monthly");
            setCustomCron(false);
            // Cập nhật form fields cho monthly
            const parts = cronExp.split(' ');
            form.setFieldsValue({ 
              monthHour: parts[1],
              monthDay: parts[2]
            });
          } else {
            setSelectedFrequency("custom");
            setCustomCron(true);
          }
        } else {
          // Nếu không có biểu thức cron, sử dụng giá trị mặc định
          setCronExpression("0 0 * * *");
          setCronDescription(cronstrue.toString("0 0 * * *", { verbose: true, locale: "vi" }));
          setSelectedFrequency("daily");
          setCustomCron(false);
        }
        
        // Cập nhật danh sách email
        setEmailList(selectedAccount.sheetEmails || []);
      } else {
        setIsTaskActive(false);
        setCronExpression("0 0 * * *");
        setCronDescription(cronstrue.toString("0 0 * * *", { verbose: true, locale: "vi" }));
        setSelectedFrequency("daily");
        setCustomCron(false);
        setEmailList([]);
      }
    } else {
      setIsTaskActive(false);
      setEmailList([]);
    }
  }, [selectedAccountIds, accounts, form]);

  const handleFrequencyChange = (value: string) => {
    setSelectedFrequency(value);
    let newCronExpression = "0 0 * * *"; // Default: daily at midnight

    switch (value) {
      case "hourly":
        newCronExpression = "0 * * * *"; // Every hour at minute 0
        break;
      case "daily":
        newCronExpression = "0 0 * * *"; // Every day at midnight
        break;
      case "weekly":
        newCronExpression = "0 0 * * 1"; // Every Monday at midnight
        break;
      case "monthly":
        newCronExpression = "0 0 1 * *"; // 1st day of month at midnight
        break;
      case "custom":
        // Nếu chọn tùy chỉnh, giữ nguyên biểu thức cron hiện tại
        return;
    }

    setCronExpression(newCronExpression);
    try {
      setCronDescription(cronstrue.toString(newCronExpression, { verbose: true, locale: "vi" }));
    } catch {
      setCronDescription("Biểu thức cron không hợp lệ");
    }
  };

  const handleCustomCronChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setCronExpression(value);
    try {
      setCronDescription(cronstrue.toString(value, { verbose: true, locale: "vi" }));
    } catch {
      setCronDescription("Biểu thức cron không hợp lệ");
    }
  };

  // Kiểm tra biểu thức cron có hợp lệ không
  const isCronValid = (cron: string): boolean => {
    try {
      cronstrue.toString(cron, { verbose: true, locale: "vi" });
      return true;
    } catch {
      return false;
    }
  };

  const handleSaveSchedule = async () => {
    if (selectedAccountIds.length === 0) return;

    try {
      // Nếu cron job đang tắt, chỉ cần lưu trạng thái
      if (!isTaskActive) {
        const promises = selectedAccountIds.map(id => 
          handleUpdateTask(id, { isActive: false })
        );
        
        await Promise.all(promises);
        message.success("Đã tắt cron job thành công");
        return;
      }
      
      // Kiểm tra biểu thức cron có hợp lệ không
      if (!isCronValid(cronExpression)) {
        message.error("Biểu thức cron không hợp lệ");
        return;
      }

      const promises = selectedAccountIds.map(id => 
        handleUpdateTask(id, { cronExpression, isActive: true })
      );
      
      await Promise.all(promises);
      message.success("Đã lưu lịch trình cron job thành công");
    } catch (error) {
      console.error("Save schedule error:", error);
      message.error(error instanceof Error ? error.message : "Có lỗi xảy ra khi lưu lịch trình");
    }
  };

  // Email validation function
  const validateEmail = (email: string): boolean => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  };

  // Handle adding new email
  const handleAddEmail = () => {
    if (!newEmail) {
      setEmailError("Email không được để trống");
      message.error("Email không được để trống");
      return;
    }
    
    if (!validateEmail(newEmail)) {
      setEmailError("Email không đúng định dạng");
      message.error("Email không đúng định dạng");
      return;
    }
    
    if (emailList.includes(newEmail)) {
      setEmailError("Email đã tồn tại trong danh sách");
      message.error("Email đã tồn tại trong danh sách");
      return;
    }
    
    setEmailError("");
    setEmailList([...emailList, newEmail]);
    setNewEmail("");
    message.success("Đã thêm email vào danh sách");
  };

  // Handle removing email
  const handleRemoveEmail = (email: string) => {
    setEmailList(emailList.filter(e => e !== email));
  };

  // Handle saving email list
  const handleSaveEmails = async () => {
    if (selectedAccountIds.length !== 1) {
      message.warning("Vui lòng chọn một tài khoản để cập nhật danh sách email");
      return;
    }
    
    try {
      setIsUpdatingEmails(true);
      
      if (handleUpdateAccount) {
        await handleUpdateAccount(selectedAccountIds[0], { 
          sheetEmails: emailList 
        });
        message.success("Cập nhật danh sách email thành công");
      } else {
        message.error("Không thể cập nhật danh sách email");
      }
    } catch (error) {
      console.error("Save emails error:", error);
      message.error(error instanceof Error ? error.message : "Có lỗi xảy ra khi lưu danh sách email");
    } finally {
      setIsUpdatingEmails(false);
    }
  };

  return (
    <Card 
      title={<Typography.Title level={4}>Cấu hình tiktok shop</Typography.Title>}
      styles={{ body: { padding: 24 } }}
      style={{ marginTop: 24, marginBottom: 24 }}
      className="auto-data-config"
    >
      <Row gutter={[24, 24]}>
        <Col xs={24} lg={12}>
          <Card 
            type="inner" 
            title="Chọn tài khoản" 
            extra={<Tooltip title="Chọn tài khoản để cấu hình tự động lấy dữ liệu"><QuestionCircleOutlined /></Tooltip>}
          >
            <Form layout="vertical">
              <Form.Item 
                label="Tài khoản cần lấy dữ liệu tự động"
                required
              >
                <Select
                  mode="multiple"
                  placeholder="Chọn tài khoản"
                  style={{ width: '100%' }}
                  onChange={handleAccountSelect}
                  optionFilterProp="children"
                  maxTagCount={isMobile ? 1 : 3}
                  notFoundContent="Không có tài khoản"
                  allowClear
                  value={selectedAccountIds}
                >
                  {accounts.map(account => {
                    const shopName = account.shopCipher?.[0]?.name || "Tài khoản TikTok";
                    return (
                      <Option key={account._id} value={account._id || ""}>
                        {shopName} {account.task?.isActive ? "(Đang chạy cron)" : "(Đã tắt cron)"}
                      </Option>
                    );
                  })}
                </Select>
              </Form.Item>
              
              {accounts.length === 0 && (
                <Alert
                  message="Không có tài khoản"
                  description="Vui lòng thêm ít nhất một tài khoản để sử dụng tính năng tự động lấy dữ liệu."
                  type="warning"
                  showIcon
                />
              )}

              {selectedAccountIds.length > 0 && (
                <Alert
                  message={`Đã chọn ${selectedAccountIds.length} tài khoản`}
                  type="info"
                  showIcon
                  style={{ marginTop: 16 }}
                />
              )}
            </Form>
          </Card>
          
          {/* Email Management Card */}
          <Card
            type="inner"
            title={
              <span>
                <MailOutlined /> Quản lý danh sách email
              </span>
            }
            extra={<Tooltip title="Quản lý danh sách email nhận báo cáo"><QuestionCircleOutlined /></Tooltip>}
            style={{ marginTop: 16 }}
          >
            <Space direction="vertical" style={{ width: '100%' }}>
              <Alert
                message="Mặc định đã share cho automation@hecatech.vn"
                type="info"
                showIcon
              />
              
              <div style={{ marginTop: 16 }}>
                <Form layout="vertical">
                  <Form.Item 
                    label="Thêm email mới"
                    help={emailError ? <Text type="danger">{emailError}</Text> : null}
                    validateStatus={emailError ? "error" : ""}
                    style={{ marginBottom: emailError ? 0 : 16 }}
                  >
                    <Input.Search
                      placeholder="Nhập email"
                      enterButton="Thêm"
                      value={newEmail}
                      onChange={(e) => {
                        setNewEmail(e.target.value);
                        setEmailError("");
                      }}
                      onSearch={handleAddEmail}
                      disabled={selectedAccountIds.length !== 1 || isUpdatingEmails}
                      style={{ width: '100%' }}
                      allowClear
                    />
                  </Form.Item>
                </Form>
              </div>
              
              <div style={{ marginTop: 8 }}>
                <Text strong>Danh sách email ({emailList.length})</Text>
                {emailList.length > 0 ? (
                  <List
                    size="small"
                    dataSource={emailList}
                    style={{ marginTop: 8 }}
                    renderItem={(email) => (
                      <List.Item
                        actions={[
                          <Button
                            key="delete"
                            type="text"
                            danger
                            icon={<DeleteOutlined />}
                            onClick={() => handleRemoveEmail(email)}
                            disabled={selectedAccountIds.length !== 1 || isUpdatingEmails}
                          />
                        ]}
                      >
                        <Tag color="blue">{email}</Tag>
                      </List.Item>
                    )}
                  />
                ) : (
                  <Alert
                    message="Chưa có email nào trong danh sách"
                    type="warning"
                    showIcon
                    style={{ marginTop: 8 }}
                  />
                )}
              </div>
              
              <Button
                type="primary"
                icon={<SaveOutlined />}
                onClick={handleSaveEmails}
                disabled={selectedAccountIds.length !== 1}
                loading={isUpdatingEmails}
                style={{ marginTop: 16 }}
                block
              >
                Lưu danh sách email
              </Button>
            </Space>
          </Card>
        </Col>
        <Col xs={24} lg={12}>
          <Card 
            type="inner" 
            title="Thao tác dữ liệu" 
            extra={<Tooltip title="Chọn cách thức lấy dữ liệu"><QuestionCircleOutlined /></Tooltip>}
          >
            <div>
              <Typography.Text strong>Thao tác thủ công</Typography.Text>
              <Space direction="vertical" style={{ width: '100%', marginTop: 8, marginBottom: 16 }}>
                <Button
                  type="primary"
                  icon={<SyncOutlined />}
                  onClick={handleFetchCurrentMonth}
                  loading={isLoading}
                  disabled={selectedAccountIds.length === 0}
                  block
                  style={{ marginBottom: 8 }}
                >
                  Cập nhật dữ liệu 15 ngày gần nhất
                </Button>
                
                <Button
                  type="default"
                  icon={<DownloadOutlined />}
                  onClick={handleFetchAllMonths}
                  loading={isLoadingAll}
                  disabled={selectedAccountIds.length === 0}
                  block
                >
                  Lấy dữ liệu tất cả các tháng
                </Button>
              </Space>
              
              <Divider style={{ margin: '16px 0' }} />
              
              <Typography.Text strong>Tự động (Cron Job)</Typography.Text>
              <div style={{ marginTop: 8 }}>
                <Form form={form} layout="vertical">
                  <Form.Item label="Trạng thái Cron Job">
                    <Space>
                      <Switch 
                        checked={isTaskActive} 
                        onChange={(checked) => {
                          setIsTaskActive(checked);
                          // Nếu đang tắt cron job, cập nhật ngay
                          if (!checked) {
                            setIsUpdatingStatus(true);
                            Promise.all(
                              selectedAccountIds.map(id => 
                                handleUpdateTask(id, { isActive: false })
                              )
                            )
                            .catch(error => {
                              console.error("Toggle task status failed:", error);
                              message.error("Có lỗi xảy ra khi thay đổi trạng thái cron job");
                              // Rollback UI
                              setIsTaskActive(true);
                            })
                            .finally(() => {
                              setIsUpdatingStatus(false);
                            });
                          }
                        }}
                        disabled={selectedAccountIds.length === 0 || isUpdatingStatus}
                        loading={isUpdatingStatus}
                      />
                      <Typography.Text>
                        {isTaskActive ? "Đang hoạt động" : "Đã tắt"}
                      </Typography.Text>
                    </Space>
                  </Form.Item>

                  {isTaskActive && (
                    <>
                      <Form.Item label="Tần suất cập nhật">
                        <Row gutter={8}>
                          <Col span={customCron ? 16 : 24}>
                            <Select 
                              style={{ width: '100%' }} 
                              placeholder="Chọn tần suất cập nhật"
                              disabled={selectedAccountIds.length === 0}
                              value={selectedFrequency}
                              onChange={handleFrequencyChange}
                            >
                              <Option value="hourly">Mỗi giờ</Option>
                              <Option value="daily">Mỗi ngày</Option>
                              <Option value="weekly">Mỗi tuần</Option>
                              <Option value="monthly">Mỗi tháng</Option>
                              <Option value="custom">Tùy chỉnh</Option>
                            </Select>
                          </Col>
                          {selectedFrequency === "custom" && (
                            <Col span={8}>
                              <Form.Item label="Tùy chỉnh cron" style={{ marginBottom: 0 }}>
                                <Switch 
                                  checked={customCron} 
                                  onChange={(checked) => {
                                    setCustomCron(checked);
                                    if (!checked) {
                                      // Nếu tắt chế độ tùy chỉnh, đặt lại biểu thức cron mặc định
                                      const defaultCron = "0 0 * * *";
                                      setCronExpression(defaultCron);
                                      try {
                                        setCronDescription(cronstrue.toString(defaultCron, { verbose: true, locale: "vi" }));
                                      } catch {
                                        setCronDescription("Biểu thức cron không hợp lệ");
                                      }
                                    }
                                  }}
                                  disabled={selectedAccountIds.length === 0}
                                />
                              </Form.Item>
                            </Col>
                          )}
                        </Row>
                      </Form.Item>

                      {customCron && (
                        <Form.Item 
                          label="Biểu thức Cron" 
                          help={cronDescription}
                          tooltip="Định dạng: phút giờ ngày tháng thứ (0-59 0-23 1-31 1-12 0-7)"
                        >
                          <Input 
                            placeholder="0 0 * * *" 
                            value={cronExpression} 
                            onChange={handleCustomCronChange}
                            disabled={selectedAccountIds.length === 0}
                          />
                        </Form.Item>
                      )}
                      
                      {!customCron && selectedFrequency === "hourly" && (
                        <Form.Item label="Chạy vào phút thứ">
                          <Select
                            style={{ width: '100%' }}
                            placeholder="Chọn phút"
                            disabled={selectedAccountIds.length === 0}
                            value={cronExpression.split(' ')[0]}
                            onChange={(value) => {
                              const newCron = `${value} * * * *`;
                              setCronExpression(newCron);
                              setCronDescription(cronstrue.toString(newCron, { verbose: true, locale: "vi" }));
                            }}
                          >
                            {Array.from({ length: 60 }, (_, i) => (
                              <Option key={i} value={i.toString()}>{i}</Option>
                            ))}
                          </Select>
                        </Form.Item>
                      )}
                      
                      {!customCron && selectedFrequency === "daily" && (
                        <Form.Item label="Chạy vào lúc">
                          <Select
                            style={{ width: '100%' }}
                            placeholder="Chọn giờ"
                            disabled={selectedAccountIds.length === 0}
                            value={cronExpression.split(' ')[1]}
                            onChange={(value) => {
                              const newCron = `0 ${value} * * *`;
                              setCronExpression(newCron);
                              setCronDescription(cronstrue.toString(newCron, { verbose: true, locale: "vi" }));
                            }}
                          >
                            {Array.from({ length: 24 }, (_, i) => (
                              <Option key={i} value={i.toString()}>{`${i}:00`}</Option>
                            ))}
                          </Select>
                        </Form.Item>
                      )}
                      
                      {!customCron && selectedFrequency === "weekly" && (
                        <Row gutter={8}>
                          <Col span={12}>
                            <Form.Item label="Ngày trong tuần" name="weekDay">
                              <Select
                                style={{ width: '100%' }}
                                placeholder="Chọn ngày"
                                disabled={selectedAccountIds.length === 0}
                                value={form.getFieldValue('weekDay') || cronExpression.split(' ')[4]}
                                onChange={(value) => {
                                  const hour = form.getFieldValue('weekHour') || '0';
                                  const newCron = `0 ${hour} * * ${value}`;
                                  setCronExpression(newCron);
                                  setCronDescription(cronstrue.toString(newCron, { verbose: true, locale: "vi" }));
                                  form.setFieldsValue({ weekDay: value });
                                }}
                              >
                                <Option value="1">Thứ Hai</Option>
                                <Option value="2">Thứ Ba</Option>
                                <Option value="3">Thứ Tư</Option>
                                <Option value="4">Thứ Năm</Option>
                                <Option value="5">Thứ Sáu</Option>
                                <Option value="6">Thứ Bảy</Option>
                                <Option value="0">Chủ Nhật</Option>
                              </Select>
                            </Form.Item>
                          </Col>
                          <Col span={12}>
                            <Form.Item label="Giờ" name="weekHour">
                              <Select
                                style={{ width: '100%' }}
                                placeholder="Chọn giờ"
                                disabled={selectedAccountIds.length === 0}
                                value={form.getFieldValue('weekHour') || cronExpression.split(' ')[1]}
                                onChange={(value) => {
                                  const day = form.getFieldValue('weekDay') || '1';
                                  const newCron = `0 ${value} * * ${day}`;
                                  setCronExpression(newCron);
                                  setCronDescription(cronstrue.toString(newCron, { verbose: true, locale: "vi" }));
                                  form.setFieldsValue({ weekHour: value });
                                }}
                              >
                                {Array.from({ length: 24 }, (_, i) => (
                                  <Option key={i} value={i.toString()}>{`${i}:00`}</Option>
                                ))}
                              </Select>
                            </Form.Item>
                          </Col>
                        </Row>
                      )}
                      
                      {!customCron && selectedFrequency === "monthly" && (
                        <Row gutter={8}>
                          <Col span={12}>
                            <Form.Item label="Ngày trong tháng" name="monthDay">
                              <Select
                                style={{ width: '100%' }}
                                placeholder="Chọn ngày"
                                disabled={selectedAccountIds.length === 0}
                                value={form.getFieldValue('monthDay') || cronExpression.split(' ')[2]}
                                onChange={(value) => {
                                  const hour = form.getFieldValue('monthHour') || '0';
                                  const newCron = `0 ${hour} ${value} * *`;
                                  setCronExpression(newCron);
                                  setCronDescription(cronstrue.toString(newCron, { verbose: true, locale: "vi" }));
                                  form.setFieldsValue({ monthDay: value });
                                }}
                              >
                                {Array.from({ length: 31 }, (_, i) => (
                                  <Option key={i+1} value={(i+1).toString()}>{i+1}</Option>
                                ))}
                              </Select>
                            </Form.Item>
                          </Col>
                          <Col span={12}>
                            <Form.Item label="Giờ" name="monthHour">
                              <Select
                                style={{ width: '100%' }}
                                placeholder="Chọn giờ"
                                disabled={selectedAccountIds.length === 0}
                                value={form.getFieldValue('monthHour') || cronExpression.split(' ')[1]}
                                onChange={(value) => {
                                  const day = form.getFieldValue('monthDay') || '1';
                                  const newCron = `0 ${value} ${day} * *`;
                                  setCronExpression(newCron);
                                  setCronDescription(cronstrue.toString(newCron, { verbose: true, locale: "vi" }));
                                  form.setFieldsValue({ monthHour: value });
                                }}
                              >
                                {Array.from({ length: 24 }, (_, i) => (
                                  <Option key={i} value={i.toString()}>{`${i}:00`}</Option>
                                ))}
                              </Select>
                            </Form.Item>
                          </Col>
                        </Row>
                      )}
                      
                      <div style={{ marginTop: 8 }}>
                        <Alert
                          message={`Lịch trình: ${cronDescription}`}
                          type="info"
                          showIcon
                        />
                      </div>
                    </>
                  )}
                  
                  <Form.Item style={{ marginTop: 16 }}>
                    <Button
                      type="primary"
                      icon={<SaveOutlined />}
                      onClick={handleSaveSchedule}
                      disabled={selectedAccountIds.length === 0}
                      block
                    >
                      Lưu lịch trình
                    </Button>
                  </Form.Item>
                </Form>
              </div>
            </div>
          </Card>
        </Col>
      </Row>
    </Card>
  );
};

export default DataRetrievalCard; 