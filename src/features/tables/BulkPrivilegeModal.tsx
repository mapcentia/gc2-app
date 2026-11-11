import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal, Select, Segmented, Spin, Space, Typography } from 'antd';
import { message } from '../../utils/message';
import { getAdminClient, getErrorMessage } from '../../baas/adminClient';
import type { UserInfo } from '@mapcentia/gc2-sdk';

type Level = 'none' | 'read' | 'write';

interface BulkPrivilegeModalProps {
  open: boolean;
  schema: string;
  tables: string[];
  onClose: () => void;
  onApplied: () => void;
}

export default function BulkPrivilegeModal({ open, schema, tables, onClose, onApplied }: BulkPrivilegeModalProps) {
  const { t } = useTranslation();
  const [users, setUsers] = useState<string[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [selectedUsers, setSelectedUsers] = useState<string[]>([]);
  const [level, setLevel] = useState<Level>('read');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoadingUsers(true);
    getAdminClient().provisioning.users.getUser()
      .then((res) => {
        const list = Array.isArray(res) ? res : [];
        setUsers(list.map((u: UserInfo) => u.name).filter(Boolean));
      })
      .catch((e) => message.error(getErrorMessage(e)))
      .finally(() => setLoadingUsers(false));
  }, [open]);

  const reset = () => {
    setSelectedUsers([]);
    setLevel('read');
  };

  const handleCancel = () => {
    reset();
    onClose();
  };

  const handleApply = async () => {
    if (!selectedUsers.length) return;
    setSaving(true);
    const body = selectedUsers.map((subuser) => ({ subuser, privilege: level }));
    const admin = getAdminClient();
    const results = await Promise.allSettled(
      tables.map((table) => admin.provisioning.privileges.patchPrivileges(schema, table, body)),
    );
    const failed = tables.filter((_, i) => results[i].status === 'rejected');
    const ok = tables.length - failed.length;
    setSaving(false);
    if (ok > 0) message.success(t('tables.privilegesUpdated', { count: ok }));
    if (failed.length) message.error(t('tables.tablesFailed', { count: failed.length, names: failed.join(', ') }));
    if (ok > 0) {
      reset();
      onApplied();
      onClose();
    }
  };

  return (
    <Modal
      title={t('tables.editPrivilegesTitle', { count: tables.length })}
      open={open}
      onCancel={handleCancel}
      onOk={handleApply}
      okText={t('tables.applyToTables', { count: tables.length })}
      okButtonProps={{ disabled: !selectedUsers.length, loading: saving }}
      destroyOnClose
    >
      {loadingUsers ? (
        <Spin />
      ) : (
        <Space direction="vertical" style={{ width: '100%' }} size="middle">
          <div>
            <Typography.Text>{t('tables.users')}</Typography.Text>
            <Select
              mode="multiple"
              allowClear
              style={{ width: '100%' }}
              placeholder={t('tables.selectUsers')}
              value={selectedUsers}
              onChange={setSelectedUsers}
              options={users.map((u) => ({ label: u, value: u }))}
            />
          </div>
          <div>
            <Typography.Text>{t('tables.privilege')}</Typography.Text>
            <div>
              <Segmented options={['none', 'read', 'write']} value={level} onChange={(v) => setLevel(v as Level)} />
            </div>
          </div>
        </Space>
      )}
    </Modal>
  );
}
