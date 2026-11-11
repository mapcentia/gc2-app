import { useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { Alert, Card, Select, Space, Typography } from 'antd';
import { Mapcache } from '@mapcentia/gc2-sdk';
import { getAdminClient } from '../../baas/adminClient';
import { useAuth } from '../../auth/AuthProvider';
import { useGeoTables } from '../map/geoTables';
import { useSchemaNames } from '../../hooks/useSchemaNames';
import UrlField from './UrlField';
import SchemaTileSettings from './SchemaTileSettings';

const { Text } = Typography;

const GRID_OPTIONS = [
  // i18n-ignore
  { label: 'g20 (Web Mercator, EPSG:3857)', value: 'g20' },
  // i18n-ignore
  { label: '25832 (ETRS89 / UTM32N)', value: '25832' },
];

export default function TileCachePage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const isSuperUser = user?.superUser === true;
  const database = (user?.database as string) ?? '';

  const [schema, setSchema] = useState<string | null>(null);
  const [table, setTable] = useState<string | null>(null);
  const [grid, setGrid] = useState('g20');

  const { data: schemaNames = [], isLoading } = useSchemaNames();
  const { geoTables, isLoading: tablesLoading } = useGeoTables(schema);

  const schemas = schemaNames.map((s) => s.name).sort();
  const tables = geoTables.map((gt) => gt.table);

  const mc = new Mapcache(getAdminClient().http);
  const db = database || '{database}';
  // A schema alone is a tileset too (all its layers); a table narrows it to that layer.
  const tileset = schema ? (table ? `${schema}.${table}` : schema) : '{schema}.{table}';

  const wmtsCapabilities = mc.mapcacheUrl(db, 'wmts/1.0.0/WMTSCapabilities.xml');
  const rasterTemplate = mc.mapcacheUrl(db, `tms/1.0.0/${tileset}@${grid}/{z}/{x}/{y}.png`);
  const mvtTemplate = mc.mapcacheUrl(db, `tms/1.0.0/${tileset}.mvt@${grid}/{z}/{x}/{y}.mvt`);
  const xyzRasterTemplate = mc.mapcacheUrl(db, `gmaps/${tileset}@${grid}/{z}/{x}/{y}.png`);
  const xyzMvtTemplate = mc.mapcacheUrl(db, `gmaps/${tileset}.mvt@${grid}/{z}/{x}/{y}.mvt`);

  return (
    <div style={{ maxWidth: 860 }}>
      {/* i18n-ignore */}
      <h2>Tile Cache</h2>
      <Space style={{ marginBottom: 16 }} wrap>
        <Select
          placeholder={t('ogc.selectSchema')}
          style={{ width: 220 }}
          loading={isLoading}
          showSearch
          value={schema}
          onChange={(v) => {
            setSchema(v);
            setTable(null);
          }}
          options={schemas.map((s) => ({ label: s, value: s }))}
        />
        <Select
          placeholder={t('ogc.selectTable')}
          style={{ width: 260 }}
          showSearch
          loading={tablesLoading}
          disabled={!schema}
          allowClear
          value={table}
          onChange={(v?: string) => setTable(v ?? null)}
          options={tables.map((name) => ({ label: name, value: name }))}
        />
        <Select
          style={{ width: 260 }}
          value={grid}
          onChange={setGrid}
          options={GRID_OPTIONS}
        />
      </Space>

      <Space direction="vertical" size="large" style={{ width: '100%' }}>
        <Card
          // i18n-ignore
          title="WMTS"
          size="small"
        >
          <Space direction="vertical" style={{ width: '100%' }}>
            <UrlField
              label={t('ogc.wmtsCapabilities')}
              url={wmtsCapabilities}
              openUrl={wmtsCapabilities}
            />
            <Alert
              type="info"
              showIcon
              message={
                <Trans i18nKey="ogc.wmtsHelp" components={{ strong: <Text strong />, code: <Text code /> }} />
              }
            />
          </Space>
        </Card>

        {schema && !table && (
          <Alert
            type="warning"
            showIcon
            message={
              <Trans i18nKey="ogc.schemaTilesetWarning" values={{ schema }} components={{ code: <Text code /> }} />
            }
          />
        )}

        <Card title={t('ogc.xyzTitle')} size="small">
          <Space direction="vertical" style={{ width: '100%' }}>
            <UrlField label={t('ogc.cachedImageTiles')} url={xyzRasterTemplate} />
            <UrlField label={t('ogc.vectorTiles')} url={xyzMvtTemplate} />
            <Alert
              type="info"
              showIcon
              message={
                <Trans i18nKey="ogc.xyzHelp" components={{ strong: <Text strong />, code: <Text code /> }} />
              }
            />
          </Space>
        </Card>

        <Card title={t('ogc.tmsTitle')} size="small">
          <Space direction="vertical" style={{ width: '100%' }}>
            <UrlField label={t('ogc.cachedImageTiles')} url={rasterTemplate} />
            <UrlField label={t('ogc.vectorTiles')} url={mvtTemplate} />
            <Alert
              type="info"
              showIcon
              message={
                <Trans i18nKey="ogc.tmsHelp" components={{ strong: <Text strong />, code: <Text code /> }} />
              }
            />
          </Space>
        </Card>

        {schema && isSuperUser && <SchemaTileSettings database={database} schema={schema} />}
      </Space>
    </div>
  );
}
