import { useEffect, useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import {
  Alert, Button, Card, Divider, Form, Input, InputNumber, Popconfirm, Radio, Select, Space, Tag, Typography,
} from 'antd';
import { Mapcache } from '@mapcentia/gc2-sdk';
import type { MapcacheTilesetDeleteResult, SchemaTileSettingsInput } from '@mapcentia/gc2-sdk';
import { useQuery } from '@tanstack/react-query';
import { message } from '../../utils/message';
import { getAdminClient, getApiErrorCode, getErrorMessage } from '../../baas/adminClient';
import { formatNumber } from '../../i18n';

const { Text } = Typography;

type Field = keyof SchemaTileSettingsInput;

const FIELDS: Field[] = ['cache', 'format', 'ttl', 'auto_expire', 'meta_size', 'meta_buffer', 's3_tile_set', 'title', 'abstract'];

const settings = () => getAdminClient().provisioning.schemaTileSettings;

const isEmpty = (v: unknown) => v === undefined || v === null || v === '';

/** Backends that cannot be wiped whole; only a scoped (zoom/bbox) delete reaches them. */
const SCOPED_ONLY = new Set(['s3', 'memcache']);

/** Clear the cached tiles of a schema's combined tilesets. */
function ClearSchemaCache({ database, schema, backend }: { database: string; schema: string; backend: string }) {
  const { t } = useTranslation();
  const scopedOnly = SCOPED_ONLY.has(backend);
  const [scope, setScope] = useState<'all' | 'zoom'>(scopedOnly ? 'zoom' : 'all');
  const [zoom, setZoom] = useState<[number | null, number | null]>([0, 12]);
  const [clearing, setClearing] = useState(false);
  useEffect(() => setScope(scopedOnly ? 'zoom' : 'all'), [scopedOnly]);

  const zoomValid = zoom[0] !== null && zoom[1] !== null && zoom[0] <= zoom[1];

  const handleClear = async () => {
    const mc = new Mapcache(getAdminClient().http);
    const opts = scope === 'zoom' ? { zoom: `${zoom[0]},${zoom[1]}` } : {};
    setClearing(true);
    try {
      const results: MapcacheTilesetDeleteResult[] = await Promise.all([
        mc.deleteMapcacheTileset(database, schema, opts),
        mc.deleteMapcacheTileset(database, `${schema}.mvt`, opts),
      ]);
      const done = results.filter((r) => 'removed' in r);
      if (done.length < results.length) {
        message.success(t('ogc.clearingStarted'));
      } else if (done.every((r) => r.backend === 'sqlite')) {
        const [img, vec] = done.map((r) => ('removed' in r ? r.removed : 0));
        message.success(t('ogc.schemaCacheClearedCount', {
          total: formatNumber(img + vec),
          image: formatNumber(img),
          vector: formatNumber(vec),
        }));
      } else {
        message.success(t('ogc.schemaCacheCleared'));
      }
    } catch (e) {
      const code = getApiErrorCode(e);
      // i18n-ignore
      message.error(code ? `${code}: ${getErrorMessage(e)}` : getErrorMessage(e));
    } finally {
      setClearing(false);
    }
  };

  return (
    <>
      <Divider titlePlacement="start" orientationMargin={0}>{t('ogc.cachedTiles')}</Divider>
      <Space direction="vertical">
        <Radio.Group value={scope} onChange={(e) => setScope(e.target.value)}>
          <Radio value="all" disabled={scopedOnly}>{t('ogc.entireTilesets')}</Radio>
          <Radio value="zoom">{t('ogc.zoomRange')}</Radio>
        </Radio.Group>
        {scopedOnly && (
          <Text type="secondary">
            {t('ogc.scopedOnlyHint', { backend })}
          </Text>
        )}
        {scope === 'zoom' && (
          <Space>
            <InputNumber min={0} max={30} value={zoom[0]} onChange={(v) => setZoom([v, zoom[1]])} addonBefore={t('ogc.fromZ')} />
            <InputNumber min={0} max={30} value={zoom[1]} onChange={(v) => setZoom([zoom[0], v])} addonBefore={t('ogc.toZ')} />
          </Space>
        )}
        <Popconfirm
          title={scope === 'zoom'
            ? t('ogc.deleteCachedTilesZoom', { schema, from: zoom[0], to: zoom[1] })
            : t('ogc.deleteCachedTiles', { schema })}
          okText={t('ogc.clear')}
          okButtonProps={{ danger: true }}
          onConfirm={handleClear}
          disabled={scope === 'zoom' && !zoomValid}
        >
          <Button danger loading={clearing} disabled={scope === 'zoom' && !zoomValid}>
            {t('ogc.clearCache')}
          </Button>
        </Popconfirm>
      </Space>
    </>
  );
}

export default function SchemaTileSettings({ database, schema }: { database: string; schema: string }) {
  const { t } = useTranslation();
  const [form] = Form.useForm<SchemaTileSettingsInput>();
  const [saving, setSaving] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [staleCacheWarning, setStaleCacheWarning] = useState(false);

  const { data, isLoading, error: loadError, refetch } = useQuery({
    queryKey: ['schema-tile-settings', schema],
    queryFn: async () => await settings().getSchemaTileSettings(schema),
  });

  useEffect(() => {
    form.resetFields();
    if (data) form.setFieldsValue(data._stored);
    setError(null);
  }, [data, form]);
  useEffect(() => setStaleCacheWarning(false), [schema]);

  const cache = (Form.useWatch('cache', form) as string | undefined) ?? data?.cache;

  const handleSave = async () => {
    if (!data) return;
    const values = await form.validateFields();
    const patch: Record<string, unknown> = {}; // SchemaTileSettingsInput, built per field
    for (const f of FIELDS) {
      const next = isEmpty(values[f]) ? null : values[f];
      const prev = data._stored[f] ?? null;
      if (next !== prev) patch[f] = next; // null removes the setting, back to the default
    }
    if (Object.keys(patch).length === 0) {
      message.info(t('ogc.nothingChanged'));
      return;
    }
    const before = { cache: data.cache, format: data.format };
    setSaving(true);
    setError(null);
    try {
      await settings().patchSchemaTileSettings(schema, patch as SchemaTileSettingsInput);
      // refetch, not fetchQuery: the app-wide staleTime would hand back the pre-save data.
      const after = (await refetch()).data;
      if (!after) return;
      setStaleCacheWarning(after.cache !== before.cache || after.format !== before.format);
      message.success(t('ogc.tileSettingsSaved'));
    } catch (e) {
      const code = getApiErrorCode(e);
      setError(code ? `${code}: ${getErrorMessage(e)}` : getErrorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  const handleReset = async () => {
    const before = data ? { cache: data.cache, format: data.format } : null;
    setResetting(true);
    setError(null);
    try {
      await settings().deleteSchemaTileSettings(schema);
      // refetch, not fetchQuery: the app-wide staleTime would hand back the pre-save data.
      const after = (await refetch()).data;
      if (!after) return;
      setStaleCacheWarning(!!before && (after.cache !== before.cache || after.format !== before.format));
      message.success(t('ogc.tileSettingsReset'));
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      setResetting(false);
    }
  };

  const defaultOf = (f: Field): unknown => {
    if (!data) return undefined;
    // _defaults is typed as always present, but servers that predate it omit it.
    if (data._defaults) return data._defaults[f];
    // Without _defaults the effective value equals the default only for unstored fields.
    return f in data._stored ? undefined : data[f];
  };
  const placeholder = (f: Field) => (isEmpty(defaultOf(f)) ? t('ogc.defaultPlaceholder') : t('ogc.defaultValue', { value: String(defaultOf(f)) }));
  const storedCount = data ? Object.keys(data._stored).length : 0;

  return (
    <Card
      size="small"
      style={{ marginBottom: 16 }}
      title={t('ogc.schemaTilesetSettings', { schema })}
      extra={<Text type="secondary">{t('ogc.superUserOnly')}</Text>}
    >
      {loadError ? (
        <Alert type="error" showIcon message={getErrorMessage(loadError)} />
      ) : isLoading || !data ? (
        <Text type="secondary">{t('common.loading')}</Text>
      ) : (
        <>
          <Text type="secondary" style={{ display: 'block', marginBottom: 12 }}>
            <Trans i18nKey="ogc.settingsHelp" values={{ schema }} components={{ code: <Text code /> }} />
          </Text>
          {!data.schema_exists && (
            <Alert
              style={{ marginBottom: 12 }}
              type="info"
              showIcon
              message={t('ogc.waitingForSchema')}
            />
          )}
          <Form form={form} layout="vertical" disabled={!data.schema_exists}>
            <Space wrap align="start" size="large">
              <Form.Item name="cache" label={t('ogc.cacheBackend')}>
                <Select
                  allowClear
                  style={{ width: 180 }}
                  placeholder={placeholder('cache')}
                  options={['sqlite', 'disk', 'memcache', 's3'].map((v) => ({ label: v, value: v }))}
                />
              </Form.Item>
              <Form.Item name="format" label={t('ogc.imageFormat')} tooltip={t('ogc.imageFormatTip')}>
                <Select
                  allowClear
                  style={{ width: 180 }}
                  placeholder={placeholder('format')}
                  options={['PNG', 'jpeg_low', 'jpeg_medium', 'jpeg_high'].map((v) => ({ label: v, value: v }))}
                />
              </Form.Item>
              <Form.Item label={t('ogc.vectorFormat')} tooltip={t('ogc.vectorFormatTip', { schema })}>
                <Tag style={{ marginTop: 5 }}>{data.vector_format}</Tag>
              </Form.Item>
            </Space>
            <Space wrap align="start" size="large">
              <Form.Item name="ttl" label={t('ogc.ttl')} tooltip={t('ogc.ttlTip')}>
                <InputNumber min={30} style={{ width: 150 }} placeholder={placeholder('ttl')} />
              </Form.Item>
              <Form.Item name="auto_expire" label={t('ogc.autoExpire')}>
                <InputNumber min={0} style={{ width: 150 }} placeholder={placeholder('auto_expire')} />
              </Form.Item>
              <Form.Item name="meta_size" label={t('ogc.metaSize')} tooltip={t('ogc.metaSizeTip')}>
                <InputNumber min={1} max={16} style={{ width: 120 }} placeholder={placeholder('meta_size')} />
              </Form.Item>
              <Form.Item name="meta_buffer" label={t('ogc.metaBuffer')} tooltip={t('ogc.metaBufferTip')}>
                <InputNumber min={0} max={512} style={{ width: 120 }} placeholder={placeholder('meta_buffer')} />
              </Form.Item>
            </Space>
            {cache === 's3' && (
              <Form.Item
                name="s3_tile_set"
                label={t('ogc.s3TileSet')}
                tooltip={t('ogc.s3TileSetTip')}
                rules={[{ pattern: /^(?!\.+$)[A-Za-z0-9_\-.]+$/, message: t('ogc.s3TileSetInvalid') }]}
              >
                <Input style={{ width: 320 }} placeholder={placeholder('s3_tile_set')} />
              </Form.Item>
            )}
            <Form.Item name="title" label={t('ogc.title')} tooltip={t('ogc.wmtsCapabilitiesTip')}>
              <Input style={{ maxWidth: 480 }} placeholder={placeholder('title')} />
            </Form.Item>
            <Form.Item name="abstract" label={t('ogc.abstract')} tooltip={t('ogc.wmtsCapabilitiesTip')}>
              <Input.TextArea rows={2} style={{ maxWidth: 480 }} placeholder={placeholder('abstract')} />
            </Form.Item>
          </Form>
          {staleCacheWarning && (
            <Alert
              style={{ marginBottom: 12 }}
              type="warning"
              showIcon
              closable
              onClose={() => setStaleCacheWarning(false)}
              message={t('ogc.staleCacheWarning')}
            />
          )}
          {error && (
            <Alert style={{ marginBottom: 12 }} type="error" showIcon closable onClose={() => setError(null)} message={error} />
          )}
          <Space>
            <Button type="primary" loading={saving} disabled={!data.schema_exists} onClick={handleSave}>
              {t('common.save')}
            </Button>
            <Popconfirm
              title={t('ogc.resetConfirm')}
              okText={t('ogc.reset')}
              onConfirm={handleReset}
              disabled={storedCount === 0}
            >
              <Button loading={resetting} disabled={storedCount === 0}>
                {t('ogc.resetToDefaults')}
              </Button>
            </Popconfirm>
            <Text type="secondary">{storedCount === 0 ? t('ogc.allDefaults') : t('ogc.settingsStored', { n: storedCount })}</Text>
          </Space>
          {data.schema_exists && <ClearSchemaCache database={database} schema={schema} backend={data.cache} />}
        </>
      )}
    </Card>
  );
}
