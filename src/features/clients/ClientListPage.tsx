import { useState } from 'react';
import { Table, Button, Space, Drawer, Form, Input, Modal, Select, Switch, Spin, Alert, Tag, Typography } from 'antd';
import { useTranslation } from 'react-i18next';
import { message } from '../../utils/message';
import { PlusOutlined, DeleteOutlined, EditOutlined, CopyOutlined } from '@ant-design/icons';
import i18n from '../../i18n';
import { getAdminClient, getErrorMessage } from '../../baas/adminClient';
import { confirmDelete } from '../../components/ConfirmDelete';
import { useQuery } from '@tanstack/react-query';
import { queryClient } from '../../data/queryClient';
import { optimisticInsert, optimisticDelete, optimisticUpdate, rollback } from '../../data/optimistic';

// ──── Shared UI ────

function ClientForm({ form, isEdit }: { form: ReturnType<typeof Form.useForm>[0]; isEdit: boolean }) {
  const { t } = useTranslation();
  return (
    <Form form={form} layout="vertical" initialValues={{ public: false, confirm: true, two_factor: true }}>
      <Form.Item
        name="id"
        label={t('clients.clientId')}
        extra={isEdit ? undefined : t('clients.autoIdHint')}
      >
        <Input disabled={isEdit} />
      </Form.Item>
      <Form.Item name="name" label={t('common.name')} rules={[{ required: true }]}>
        <Input />
      </Form.Item>
      <Form.Item name="homepage" label={t('clients.homepageUrl')}>
        <Input />
      </Form.Item>
      <Form.Item
        name="redirect_uri"
        label={t('clients.redirectUris')}
        extra={t('clients.redirectHint')}
      >
        <Select
          mode="tags"
          open={false}
          suffixIcon={null}
          tokenSeparators={[',', ' ']}
          // i18n-ignore
          placeholder="https://app.example.com/callback"
        />
      </Form.Item>
      <Form.Item name="public" label={t('clients.publicClient')} valuePropName="checked">
        <Switch />
      </Form.Item>
      <Form.Item name="confirm" label={t('clients.requireConfirmation')} valuePropName="checked">
        <Switch />
      </Form.Item>
      <Form.Item name="two_factor" label={t('clients.twoFactor')} valuePropName="checked">
        <Switch />
      </Form.Item>
    </Form>
  );
}

