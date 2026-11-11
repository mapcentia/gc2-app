import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams, useNavigate } from 'react-router-dom';
import { Form, Input, InputNumber, Select, Button, Space, Spin, Upload } from 'antd';
import { message } from '../../utils/message';
import { ArrowLeftOutlined, UploadOutlined } from '@ant-design/icons';
import { getAdminClient, getErrorMessage } from '../../baas/adminClient';
import type { CreateFunctionRequest, FunctionInfo, FunctionTriggers } from '@mapcentia/gc2-sdk';
import { queryClient } from '../../data/queryClient';
import CodeEditor from '../../components/CodeEditor';

interface FormValues {
  name: string;
  runtime: 'nodejs20' | 'python312';
  handler: string;
  package: 'inline' | 'zip';
  memory_mb: number;
  timeout_s: number;
  schedule?: string;
  eventTable?: string;
  eventOps?: ('insert' | 'update' | 'delete')[];
}

function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '');
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export default function FunctionFormPage() {
  const { t } = useTranslation();
  const { name } = useParams<{ name: string }>();
  const navigate = useNavigate();
  const isNew = name === 'new';
  const [form] = Form.useForm<FormValues>();
  const [code, setCode] = useState('');
  const [env, setEnv] = useState('{}');
  const [pkg, setPkg] = useState<'inline' | 'zip'>('inline');
  const [loading, setLoading] = useState(!isNew);

  useEffect(() => {
    if (!isNew && name) {
      getAdminClient().provisioning.functions.getFunctions(name)
        .then((d) => {
          const f = (Array.isArray(d) ? d[0] : d) as FunctionInfo;
          setPkg(f.package ?? 'inline');
          form.setFieldsValue({
            name: f.name,
            runtime: f.runtime,
            handler: f.handler,
            package: f.package ?? 'inline',
            memory_mb: f.memory_mb ?? 128,
            timeout_s: f.timeout_s ?? 30,
            schedule: f.triggers?.schedule,
            eventTable: f.triggers?.event?.table,
            eventOps: f.triggers?.event?.on,
          });
          setCode(f.code ?? '');
          if (f.env) setEnv(JSON.stringify(f.env, null, 2));
        })
        .finally(() => setLoading(false));
    }
  }, [name, isNew, form]);

  const handleSave = async () => {
    const values = await form.validateFields();

    let parsedEnv: Record<string, string> | undefined;
    try {
      const e = JSON.parse(env || '{}');
      if (Object.keys(e).length > 0) parsedEnv = e;
    } catch {
      message.error(t('functions.envInvalid'));
      return;
    }

    const triggers: FunctionTriggers = {};
    if (values.schedule) triggers.schedule = values.schedule;
    if (values.eventTable) triggers.event = { table: values.eventTable, on: values.eventOps };

    const payload: Partial<CreateFunctionRequest> = {
      runtime: values.runtime,
      handler: values.handler,
      package: values.package,
      code,
      memory_mb: values.memory_mb,
      timeout_s: values.timeout_s,
      ...(parsedEnv && { env: parsedEnv }),
      ...(Object.keys(triggers).length > 0 && { triggers }),
    };

    try {
      const fns = getAdminClient().provisioning.functions;
      if (isNew) {
        await fns.postFunction({ name: values.name, ...payload } as CreateFunctionRequest);
      } else {
        await fns.patchFunction(name!, payload);
      }
      message.success(isNew ? t('functions.created') : t('functions.updated'));
      queryClient.invalidateQueries({ queryKey: ['functions'] });
      navigate('/functions');
    } catch (e: unknown) {
      message.error(getErrorMessage(e));
    }
  };

  if (loading) return <Spin />;

  return (
    <div>
      <Button type="text" icon={<ArrowLeftOutlined />} onClick={() => navigate('/functions')} style={{ marginBottom: 8 }}>
        {/* i18n-ignore */}
        Functions
      </Button>
      <h2>{isNew ? t('functions.newFunction') : t('functions.editTitle', { name })}</h2>
      <Form form={form} layout="vertical" style={{ maxWidth: 820 }}
        initialValues={{ runtime: 'nodejs20', handler: 'index.handler', package: 'inline', memory_mb: 128, timeout_s: 30 }}>
        <Space size="large" style={{ width: '100%' }} align="start">
          <Form.Item name="name" label={t('common.name')} rules={[{ required: true }, { pattern: /^[A-Za-z_][A-Za-z0-9_]*$/, message: t('functions.identifierInvalid') }]}>
            <Input disabled={!isNew} style={{ width: 220 }} />
          </Form.Item>
          <Form.Item name="runtime" label={t('functions.runtime')} rules={[{ required: true }]}>
            <Select style={{ width: 160 }} options={[
              // i18n-ignore
              { label: 'Node.js 20', value: 'nodejs20' },
              // i18n-ignore
              { label: 'Python 3.12', value: 'python312' },
            ]} />
          </Form.Item>
          <Form.Item name="handler" label={t('functions.handler')} rules={[{ required: true }]} tooltip={t('functions.handlerTooltip')}>
            <Input style={{ width: 200 }} />
          </Form.Item>
        </Space>

        <Form.Item name="package" label={t('functions.package')}>
          <Select style={{ width: 200 }} onChange={(v) => setPkg(v)} options={[
            { label: t('functions.inlineSource'), value: 'inline' },
            { label: t('functions.zipBundle'), value: 'zip' },
          ]} />
        </Form.Item>

        {pkg === 'inline' ? (
          <Form.Item label={t('functions.code')} required>
            <CodeEditor value={code} onChange={setCode} height="280px" />
          </Form.Item>
        ) : (
          <Form.Item label={t('functions.zipBundle')} tooltip={t('functions.zipTooltip')}>
            <Upload
              maxCount={1}
              accept=".zip"
              beforeUpload={async (file) => {
                setCode(await readFileAsBase64(file));
                message.success(t('functions.zipLoaded', { name: file.name, size: Math.round(file.size / 1024) }));
                return false;
              }}
            >
              <Button icon={<UploadOutlined />}>{t('functions.selectZip')}</Button>
            </Upload>
            {code && <div style={{ marginTop: 8, color: '#888' }}>{t('functions.bundleLoaded', { size: Math.round((code.length * 3) / 4 / 1024) })}</div>}
          </Form.Item>
        )}

        <Space size="large">
          <Form.Item name="memory_mb" label={t('functions.memory')}>
            <InputNumber style={{ width: 140 }} min={64} max={4096} />
          </Form.Item>
          <Form.Item name="timeout_s" label={t('functions.timeout')}>
            <InputNumber style={{ width: 140 }} min={1} max={900} />
          </Form.Item>
        </Space>

        <Form.Item label={t('functions.envVars')}>
          <CodeEditor value={env} onChange={setEnv} language="json" height="100px" />
        </Form.Item>

        <h3>{t('functions.triggers')}</h3>
        <Form.Item name="schedule" label={t('functions.schedule')} tooltip={t('functions.scheduleTooltip')}>
          <Input
            // i18n-ignore
            placeholder="0 2 * * *" style={{ width: 260 }} />
        </Form.Item>
        <Space size="large" align="start">
          <Form.Item name="eventTable" label={t('functions.eventTable')} tooltip={t('functions.eventTableTooltip')}>
            <Input
              // i18n-ignore
              placeholder="public.orders" style={{ width: 260 }} />
          </Form.Item>
          <Form.Item name="eventOps" label={t('functions.on')}>
            <Select mode="multiple" allowClear style={{ width: 260 }} placeholder={t('functions.allPlaceholder')} options={[
              // i18n-ignore
              { label: 'insert', value: 'insert' },
              // i18n-ignore
              { label: 'update', value: 'update' },
              // i18n-ignore
              { label: 'delete', value: 'delete' },
            ]} />
          </Form.Item>
        </Space>

        <Space>
          <Button type="primary" onClick={handleSave}>{t('common.save')}</Button>
          <Button onClick={() => navigate('/functions')}>{t('common.cancel')}</Button>
        </Space>
      </Form>
    </div>
  );
}
