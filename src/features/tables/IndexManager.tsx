import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Table, Button, Input, Tag } from 'antd';
import { message } from '../../utils/message';
import { PlusOutlined, DeleteOutlined } from '@ant-design/icons';
import { getAdminClient, getErrorMessage } from '../../baas/adminClient';
import { confirmDelete } from '../../components/ConfirmDelete';
import IndexFormModal from './IndexFormModal';

interface Props {
  schema: string;
  table: string;
  indices: any[];
  columns: string[];
  onRefresh: () => void;
}

export default function IndexManager({ schema, table, indices, columns, onRefresh }: Props) {
  const { t } = useTranslation();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');

  const handleCreate = async (values: any) => {
    setSaving(true);
    try {
      await getAdminClient().provisioning.indices.postIndex(schema, table, values);
      message.success(t('tables.indexCreated'));
      setDrawerOpen(false);
      onRefresh();
    } catch (e: unknown) {
      message.error(getErrorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = (name: string) => {
    confirmDelete(name, async () => {
      try {
        const admin = getAdminClient();
        await admin.provisioning.indices.deleteIndex(schema, table, name);
        message.success(t('tables.indexDeleted'));
        onRefresh();
      } catch (e: unknown) {
        message.error(getErrorMessage(e));
      }
    });
  };

  return (
    <div>
      <Button icon={<PlusOutlined />} onClick={() => setDrawerOpen(true)} style={{ marginBottom: 12 }}>
        {t('tables.createIndex')}
      </Button>
      <Input.Search placeholder={t('tables.searchIndexes')} allowClear onChange={(e) => setSearch(e.target.value)} style={{ marginBottom: 12, maxWidth: 300 }} />
      <Table
        dataSource={indices.filter((r: any) => !search || [r.name, r.method].some((v: string) => (v ?? '').toLowerCase().includes(search.toLowerCase())))}
        rowKey="name"
        size="small"
        pagination={false}
        columns={[
          { title: t('common.name'), dataIndex: 'name', key: 'name',
            sorter: (a: any, b: any) => (a.name ?? '').localeCompare(b.name ?? ''),
          },
          { title: t('tables.method'), dataIndex: 'method', key: 'method',
            sorter: (a: any, b: any) => (a.method ?? '').localeCompare(b.method ?? ''),
            render: (v: string) => <Tag>{v}</Tag>,
          },
          // i18n-ignore
          { title: 'Columns', dataIndex: 'columns', key: 'columns',
            render: (v: string[]) => v?.join(', ') ?? '',
          },
          { title: t('common.actions'), key: 'actions', width: 80,
            render: (_: unknown, record: any) => (
              <Button size="small" danger icon={<DeleteOutlined />} onClick={() => handleDelete(record.name)} />
            ),
          },
        ]}
      />
      <IndexFormModal open={drawerOpen} columns={columns} onOk={handleCreate} onCancel={() => setDrawerOpen(false)} saving={saving} />
    </div>
  );
}