function clientColumns(onEdit: (r: any) => void, onDelete: (id: string) => void) {
  return [
    { title: i18n.t('clients.colId'), dataIndex: 'id', key: 'id',
      sorter: (a: any, b: any) => (a.id ?? '').localeCompare(b.id ?? ''),
    },
    { title: i18n.t('common.name'), dataIndex: 'name', key: 'name',
      sorter: (a: any, b: any) => (a.name ?? '').localeCompare(b.name ?? ''),
    },
    { title: i18n.t('clients.colHomepage'), dataIndex: 'homepage', key: 'homepage' },
    { title: i18n.t('clients.colPublic'), dataIndex: 'public', key: 'public',
      render: (v: boolean) => v ? <Tag color="green">{i18n.t('common.yes')}</Tag> : <Tag>{i18n.t('common.no')}</Tag>,
    },
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

/**
 * One-time display of a newly created client's secret. The API returns it
 * only on creation; once this dialog is closed it cannot be shown again.
 */
function SecretModal({ secret, onClose }: { secret: string | null; onClose: () => void }) {
  const { t } = useTranslation();
  return (
    <Modal
      title={t('clients.secretTitle')}
      open={secret !== null}
      onCancel={onClose}
      maskClosable={false}
      footer={
        <Button type="primary" onClick={onClose}>
          {t('clients.secretStored')}
        </Button>
      }
    >
      <Space direction="vertical" style={{ width: '100%' }}>
        <Alert
          type="warning"
          showIcon
          message={t('clients.secretWarning')}
        />
        <Space.Compact style={{ width: '100%' }}>
          <Input readOnly value={secret ?? ''} style={{ fontFamily: 'monospace' }} />
          <Button
            icon={<CopyOutlined />}
            onClick={async () => {
              await navigator.clipboard.writeText(secret ?? '');
              message.success(t('clients.secretCopied'));
            }}
          >
            {t('common.copy')}
          </Button>
        </Space.Compact>
        <Typography.Text type="secondary">
          {t('clients.secretUse')}
        </Typography.Text>
      </Space>
    </Modal>
  );
}

function parseRedirectUris(values: any) {
  // The tags Select yields a string[]; tolerate a legacy comma-separated string.
  if (typeof values.redirect_uri === 'string') {
    values.redirect_uri = values.redirect_uri.split(',').map((s: string) => s.trim()).filter(Boolean);
  }
  // Wire contract: always an array; [] means "no redirect URIs" (clears on edit).
  values.redirect_uri = (values.redirect_uri ?? []).map((s: string) => s.trim()).filter(Boolean);
  return values;
}

// ──── Page ────

export default function ClientListPage() {
  const { t } = useTranslation();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [editClient, setEditClient] = useState<any>(null);
  const [createdSecret, setCreatedSecret] = useState<string | null>(null);
  const [form] = Form.useForm();

  const { data, isLoading, error } = useQuery({
    queryKey: ['clients'],
    queryFn: async () => {
      return await getAdminClient().provisioning.clients.getClient();
    },
    staleTime: 30_000,
  });

  const clients = data ?? [];

  const handleSave = async () => {
    const values = parseRedirectUris(await form.validateFields());
    const isEdit = !!editClient;
    // An omitted id is auto-generated by the server; never send an empty string.
    if (!values.id) delete values.id;
    setSaving(true);
    try {
      if (isEdit) {
        await getAdminClient().provisioning.clients.patchClient(editClient.id, values);
      } else {
        const created = await getAdminClient().provisioning.clients.postClient(values);
        // The secret exists only in this response — surface it once, never store it.
        if (created?.secret) setCreatedSecret(created.secret);
      }
      message.success(isEdit ? t('clients.updated') : t('clients.created'));
      queryClient.invalidateQueries({ queryKey: ['clients'] });
      form.resetFields();
      setDrawerOpen(false);
      setEditClient(null);
    } catch (e: unknown) {
      message.error(getErrorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = (id: string) => {
    confirmDelete(id, async () => {
      const ctx = optimisticDelete(['clients'], 'id', id);
      try {
        await getAdminClient().provisioning.clients.deleteClient(id);
        message.success(t('clients.deleted'));
        queryClient.invalidateQueries({ queryKey: ['clients'] });
      } catch (e: unknown) {
        rollback(ctx);
        message.error(getErrorMessage(e));
      }
    });
  };

  const handleEdit = (record: any) => {
    setEditClient(record);
    form.setFieldsValue({
      ...record,
      redirect_uri: record.redirect_uri ?? [],
    });
    setDrawerOpen(true);
  };

  if (isLoading) return <Spin />;
  if (error) return <Alert type="error" message={String(error)} />;

  return (
    <div>
      <Space style={{ marginBottom: 16, justifyContent: 'space-between', width: '100%' }}>
        {/* i18n-ignore */}
        <h2>OAuth Clients</h2>
        <Space>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => { setEditClient(null); form.resetFields(); setDrawerOpen(true); }}>
            {t('clients.newClient')}
          </Button>
        </Space>
      </Space>
      <Input.Search placeholder={t('clients.search')} allowClear onChange={(e) => setSearch(e.target.value)} style={{ marginBottom: 12, maxWidth: 300 }} />
      <Table dataSource={(clients as any[]).filter((r) => !search || [r.id, r.name].some((v) => (v ?? '').toLowerCase().includes(search.toLowerCase())))} rowKey="id" size="small" pagination={false} columns={clientColumns(handleEdit, handleDelete)} />
      <Drawer title={editClient ? t('clients.editTitle') : t('clients.createTitle')} open={drawerOpen}
        onClose={() => { setDrawerOpen(false); setEditClient(null); }} width={520}
        extra={<Button type="primary" onClick={handleSave} loading={saving}>{t('common.save')}</Button>}>
        <ClientForm form={form} isEdit={!!editClient} />
      </Drawer>
      <SecretModal secret={createdSecret} onClose={() => setCreatedSecret(null)} />
    </div>
  );
}
