import { useState } from 'react';
import { Table, Button, Space, Drawer, Form, Input, InputNumber, Select, Spin, Alert, Tag } from 'antd';
import { useTranslation } from 'react-i18next';
import { message } from '../../utils/message';
import { PlusOutlined, DeleteOutlined, EditOutlined } from '@ant-design/icons';
import i18n from '../../i18n';
import { getAdminClient, getErrorMessage } from '../../baas/adminClient';
import { confirmDelete } from '../../components/ConfirmDelete';
import { useQuery } from '@tanstack/react-query';
import { queryClient } from '../../data/queryClient';
import { optimisticInsert, optimisticDelete, optimisticUpdate, rollback } from '../../data/optimistic';

// ──── Shared UI ────

function RuleForm({ form }: { form: ReturnType<typeof Form.useForm>[0] }) {
  const { t } = useTranslation();
  return (
    <Form form={form} layout="vertical" initialValues={{ access: 'allow', priority: 0 }}>
      <Form.Item name="access" label={t('rules.access')} rules={[{ required: true }]}>
        <Select options={[
          // i18n-ignore
          { label: 'Allow', value: 'allow' },
          // i18n-ignore
          { label: 'Limit', value: 'limit' },
          // i18n-ignore
          { label: 'Deny', value: 'deny' },
        ]} />
      </Form.Item>
      <Form.Item name="priority" label={t('rules.priority')}>
        <InputNumber style={{ width: '100%' }} />
      </Form.Item>
      <Form.Item name="service" label={t('rules.service')}>
        <Select allowClear options={[
          // i18n-ignore
          { label: 'SQL', value: 'sql' },
          // i18n-ignore
          { label: 'OWS', value: 'ows' },
          // i18n-ignore
          { label: 'WFS-T', value: 'wfst' },
        ]} />
      </Form.Item>
      <Form.Item name="request" label={t('rules.request')}>
        <Select allowClear options={[
          // i18n-ignore
          { label: 'SELECT', value: 'select' },
          // i18n-ignore
          { label: 'INSERT', value: 'insert' },
          // i18n-ignore
          { label: 'UPDATE', value: 'update' },
          // i18n-ignore
          { label: 'DELETE', value: 'delete' },
        ]} />
      </Form.Item>
      <Form.Item name="schema" label={t('rules.schema')}>
        <Input />
      </Form.Item>
      <Form.Item name="table" label={t('rules.table')}>
        <Input />
      </Form.Item>
      <Form.Item name="username" label={t('rules.username')}>
        <Input />
      </Form.Item>
      <Form.Item name="iprange" label={t('rules.ipRange')}>
        <Input placeholder={t('rules.ipRangeExample')} />
      </Form.Item>
      <Form.Item name="filter" label={t('rules.filter')}>
        <Input.TextArea rows={2} placeholder={t('rules.filterPlaceholder')} />
      </Form.Item>
    </Form>
  );
}

function ruleColumns(onEdit: (r: any) => void, onDelete: (id: number) => void) {
  return [
    { title: i18n.t('rules.colId'), dataIndex: 'id', key: 'id', width: 60,
      sorter: (a: any, b: any) => (a.id ?? 0) - (b.id ?? 0),
    },
    { title: i18n.t('rules.priority'), dataIndex: 'priority', key: 'priority', width: 80,
      sorter: (a: any, b: any) => (a.priority ?? 0) - (b.priority ?? 0),
    },
    { title: i18n.t('rules.access'), dataIndex: 'access', key: 'access',
      sorter: (a: any, b: any) => (a.access ?? '').localeCompare(b.access ?? ''),
      render: (v: string) => (
        <Tag color={v === 'allow' ? 'green' : v === 'deny' ? 'red' : 'orange'}>{v}</Tag>
      ),
    },
    { title: i18n.t('rules.service'), dataIndex: 'service', key: 'service',
      sorter: (a: any, b: any) => (a.service ?? '').localeCompare(b.service ?? ''),
    },
    { title: i18n.t('rules.request'), dataIndex: 'request', key: 'request' },
    { title: i18n.t('rules.schema'), dataIndex: 'schema', key: 'schema' },
    { title: i18n.t('rules.table'), dataIndex: 'table', key: 'table' },
    { title: i18n.t('rules.username'), dataIndex: 'username', key: 'username' },
    { title: i18n.t('common.actions'), key: 'actions', width: 120,
      render: (_: unknown, record: any) => (
        <Space>
          <Button size="small" icon={<EditOutlined />} onClick={() => onEdit(record)} />
          <Button size="small" danger icon={<DeleteOutlined />} onClick={() => onDelete(record.id)} />
        </Space>
      ),
    },
  ];
}

// ──── Page ────

export default function RuleListPage() {
  const { t } = useTranslation();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [editRule, setEditRule] = useState<any>(null);
  const [form] = Form.useForm();

  const { data, isLoading, error } = useQuery({
    queryKey: ['rules'],
    queryFn: async () => {
      return await getAdminClient().provisioning.rules.getRule();
    },
    staleTime: 30_000,
  });

  const rules = data ?? [];

  const handleSave = async () => {
    const values = await form.validateFields();
    const isEdit = !!editRule;
    setSaving(true);
    try {
      if (isEdit) {
        await getAdminClient().provisioning.rules.patchRule(editRule.id, values);
      } else {
        await getAdminClient().provisioning.rules.postRule(values);
      }
      message.success(isEdit ? t('rules.updated') : t('rules.created'));
      queryClient.invalidateQueries({ queryKey: ['rules'] });
      form.resetFields();
      setDrawerOpen(false);
      setEditRule(null);
    } catch (e: unknown) {
      message.error(getErrorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = (id: number) => {
    confirmDelete(t('rules.ruleName', { id }), async () => {
      const ctx = optimisticDelete(['rules'], 'id', id);
      try {
        await getAdminClient().provisioning.rules.deleteRule(id);
        message.success(t('rules.deleted'));
        queryClient.invalidateQueries({ queryKey: ['rules'] });
      } catch (e: unknown) {
        rollback(ctx);
        message.error(getErrorMessage(e));
      }
    });
  };

  const handleEdit = (record: any) => {
    setEditRule(record);
    form.setFieldsValue(record);
    setDrawerOpen(true);
  };

  if (isLoading) return <Spin />;
  if (error) return <Alert type="error" message={String(error)} />;

  return (
    <div>
      <Space style={{ marginBottom: 16, justifyContent: 'space-between', width: '100%' }}>
        {/* i18n-ignore */}
        <h2>Access Rules</h2>
        <Space>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => { setEditRule(null); form.resetFields(); setDrawerOpen(true); }}>
            {t('rules.newRule')}
          </Button>
        </Space>
      </Space>
      <Input.Search placeholder={t('rules.search')} allowClear onChange={(e) => setSearch(e.target.value)} style={{ marginBottom: 12, maxWidth: 300 }} />
      <Table dataSource={(rules as any[]).filter((r) => !search || [r.access, r.service, r.schema, r.table, r.username].some((v) => (v ?? '').toLowerCase().includes(search.toLowerCase())))} rowKey="id" size="small" pagination={false} columns={ruleColumns(handleEdit, handleDelete)} />
      <Drawer title={editRule ? t('rules.editTitle') : t('rules.createTitle')} open={drawerOpen}
        onClose={() => { setDrawerOpen(false); setEditRule(null); }} width={520}
        extra={<Button type="primary" onClick={handleSave} loading={saving}>{t('common.save')}</Button>}>
        <RuleForm form={form} />
      </Drawer>
    </div>
  );
}
