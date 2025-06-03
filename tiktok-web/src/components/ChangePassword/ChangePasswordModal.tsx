import React from 'react';
import { Modal } from 'antd';
import ChangePasswordForm from './ChangePasswordForm';

interface ChangePasswordModalProps {
  open: boolean;
  onClose: () => void;
}

const ChangePasswordModal: React.FC<ChangePasswordModalProps> = ({ open, onClose }) => {
  return (
    <Modal
      title="Đổi mật khẩu"
      open={open}
      onCancel={onClose}
      footer={null}
      width={520}
      destroyOnHidden
    >
      <ChangePasswordForm onSuccess={onClose} />
    </Modal>
  );
};

export default ChangePasswordModal; 