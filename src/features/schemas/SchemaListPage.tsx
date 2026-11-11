import { useState } from 'react';
import { Table, Button, Space, Input, Drawer, Form, Spin, Alert } from 'antd';
import { message } from '../../utils/message';
import { PlusOutlined, DeleteOutlined, EditOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { getAdminClient, getErrorMessage } from '../../baas/adminClient';
import { confirmDelete } from '../../components/ConfirmDelete';
import { schemaCollection, type SchemaItem } from '../../data/collections/schemas';
import { useLiveQuery } from '@tanstack/react-db';
import { useSchemaNames, SCHEMAS_KEY, tableSummaryKey } from '../../hooks/useSchemaNames';
import { queryClient } from '../../data/queryClient';

export default function SchemaListPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [createOpen, setCreateOpen] = useState(false);
  const [renameOpen, setRenameOpen] = useState(false);
  const [renameTarget, setRenameTarget] = useState('');
  const [form] = Form.useForm();
  const [renameForm] = Form.useForm();

  const result = useLiveQuery((q) =>
    q.from({ s: schemaCollection }),
  );

  // Subscribe to the backing query to get loading state
  const { isLoading } = useSchemaNames();

  const schemas: SchemaItem[] = (result?.data as SchemaItem[] | undefined) ?? [];

  const tableData = schemas.map((s) => ({
    name: s.name,
    tableCount: s._table_count ?? 0,
  }));

  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');

  const handleCreate = async () => {
    const values = await form.validateFields();
    setSaving(true);
    try {
      schemaCollection.insert({ name: values.name, _table_count: 0 });
      message.success(t('schemas.created', { name: values.name }));
      form.resetFields();
      setCreateOpen(false);
    } catch (e: unknown) {
      message.error(getErrorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  const handleRename = async () => {
    const values = await renameForm.validateFields();
    setSaving(true);
    try {
      await getAdminClient().provisioning.schemas.patchSchema(renameTarget, { name: values.name });
      message.success(t('schemas.renamed', { name: values.name }));
      renameForm.resetFields();
      setRenameOpen(false);
      queryClient.invalidateQueries({ queryKey: SCHEMAS_KEY });
      queryClient.invalidateQueries({ queryKey: tableSummaryKey(renameTarget) });
    } catch (e: unknown) {
      message.error(getErrorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = (name: string) => {
    confirmDelete(name, async () => {
      try {
        schemaCollection.delete(name);
        message.success(t('schemas.deleted', { name }));
      } catch (e: unknown) {
        message.error(getErrorMessage(e));
      }
    });
  };

  if (isLoading) return <Spin />;

  return (
    <div>
      <Space style={{ marginBottom: 16, justifyContent: 'space-between', width: '100%' }}>
        {/* i18n-ignore */}
        <h2>Schemas</h2>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>
          {t('schemas.newSchema')}
        </Button>
      </Space>
      <Input.Search placeholder={t('schemas.search')} allowClear onChange={(e) => setSearch(e.target.value)} style={{ marginBottom: 12, maxWidth: 300 }} />
      <Table
        dataSource={tableData.filter((r) => !search || r.name.toLowerCase().includes(search.toLowerCase()))}
        rowKey="name"
        pagination={false}
        columns={[
          { title: t('common.name'), dataIndex: 'name', key: 'name',
            sorter: (a, b) => a.name.localeCompare(b.name),
            render: (name: string) => <a onClick={() => navigate(`/schemas/${name}`)}>{name}</a>,
          },
          { title: t('schemas.colTables'), dataIndex: 'tableCount', key: 'tableCount',
            sorter: (a, b) => a.tableCount - b.tableCount,
          },
          { title: t('common.actions'), key: 'actions', width: 150,
            render: (_: unknown, record: any) => (
              <Space>
                <Button size="small" icon={<EditOutlined />} onClick={() => {
                  setRenameTarget(record.name);
                  renameForm.setFieldsValue({ name: record.name });
                  setRenameOpen(true);
                }} />
                <Button size="small" danger icon={<DeleteOutlined />} onClick={() => handleDelete(record.name)} />
              </Space>
            ),
          },
        ]}
      />
      <Drawer title={t('schemas.createTitle')} open={createOpen} onClose={() => setCreateOpen(false)} width={400}
        extra={<Button type="primary" onClick={handleCreate} loading={saving}>{t('common.save')}</Button>}>
        <Form form={form} layout="vertical">
          <Form.Item name="name" label={t('schemas.schemaName')} rules={[{ required: true }]}>
            <Input />
          </Form.Item>
        </Form>
      </Drawer>
      <Drawer title={t('schemas.renameTitle')} open={renameOpen} onClose={() => setRenameOpen(false)} width={400}
        extra={<Button type="primary" onClick={handleRename} loading={saving}>{t('common.save')}</Button>}>
        <Form form={renameForm} layout="vertical">
          <Form.Item name="name" label={t('schemas.newName')} rules={[{ required: true }]}>
            <Input />
          </Form.Item>
        </Form>
      </Drawer>
    </div>
  );
}
