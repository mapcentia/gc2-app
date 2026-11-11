// src/features/realtime/SubscriptionForm.tsx
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Input, Select, List, Space, Form, Tag } from 'antd';
import { DeleteOutlined, PlusOutlined } from '@ant-design/icons';
import { useSchemaNames, useTableSummary } from '../../hooks/useSchemaNames';
import { eventStatuses } from './eventsApi';
import type { SubscriptionRequest } from '@mapcentia/gc2-sdk';

interface Props {
  subscriptions: SubscriptionRequest[];
  onSubscribe: (sub: SubscriptionRequest) => void;
  onRemove: (id: string) => void;
}

export default function SubscriptionForm({ subscriptions, onSubscribe, onRemove }: Props) {
  const { t } = useTranslation();
  const [form] = Form.useForm();
  const [schema, setSchema] = useState<string | undefined>();

  const { data: schemasData } = useSchemaNames();
  const schemas: string[] = (schemasData?.map((s) => s.name) ?? []).sort();

  const { data: summary } = useTableSummary(schema);
  // Only show tables with events enabled (views can't have events).
  const tables: string[] = eventStatuses(summary).filter((s) => s.enabled).map((s) => s.table);

  const handleSubmit = (values: any) => {
    const sub: SubscriptionRequest = {
      id: values.id,
      schema: values.schema,
      rel: values.rel,
    };
    if (values.where) sub.where = values.where;
    if (values.columns) sub.columns = values.columns;
    if (values.op) sub.op = values.op;
    onSubscribe(sub);
    form.resetFields(['id', 'where', 'columns', 'op']);
  };

  return (
    <div>
      <Form form={form} layout="vertical" size="small" onFinish={handleSubmit}>
        <Form.Item
          name="id"
          // i18n-ignore
          label="ID"
          rules={[{ required: true, message: t('realtime.required') }]}
        >
          <Input
            // i18n-ignore
            placeholder="my-subscription"
          />
        </Form.Item>
        <Form.Item name="schema" label={t('realtime.schema')} rules={[{ required: true }]}>
          <Select
            placeholder={t('realtime.schema')}
            options={schemas?.map((s) => ({ label: s, value: s }))}
            onChange={(v) => {
              setSchema(v);
              form.setFieldValue('rel', undefined);
            }}
          />
        </Form.Item>
        <Form.Item name="rel" label={t('realtime.table')} rules={[{ required: true }]}>
          <Select
            placeholder={t('realtime.table')}
            options={tables?.map((n) => ({ label: n, value: n }))}
            disabled={!schema}
          />
        </Form.Item>
        <Form.Item name="op" label={t('realtime.operation')}>
          <Select
            placeholder={t('realtime.all')}
            allowClear
            options={[
              // i18n-ignore
              { label: 'INSERT', value: 'INSERT' },
              // i18n-ignore
              { label: 'UPDATE', value: 'UPDATE' },
              // i18n-ignore
              { label: 'DELETE', value: 'DELETE' },
            ]}
          />
        </Form.Item>
        <Form.Item name="where" label={t('realtime.where')}>
          <Input
            // i18n-ignore
            placeholder="status = 'active'"
          />
        </Form.Item>
        <Form.Item name="columns" label={t('realtime.columns')}>
          <Input
            // i18n-ignore
            placeholder="id,name,email"
          />
        </Form.Item>
        <Form.Item>
          <Button
            type="primary"
            htmlType="submit"
            icon={<PlusOutlined />}
            block
          >
            {t('realtime.subscribe')}
          </Button>
        </Form.Item>
      </Form>

      {subscriptions.length > 0 && (
        <List
          size="small"
          header={<strong style={{ fontSize: 12 }}>{t('realtime.activeSubscriptions')}</strong>}
          dataSource={subscriptions}
          renderItem={(sub) => (
            <List.Item
              style={{ padding: '4px 0' }}
              actions={[
                <Button
                  type="text"
                  size="small"
                  icon={<DeleteOutlined />}
                  danger
                  onClick={() => onRemove(sub.id)}
                />,
              ]}
            >
              <Space size={4}>
                <Tag style={{ fontSize: 11 }}>{sub.id}</Tag>
                <span style={{ fontSize: 12 }}>
                  {sub.schema}.{sub.rel}
                </span>
                {sub.op && <Tag color="blue" style={{ fontSize: 10 }}>{sub.op}</Tag>}
              </Space>
            </List.Item>
          )}
        />
      )}
    </div>
  );
}
