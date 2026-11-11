import { useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { Alert, Card, Select, Space, Typography } from 'antd';
import { useAuth } from '../../auth/AuthProvider';
import UrlField from './UrlField';
import OgcApiCard from './OgcApiCard';
import { useSchemaNames } from '../../hooks/useSchemaNames';

const { Text } = Typography;

const SRS_OPTIONS = ['4326', '3857', '25832'];

export default function OgcServicesPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const database = (user?.database as string) ?? '';
  const host = import.meta.env.VITE_GC2_HOST;

  const [schema, setSchema] = useState<string | null>(null);
  const [srs, setSrs] = useState<string | null>(null);

  const { data: schemaData, isLoading } = useSchemaNames();
  const schemas = schemaData?.map((s) => s.name) ?? [];

  const s = schema ? encodeURIComponent(schema) : '{schema}';
  const db = database ? encodeURIComponent(database) : '{database}';
  const srsPath = srs ? `/srs/${encodeURIComponent(srs)}` : '';

  const owsUrl = `${host}/api/v4/ows/schema/${s}/database/${db}`;
  const wfsUrl = `${host}/api/v4/wfs/schema/${s}/database/${db}${srsPath}`;

  return (
    <div style={{ maxWidth: 860 }}>
      {/* i18n-ignore */}
      <h2>OGC Services</h2>
      <Space style={{ marginBottom: 16 }} wrap>
        <Select
          placeholder={t('ogc.selectSchema')}
          style={{ width: 260 }}
          loading={isLoading}
          showSearch
          value={schema}
          onChange={setSchema}
          options={schemas.map((name) => ({ label: name, value: name }))}
        />
        <Select
          placeholder={t('ogc.srsPlaceholder')}
          style={{ width: 200 }}
          allowClear
          showSearch
          value={srs}
          onChange={(v) => setSrs(v ?? null)}
          // i18n-ignore
          options={SRS_OPTIONS.map((v) => ({ label: `EPSG:${v}`, value: v }))}
        />
      </Space>

      <Space direction="vertical" size="large" style={{ width: '100%' }}>
        <Card
          // i18n-ignore
          title="OWS (WMS/WFS)"
          extra={<Text type="secondary">{t('ogc.readOnly')}</Text>}
          size="small"
        >
          <Space direction="vertical" style={{ width: '100%' }}>
            <UrlField
              label={t('ogc.serviceUrl')}
              url={owsUrl}
              openUrl={`${owsUrl}?SERVICE=WMS&REQUEST=GetCapabilities`}
            />
            <Alert
              type="info"
              showIcon
              message={
                <Trans i18nKey="ogc.owsHelp" components={{ strong: <Text strong />, code: <Text code /> }} />
              }
            />
          </Space>
        </Card>

        <Card
          // i18n-ignore
          title="WFS-t"
          extra={<Text type="secondary">{t('ogc.supportsTransactions')}</Text>}
          size="small"
        >
          <Space direction="vertical" style={{ width: '100%' }}>
            <UrlField
              label={t('ogc.serviceUrl')}
              url={wfsUrl}
              openUrl={`${wfsUrl}?SERVICE=WFS&REQUEST=GetCapabilities`}
            />
            <Alert
              type="info"
              showIcon
              message={
                <Trans i18nKey="ogc.wfsHelp" components={{ strong: <Text strong />, code: <Text code /> }} />
              }
            />
          </Space>
        </Card>

        <OgcApiCard host={host} database={database} schema={schema} />
      </Space>
    </div>
  );
}
