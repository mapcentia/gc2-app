import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import i18n from '../../i18n';
import { Upload, Button, Form, Input, Select, Switch, Space, Steps, Card, Alert, Table, Tag } from 'antd';
import { message } from '../../utils/message';
import { UploadOutlined, CloudUploadOutlined } from '@ant-design/icons';
import { getAdminClient, getErrorMessage } from '../../baas/adminClient';
import { useSchemaNames, tableSummaryKey, SCHEMAS_KEY } from '../../hooks/useSchemaNames';
import { queryClient } from '../../data/queryClient';
import type { UploadFile } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import type { FileProcessResponse } from '@mapcentia/gc2-sdk';
import JSZip from 'jszip';

const getResultColumns = (hasSsrs: boolean): ColumnsType<FileProcessResponse> => [
  { title: i18n.t('common.name'), dataIndex: 'name', key: 'name' },
  { title: i18n.t('import.colDriver'), dataIndex: 'driver', key: 'driver' },
  { title: i18n.t('import.colRows'), dataIndex: 'count', key: 'count', align: 'right' },
  {
    title: i18n.t('import.colGeometry'), dataIndex: 'geom_type', key: 'geom_type',
    render: (v: string) => v || <Tag color="default">{i18n.t('import.none')}</Tag>,
  },
  { title: i18n.t('import.colSrs'), dataIndex: 'auth_str', key: 'auth_str' },
  {
    title: i18n.t('common.status'), key: 'error',
    render: (_: unknown, row: FileProcessResponse) => {
      if (row.error) return <Tag color="error">{row.error}</Tag>;
      if (!row.has_wkt && !hasSsrs) return <Tag color="warning">{i18n.t('import.missingProjection')}</Tag>;
      return <Tag color="success">{i18n.t('common.ok')}</Tag>;
    },
  },
];

