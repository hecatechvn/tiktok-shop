import React from "react";
import {
  Table,
  Space,
  Button,
  Popconfirm,
  Typography,
  Tag,
  Tooltip,
  ConfigProvider,
  Badge,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import {
  EditOutlined,
  DeleteOutlined,
  QuestionCircleOutlined,
  KeyOutlined,
  CodeOutlined,
  FileOutlined,
  ShopOutlined,
  ClockCircleOutlined,
} from "@ant-design/icons";
import { TikTokAccount, PaginationType } from "../../types/tikTokTypes";
import dayjs from "dayjs";

const { Text } = Typography;

interface AccountsTableProps {
  accounts: TikTokAccount[];
  isMobile: boolean;
  pagination: PaginationType;
  setPagination: (pagination: PaginationType) => void;
  toggleStatus: (id: string) => void;
  showModal: (account?: TikTokAccount) => void;
  handleDelete: (id: string) => void;
  isLoading: boolean;
}

const AccountsTable: React.FC<AccountsTableProps> = ({
  accounts,
  isMobile,
  pagination,
  setPagination,
  toggleStatus,
  showModal,
  handleDelete,
  isLoading,
}) => {
  // Define responsive columns for the table
  const getColumns = (): ColumnsType<TikTokAccount> => {
    return [
      {
        title: "Tên Shop",
        key: "shopName",
        render: (_, record) => {
          const shopName = record.shopCipher?.[0]?.name || "Chưa có thông tin";
          return (
            <div>
              <Text strong>{shopName}</Text>
              {record.shopCipher && record.shopCipher.length > 0 && (
                <div>
                  <Badge 
                    count={record.shopCipher.length} 
                    size="small" 
                    style={{ backgroundColor: '#52c41a' }}
                  />
                  <Text type="secondary" style={{ marginLeft: 8 }}>
                    <ShopOutlined /> {record.shopCipher.length > 1 ? 'shops' : 'shop'}
                  </Text>
                </div>
              )}
            </div>
          );
        },
      },
      {
        title: "App Key",
        dataIndex: "appKey",
        key: "appKey",
        render: (text: string) => (
          <Tooltip title={text}>
            <Text ellipsis style={{ maxWidth: isMobile ? 80 : 150 }}>
              {text}
            </Text>
          </Tooltip>
        ),
        responsive: ["md"],
      },
      {
        title: "App Secret",
        dataIndex: "appSecret",
        key: "appSecret",
        render: () => (
          <Text type="secondary">
            <KeyOutlined /> ********
          </Text>
        ),
        responsive: ["lg"],
      },
      {
        title: "Auth Code",
        dataIndex: "authCode",
        key: "authCode",
        render: () => (
          <Text type="secondary">
            <CodeOutlined /> ********
          </Text>
        ),
        responsive: ["lg"],
      },
      {
        title: "Google Sheet",
        dataIndex: "sheets",
        key: "sheets",
        render: (link: string) =>
          link ? (
            <Button
              type="link"
              href={link}
              target="_blank"
              icon={<FileOutlined />}
              size="small"
            >
              Xem Sheet
            </Button>
          ) : (
            <Text type="secondary">Chưa có</Text>
          ),
      },
      {
        title: "Lịch chạy",
        key: "cronExpression",
        render: (_, record) => (
          <Tooltip title={`Chạy lần cuối: ${record.task?.lastRun ? dayjs(record.task.lastRun).format('DD/MM/YYYY HH:mm') : 'Chưa chạy'}`}>
            <Space direction="vertical" size={0}>
              <Text>
                <ClockCircleOutlined /> {record.task?.cronExpression || "0 0 * * *"}
              </Text>
              <Tag color={record.task?.isActive ? "processing" : "default"}>
                {record.task?.isActive ? "Đang chạy" : "Đã tắt"}
              </Tag>
            </Space>
          </Tooltip>
        ),
        responsive: ["md"],
      },
      {
        title: "Trạng thái",
        key: "status",
        dataIndex: "status",
        render: (status: boolean, record: TikTokAccount) => (
          <Tag
            color={record.task?.isActive ? "success" : "default"}
            style={{ cursor: "pointer" }}
            onClick={() => toggleStatus(record._id || "")}
          >
            {record.task?.isActive ? "Đang chạy cron" : "Đã tắt cron"}
          </Tag>
        ),
      },
      {
        title: "Thao tác",
        key: "action",
        render: (_: unknown, record: TikTokAccount) => (
          <Space size="middle">
            <Button
              type="text"
              icon={<EditOutlined />}
              onClick={() => showModal(record)}
            />
            <Popconfirm
              title="Bạn có chắc chắn muốn xóa tài khoản này?"
              onConfirm={() => handleDelete(record._id || "")}
              okText="Có"
              cancelText="Không"
              icon={<QuestionCircleOutlined style={{ color: "red" }} />}
            >
              <Button type="text" danger icon={<DeleteOutlined />} />
            </Popconfirm>
          </Space>
        ),
      },
    ];
  };

  return (
    <ConfigProvider componentSize={isMobile ? "small" : "middle"}>
      <div className="table-responsive" style={{ overflowX: "auto" }}>
        <Table
          columns={getColumns()}
          dataSource={accounts}
          rowKey="_id"
          pagination={{
            position: ["bottomCenter"],
            current: pagination.current,
            pageSize: pagination.pageSize,
            total: accounts.length,
            showSizeChanger: true,
            pageSizeOptions: ["5", "10", "20"],
            showTotal: (total) => `Tổng ${total} tài khoản`,
            onChange: (page, pageSize) => {
              setPagination({
                ...pagination,
                current: page,
                pageSize: pageSize,
              });
            },
          }}
          bordered
          style={{ marginBottom: 24 }}
          scroll={{ x: "max-content" }}
          size={isMobile ? "small" : "middle"}
          loading={isLoading}
        />
      </div>
    </ConfigProvider>
  );
};

export default AccountsTable; 