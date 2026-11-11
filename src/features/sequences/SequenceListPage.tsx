import { useState } from 'react';
import { Table, Button, Space, Drawer, Form, Input, Select, Spin, Alert } from 'antd';
import { useTranslation } from 'react-i18next';
import { message } from '../../utils/message';

import { PlusOutlined, DeleteOutlined } from '@ant-design/icons';
import { getAdminClient, getErrorMessage } from '../../baas/adminClient';
import { confirmDelete } from '../../components/ConfirmDelete';
import { useQuery } from '@tanstack/react-query';
import { queryClient } from '../../data/queryClient';
import { optimisticInsert, optimisticDelete, rollback } from '../../data/optimistic';
import { useSchemaNames } from '../../hooks/useSchemaNames';

export default function SequenceListPage() {
  const { t } = useTranslation();
  const [schema, setSchema] = useState<string>('');
  const [createOpen, setCreateOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [form] = Form.useForm();

  const { data: schemaData, isLoading: schemasLoading } = useSchemaNames();

  const schemas: string[] = schemaData?.map((s) => s.name) ?? [];

  const { data, isLoading, error } = useQuery({
    queryKey: ['sequences', schema],
    queryFn: async () => {
      return await getAdminClient().provisioning.sequences.getSequence(schema);
    },
    staleTime: 30_000,
    enabled: !!schema,
  });

  const sequences = data ?? [];

  const handleCreate = async () => {
    const values = await form.validateFields();
    setSaving(true);
    try {
      await getAdminClient().provisioning.sequences.postSequence(schema, values);
      message.success(t('sequences.created'));
      queryClient.invalidateQueries({ queryKey: ['sequences', schema] });
      form.resetFields();
      setCreateOpen(false);
    } catch (e: unknown) {
      message.error(getErrorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = (name: string) => {
    confirmDelete(name, async () => {
      const ctx = optimisticDelete(['sequences', schema], 'name', name);
      try {
        await getAdminClient().provisioning.sequences.deleteSequence(schema, name);
        message.success(t('sequences.deleted'));
        queryClient.invalidateQueries({ queryKey: ['sequences', schema] });
      } catch (e: unknown) {
        rollback(ctx);
        message.error(getErrorMessage(e));
      }
    });
  };

  return (
    <div>
      {/* i18n-ignore */}
      <h2>Sequences</h2>
      <Space style={{ marginBottom: 16 }}>
        <Select
          placeholder={t('sequences.selectSchema')}
          value={schema || undefined}
          onChange={setSchema}
          options={schemas.map((s) => ({ label: s, value: s }))}
          style={{ width: 200 }}
          loading={schemasLoading}
        />
        {schema && (
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>
            {t('sequences.newSequence')}
          </Button>
        )}
      </Space>
      {isLoading && schema ? <Spin /> : error ? <Alert type="error" message={String(error)} /> : (
        <>
        <Input.Search placeholder={t('sequences.search')} allowClear onChange={(e) => setSearch(e.target.value)} style={{ marginBottom: 12, maxWidth: 300 }} />
        <Table
          dataSource={(sequences as any[]).filter((r) => !search || (r.name ?? '').toLowerCase().includes(search.toLowerCase()))}
          rowKey="name"
          size="small"
          pagination={false}
          columns={[
            { title: t('common.name'), dataIndex: 'name', key: 'name',
              sorter: (a: any, b: any) => (a.name ?? '').localeCompare(b.name ?? ''),
            },
            { title: t('sequences.dataType'), dataIndex: 'data_type', key: 'data_type',
              sorter: (a: any, b: any) => (a.data_type ?? '').localeCompare(b.data_type ?? ''),
            },
            { title: t('sequences.colStart'), dataIndex: 'start_value', key: 'start' },
            { title: t('sequences.colIncrement'), dataIndex: 'increment_by', key: 'increment' },
            { title: t('common.actions'), key: 'actions', width: 80,
              render: (_: unknown, record: any) => (
                <Button size="small" danger icon={<DeleteOutlined />} onClick={() => handleDelete(record.name)} />
              ),
            },
          ]}
        />
        </>
      )}
      <Drawer title={t('sequences.createTitle')} open={createOpen} onClose={() => setCreateOpen(false)} width={400}
        extra={<Button type="primary" onClick={handleCreate} loading={saving}>{t('common.save')}</Button>}>
        <Form form={form} layout="vertical" initialValues={{ data_type: 'bigint', increment_by: 1 }}>
          <Form.Item name="name" label={t('common.name')} rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="data_type" label={t('sequences.dataType')}>
            <Select options={[
              // i18n-ignore
              { label: 'smallint', value: 'smallint' },
              // i18n-ignore
              { label: 'integer', value: 'integer' },
              // i18n-ignore
              { label: 'bigint', value: 'bigint' },
            ]} />
          </Form.Item>
          <Form.Item name="start_value" label={t('sequences.startValue')}>
            <Input type="number" />
          </Form.Item>
          <Form.Item name="increment_by" label={t('sequences.incrementBy')}>
            <Input type="number" />
          </Form.Item>
        </Form>
      </Drawer>
    </div>
  );
}