export default function FileImportPage() {
  const { t } = useTranslation();
  const { data: schemasData } = useSchemaNames();
  const schemas: string[] = (schemasData?.map((s) => s.name) ?? []).sort();

  const [step, setStep] = useState(0);
  const [uploadedFile, setUploadedFile] = useState<string | null>(null);
  const [fileList, setFileList] = useState<UploadFile[]>([]);
  const [uploading, setUploading] = useState(false);
  const [dryResult, setDryResult] = useState<any>(null);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [form] = Form.useForm();
  const sSrs = Form.useWatch('s_srs', form);
  const resultColumns = getResultColumns(!!sSrs);

  const handleUpload = async () => {
    const originFiles = fileList.map((f) => f.originFileObj!);
    if (originFiles.length === 0) return;

    setUploading(true);
    try {
      let file: File;
      if (originFiles.length === 1) {
        file = originFiles[0];
      } else {
        const zip = new JSZip();
        for (const f of originFiles) {
          zip.file(f.name, f);
        }
        const blob = await zip.generateAsync({ type: 'blob' });
        file = new File([blob], 'files.zip', { type: 'application/zip' });
      }

      const CHUNK_SIZE = 1_048_576; // 1 MB
      const formData = new FormData();
      formData.append('filename', file);
      await getAdminClient().provisioning.fileImport.postFileUpload(formData, { chunkSize: CHUNK_SIZE });
      setUploadedFile(file.name);
      message.success(originFiles.length > 1
        ? t('import.filesZipped', { count: originFiles.length })
        : t('import.fileUploaded'));
      setStep(1);
    } catch (e: unknown) {
      message.error(getErrorMessage(e));
    } finally {
      setUploading(false);
    }
  };

  const handleDryRun = async () => {
    const values = form.getFieldsValue();
    setError(null);
    try {
      const data = await getAdminClient().provisioning.fileImport.postFileProcess({
        ...values,
        file: uploadedFile!,
        import: false,
      });
      setDryResult(data);
      setStep(2);
    } catch (e: unknown) {
      setError(getErrorMessage(e));
    }
  };

  const handleImport = async () => {
    const values = await form.validateFields();
    setImporting(true);
    setError(null);
    try {
      const data = await getAdminClient().provisioning.fileImport.postFileProcess({
        ...values,
        file: uploadedFile!,
        import: true,
      });
      setImportResult(data);
      setStep(3);
      message.success(t('import.importCompleted'));
      queryClient.invalidateQueries({ queryKey: tableSummaryKey(values.schema) });
      queryClient.invalidateQueries({ queryKey: SCHEMAS_KEY });
    } catch (e: unknown) {
      setError(getErrorMessage(e));
    } finally {
      setImporting(false);
    }
  };

  const handleReset = () => {
    setStep(0);
    setUploadedFile(null);
    setFileList([]);
    setDryResult(null);
    setImportResult(null);
    setError(null);
    form.resetFields();
  };

  return (
    <div>
      <Space style={{ marginBottom: 16 }}>
        <h2 style={{ margin: 0 }}>
          {/* i18n-ignore */}
          File Import
        </h2>
        {step > 0 && <Button onClick={handleReset}>{t('import.reset')}</Button>}
      </Space>
      <Steps current={step} style={{ marginBottom: 24 }} items={[
        { title: t('import.stepUpload') },
        { title: t('import.stepConfigure') },
        { title: t('import.stepPreview') },
        { title: t('import.stepDone') },
      ]} />

      {step === 0 && (
        <Card>
          <Upload.Dragger
            multiple
            beforeUpload={() => false}
            fileList={fileList}
            onChange={({ fileList: newList }) => setFileList(newList)}
          >
            <p><UploadOutlined style={{ fontSize: 48, color: '#1890ff' }} /></p>
            <p>{t('import.dropText')}</p>
            <p style={{ color: '#888' }}>
              {t('import.supports')}
            </p>
            <p style={{ color: '#888' }}>
              {t('import.zipAuto')}
            </p>
          </Upload.Dragger>
          {fileList.length > 0 && (
            <Button
              type="primary"
              icon={<CloudUploadOutlined />}
              onClick={handleUpload}
              loading={uploading}
              style={{ marginTop: 16 }}
            >
              {fileList.length > 1 ? t('import.uploadZip', { count: fileList.length }) : t('import.uploadFile')}
            </Button>
          )}
        </Card>
      )}

      {step >= 1 && (
        <Card title={t('import.fileCard', { name: uploadedFile })} style={{ marginBottom: 16 }}>
          <Form form={form} layout="vertical">
            <Form.Item name="schema" label={t('import.targetSchema')} rules={[{ required: true, message: t('import.schemaRequired') }]}>
              <Select allowClear options={schemas.map((s) => ({ label: s, value: s }))} />
            </Form.Item>
            <Form.Item name="s_srs" label={t('import.sourceSrs')} tooltip={t('import.sourceSrsTooltip')}>
              <Input placeholder={t('import.srsExample')} />
            </Form.Item>
            <Form.Item name="t_srs" label={t('import.targetSrs')} tooltip={t('import.targetSrsTooltip')}>
              <Input
                // i18n-ignore
                placeholder="EPSG:4326"
              />
            </Form.Item>
            <Form.Item name="append" label={t('import.append')} valuePropName="checked" tooltip={t('import.appendTooltip')}>
              <Switch />
            </Form.Item>
            <Form.Item name="truncate" label={t('import.truncate')} valuePropName="checked" tooltip={t('import.truncateTooltip')}>
              <Switch />
            </Form.Item>
            <Form.Item name="p_multi" label={t('import.promoteMulti')} valuePropName="checked" tooltip={t('import.promoteMultiTooltip')}>
              <Switch />
            </Form.Item>
            <Form.Item name="timestamp" label={t('import.timestampField')} tooltip={t('import.timestampTooltip')}>
              <Input placeholder={t('import.timestampExample')} />
            </Form.Item>
            <Form.Item name="x_possible_names" label={t('import.xNames')} tooltip={t('import.xNamesTooltip')}>
              <Input
                // i18n-ignore
                placeholder="lon*,Lon*,x,X"
              />
            </Form.Item>
            <Form.Item name="y_possible_names" label={t('import.yNames')} tooltip={t('import.yNamesTooltip')}>
              <Input
                // i18n-ignore
                placeholder="lat*,Lat*,y,Y"
              />
            </Form.Item>
            <Space>
              <Button onClick={handleDryRun}>{t('import.dryRunButton')}</Button>
              <Button type="primary" icon={<CloudUploadOutlined />} onClick={handleImport} loading={importing}>
                {t('import.importButton')}
              </Button>
            </Space>
          </Form>
        </Card>
      )}

      {error && <Alert type="error" title={error} style={{ marginBottom: 12 }} />}

      {dryResult && step === 2 && (
        <Card title={t('import.dryRunResult')}>
          <Table<FileProcessResponse>
            columns={resultColumns}
            dataSource={dryResult}
            rowKey="index"
            pagination={false}
            size="small"
          />
          <Button type="primary" icon={<CloudUploadOutlined />} onClick={handleImport} loading={importing} style={{ marginTop: 12 }}>
            {t('import.proceed')}
          </Button>
        </Card>
      )}

      {importResult && step === 3 && (
        <Card title={t('import.complete')}>
          <Alert type="success" title={t('import.success')} style={{ marginBottom: 12 }} />
          <Table<FileProcessResponse>
            columns={resultColumns}
            dataSource={importResult}
            rowKey="index"
            pagination={false}
            size="small"
          />
          <Button onClick={handleReset} style={{ marginTop: 12 }}>
            {t('import.another')}
          </Button>
        </Card>
      )}
    </div>
  );
}
