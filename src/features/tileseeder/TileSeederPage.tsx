import { useEffect, useMemo, useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import {
  Alert, Button, Card, Checkbox, Descriptions, Drawer, Form, Input, InputNumber, Popconfirm,
  Select, Slider, Space, Table, Tag, Tooltip, Typography,
} from 'antd';
import { ReloadOutlined, RocketOutlined, StopOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { Tileseeder } from '@mapcentia/gc2-sdk';
import type { SeedJob, SeedJobInput, SeedJobStatus } from '@mapcentia/gc2-sdk';
import { message } from '../../utils/message';
import { getAdminClient, getApiErrorCode, getErrorMessage } from '../../baas/adminClient';
import { useAuth } from '../../auth/AuthProvider';
import { queryClient } from '../../data/queryClient';
import { formatNumber } from '../../i18n';
import { useSchemaNames } from '../../hooks/useSchemaNames';
import { useGeoTables } from '../map/geoTables';
import {
  isWebMercatorPyramid, tilesInBBox, useEstimatedExtent, useSeedCapabilities, type SeedGrid, type TileKind,
} from './capabilities';

const { Text } = Typography;

function seeder() {
  return new Tileseeder(getAdminClient().http);
}

const STATUS_COLOR: Record<SeedJobStatus, string> = {
  pending: 'default',
  running: 'processing',
  succeeded: 'success',
  failed: 'error',
  cancelled: 'warning',
};
const STATUSES: SeedJobStatus[] = ['pending', 'running', 'succeeded', 'failed', 'cancelled'];
const isActive = (j: SeedJob) => j.status === 'pending' || j.status === 'running';

/** Layer value for a schema's own tileset, named just "schema". */
const SCHEMA_TILESET = '*';
const toTilesetId = (schema: string, layer: string) => (layer === SCHEMA_TILESET ? schema : `${schema}.${layer}`);

/** Seeding beyond this many tiles can run for hours. */
const LARGE_SEED = 1_000_000;

/** Tiles in the whole grid over the zoom range — an upper bound; an extent layer seeds fewer. */
function tileUpperBound(grid: SeedGrid | undefined, from: number, to: number): number {
  if (!grid) return 0;
  return grid.levels.reduce((sum, z, i) => (z >= from && z <= to ? sum + grid.tilesPerLevel[i] : sum), 0);
}

/** "urn:ogc:def:crs:EPSG:6.3:3857" -> "EPSG:3857". */
function crsLabel(crs: string | null | undefined): string | null {
  const code = crs?.match(/EPSG:(?:[\d.]*:)?(\d+)$/)?.[1];
  return code ? `EPSG:${code}` : (crs ?? null);
}

function JobStatus({ job }: { job: SeedJob }) {
  const { t } = useTranslation();
  if (!job.status) return <Text type="secondary">—</Text>;
  return (
    <Space size={4}>
      <Tag color={STATUS_COLOR[job.status]} style={{ margin: 0 }}>{job.status}</Tag>
      {job.stale && (
        <Tooltip title={t('tileseeder.staleTip')}>
          <Tag color="orange" style={{ margin: 0 }}>{t('tileseeder.stale')}</Tag>
        </Tooltip>
      )}
    </Space>
  );
}

/**
 * mapcache_seed redraws its progress line with carriage returns; keep only
 * what a terminal would show — the last text written on each line.
 */
function terminalText(log: string): string {
  return log
    .split('\n')
    .map((line) => line.split('\r').map((seg) => seg.trimEnd()).filter(Boolean).pop() ?? '')
    .join('\n')
    .trimEnd();
}

function errorText(e: unknown): string {
  const code = getApiErrorCode(e);
  return code ? `${code}: ${getErrorMessage(e)}` : getErrorMessage(e);
}

export default function TileSeederPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const database = (user?.database as string) ?? '';
  const [form] = Form.useForm();
  const [tileKinds, setTileKinds] = useState<TileKind[]>(['raster']);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<SeedJobStatus | undefined>();
  const [search, setSearch] = useState('');
  const [detailUuid, setDetailUuid] = useState<string | null>(null);

  const caps = useSeedCapabilities(database);
  const tilesetSchema = Form.useWatch('tileset_schema', form) as string | undefined;
  const tilesetLayer = Form.useWatch('tileset_layer', form) as string | undefined;
  const tilesetId = tilesetSchema && tilesetLayer ? toTilesetId(tilesetSchema, tilesetLayer) : undefined;
  const gridId = Form.useWatch('grid', form) as string | undefined;
  const zoom = Form.useWatch('zoom', form) as [number, number] | undefined;
  const extentSchema = Form.useWatch('extent_schema', form) as string | undefined;
  const extentTable = Form.useWatch('extent_table', form) as string | undefined;
  const extentLayer = extentSchema && extentTable ? `${extentSchema}.${extentTable}` : undefined;
  const { data: schemaNames = [], isLoading: schemasLoading } = useSchemaNames();
  const { geoTables: extentTables, isLoading: extentTablesLoading } = useGeoTables(extentSchema);

  const tileset = caps.data?.tilesets.find((ts) => ts.id === tilesetId);
  const grid = gridId ? caps.data?.grids[gridId] : undefined;
  const minZoom = grid?.levels[0] ?? 0;
  const maxZoom = grid?.levels[grid.levels.length - 1] ?? 0;

  // A tileset's grid list decides the grid; the grid's levels decide the zoom range.
  useEffect(() => {
    form.setFieldsValue({ grid: tileset?.grids.length === 1 ? tileset.grids[0] : undefined });
  }, [tileset, form]);
  useEffect(() => {
    if (grid) form.setFieldsValue({ zoom: [minZoom, Math.min(maxZoom, minZoom + 12)] });
  }, [grid, minZoom, maxZoom, form]);

  const jobsQuery = useQuery({
    queryKey: ['seed-jobs', statusFilter],
    queryFn: async () => await seeder().getSeedJobs(statusFilter ? { status: statusFilter } : undefined),
    refetchInterval: (q) => ((q.state.data ?? []).some(isActive) ? 3000 : false),
  });
  const jobs = (jobsQuery.data ?? []).filter((j) => {
    if (!search) return true;
    const s = search.toLowerCase();
    return [j.name, j.tileset, j.username].some((v) => (v ?? '').toLowerCase().includes(s));
  });

  const detailQuery = useQuery({
    queryKey: ['seed-job', detailUuid],
    queryFn: async () => await seeder().getSeedJob(detailUuid!),
    enabled: !!detailUuid,
    refetchInterval: (q) => (q.state.data && isActive(q.state.data) ? 3000 : false),
  });
  const detail = detailQuery.data ?? jobsQuery.data?.find((j) => j.uuid === detailUuid) ?? null;

  const extentBBox = useEstimatedExtent(extentLayer || undefined).data ?? null;
  const zFrom = zoom?.[0] ?? 0;
  const zTo = zoom?.[1] ?? -1;
  // Within the extent layer's bbox when we can work it out, else the whole grid.
  const inExtent = grid && extentLayer && extentBBox && isWebMercatorPyramid(grid) ? tilesInBBox(extentBBox, zFrom, zTo) : null;
  const tileCount = inExtent ?? tileUpperBound(grid, zFrom, zTo);

  // Tilesets are "schema.layer" (vector variants "schema.layer.mvt"/".json"),
  // plus one per schema named just "schema" (and "schema.mvt") covering all its layers.
  const visibleTilesets = useMemo(
    () => (caps.data?.tilesets ?? []).filter((ts) => tileKinds.includes(ts.kind)),
    [caps.data, tileKinds],
  );
  const tilesetSchemas = useMemo(
    () => [...new Set(visibleTilesets.map((ts) => ts.id.split('.')[0]))].sort(),
    [visibleTilesets],
  );
  const tilesetLayerOptions = useMemo(() => {
    if (!tilesetSchema) return [];
    const options = visibleTilesets
      .filter((ts) => ts.id.startsWith(`${tilesetSchema}.`))
      .map((ts) => {
        const layer = ts.id.slice(tilesetSchema.length + 1);
        const schemaVector = layer === 'mvt' || layer === 'json';
        return {
          label: schemaVector ? t('tileseeder.allLayersSchemaTilesetType', { type: layer.toUpperCase() }) : layer,
          value: layer,
          allLayers: schemaVector,
        };
      })
      .sort((a, b) => Number(b.allLayers) - Number(a.allLayers));
    if (visibleTilesets.some((ts) => ts.id === tilesetSchema)) {
      options.unshift({ label: t('tileseeder.allLayersSchemaTileset'), value: SCHEMA_TILESET, allLayers: true });
    }
    return options;
  }, [visibleTilesets, tilesetSchema, t]);
  // Drop a chosen layer that the tile-type filter no longer offers.
  useEffect(() => {
    const layer = form.getFieldValue('tileset_layer') as string | undefined;
    if (layer && !tilesetLayerOptions.some((o) => o.value === layer)) form.setFieldsValue({ tileset_layer: undefined });
    const sch = form.getFieldValue('tileset_schema') as string | undefined;
    if (sch && !tilesetSchemas.includes(sch)) form.setFieldsValue({ tileset_schema: undefined, tileset_layer: undefined });
  }, [tilesetLayerOptions, tilesetSchemas, form]);

  const handleSubmit = async () => {
    const v = await form.validateFields();
    const body: SeedJobInput = {
      tileset: toTilesetId(v.tileset_schema, v.tileset_layer),
      grid: v.grid,
      zoom_start: v.zoom[0],
      zoom_end: v.zoom[1],
    };
    if (v.name) body.name = v.name;
    if (v.extent_schema && v.extent_table) body.extent_layer = `${v.extent_schema}.${v.extent_table}`;
    if (v.threads) body.threads = v.threads;
    setSubmitting(true);
    setSubmitError(null);
    try {
      await seeder().postSeedJob(body);
      message.success(t('tileseeder.seedJobQueued'));
      queryClient.invalidateQueries({ queryKey: ['seed-jobs'] });
    } catch (e) {
      // Kept on screen: the message names e.g. the grids the tileset actually has.
      setSubmitError(errorText(e));
    } finally {
      setSubmitting(false);
    }
  };

  const handleStop = async (job: SeedJob) => {
    try {
      const stopping = await seeder().deleteSeedJob(job.uuid);
      message.info(stopping ? t('tileseeder.stopRequested') : t('tileseeder.seedJobCancelled'));
      queryClient.invalidateQueries({ queryKey: ['seed-jobs'] });
      queryClient.invalidateQueries({ queryKey: ['seed-job', job.uuid] });
    } catch (e) {
      message.error(errorText(e));
    }
  };

  const stopButton = (job: SeedJob) =>
    isActive(job) && !job.cancel_requested ? (
      <Popconfirm title={t('tileseeder.stopSeedJobConfirm')} okText={t('tileseeder.stop')} onConfirm={() => handleStop(job)}>
        <Button size="small" danger icon={<StopOutlined />}>{t('tileseeder.stop')}</Button>
      </Popconfirm>
    ) : job.cancel_requested && isActive(job) ? (
      <Text type="secondary">{t('tileseeder.stopping')}</Text>
    ) : null;

  return (
    <div>
      <Space style={{ marginBottom: 16, justifyContent: 'space-between', width: '100%' }}>
        {/* i18n-ignore */}
        <h2>Tile Seeder</h2>
      </Space>

      <Alert
        style={{ marginBottom: 16 }}
        type="info"
        showIcon
        message={t('tileseeder.intro')}
      />

      <Card title={t('tileseeder.newSeedJob')} size="small" style={{ marginBottom: 16 }}>
        {caps.error ? (
          <Alert type="error" showIcon message={t('tileseeder.loadTilesetsFailed', { message: getErrorMessage(caps.error) })} />
        ) : (
          <Form form={form} layout="vertical" style={{ maxWidth: 720 }}>
            <Form.Item
              label={t('tileseeder.tileset')}
              required
              extra={
                <Space size="small">
                  <Text type="secondary">{t('tileseeder.tileTypes')}</Text>
                  <Checkbox.Group
                    value={tileKinds}
                    onChange={(v) => setTileKinds(v as TileKind[])}
                    options={[
                      { label: t('tileseeder.rasterKind'), value: 'raster' },
                      // i18n-ignore
                      { label: 'MVT', value: 'mvt' },
                      // i18n-ignore
                      { label: 'JSON', value: 'json' },
                    ]}
                  />
                  {tileKinds.length === 0 && <Text type="warning">{t('tileseeder.chooseOneType')}</Text>}
                </Space>
              }
            >
              <Space.Compact style={{ width: '100%' }}>
                <Form.Item name="tileset_schema" noStyle rules={[{ required: true, message: t('tileseeder.chooseSchema') }]}>
                  <Select
                    showSearch
                    loading={caps.isLoading}
                    placeholder={t('tileseeder.schema')}
                    style={{ width: '40%' }}
                    options={tilesetSchemas.map((n) => ({ label: n, value: n }))}
                    onChange={() => form.setFieldsValue({ tileset_layer: undefined })}
                  />
                </Form.Item>
                <Form.Item name="tileset_layer" noStyle rules={[{ required: true, message: t('tileseeder.chooseLayer') }]}>
                  <Select
                    showSearch
                    placeholder={t('tileseeder.layer')}
                    style={{ width: '60%' }}
                    disabled={!tilesetSchema}
                    options={tilesetLayerOptions}
                  />
                </Form.Item>
              </Space.Compact>
            </Form.Item>
            <Space wrap align="start" size="large">
              <Form.Item
                name="grid"
                label={t('tileseeder.grid')}
                rules={[{ required: true, message: t('tileseeder.chooseGrid') }]}
                tooltip={t('tileseeder.gridTip')}
              >
                <Select
                  style={{ width: 200 }}
                  disabled={!tileset}
                  options={(tileset?.grids ?? []).map((g) => ({
                    // i18n-ignore
                    label: crsLabel(caps.data?.grids[g]?.crs) ? `${g} (${crsLabel(caps.data?.grids[g]?.crs)})` : g,
                    value: g,
                  }))}
                />
              </Form.Item>
              <Form.Item name="threads" label={t('tileseeder.threads')} tooltip={t('tileseeder.threadsTip')}>
                <InputNumber min={1} max={64} style={{ width: 120 }} />
              </Form.Item>
              <Form.Item name="name" label={t('common.name')} tooltip={t('tileseeder.nameTip')}>
                <Input style={{ width: 240 }} maxLength={255} />
              </Form.Item>
            </Space>
            <Form.Item
              name="zoom"
              label={zoom ? t('tileseeder.zoomLevelsRange', { from: zoom[0], to: zoom[1] }) : t('tileseeder.zoomLevels')}
              rules={[{ required: true, message: t('tileseeder.chooseZoomRange') }]}
            >
              <Slider
                range
                disabled={!grid}
                min={minZoom}
                max={maxZoom}
                marks={grid ? { [minZoom]: String(minZoom), [maxZoom]: String(maxZoom) } : undefined}
              />
            </Form.Item>
            <Form.Item
              label={t('tileseeder.extentLayer')}
              tooltip={t('tileseeder.extentLayerTip')}
            >
              <Space.Compact style={{ width: '100%' }}>
                <Form.Item name="extent_schema" noStyle>
                  <Select
                    showSearch
                    allowClear
                    loading={schemasLoading}
                    placeholder={t('tileseeder.schema')}
                    style={{ width: '40%' }}
                    options={schemaNames.map((s) => ({ label: s.name, value: s.name }))}
                    onChange={() => form.setFieldsValue({ extent_table: undefined })}
                  />
                </Form.Item>
                <Form.Item
                  name="extent_table"
                  noStyle
                  rules={[{ required: !!extentSchema, message: t('tileseeder.chooseLayerOrClear') }]}
                >
                  <Select
                    showSearch
                    allowClear
                    placeholder={t('tileseeder.layer')}
                    style={{ width: '60%' }}
                    disabled={!extentSchema}
                    loading={extentTablesLoading}
                    options={extentTables.map((gt) => ({ label: gt.table, value: gt.table }))}
                  />
                </Form.Item>
              </Space.Compact>
            </Form.Item>
            {grid && zoom && (
              <Alert
                style={{ marginBottom: 16 }}
                type={tileCount > LARGE_SEED ? 'warning' : 'info'}
                showIcon
                message={
                  <>
                    {inExtent !== null ? (
                      <Trans
                        i18nKey="tileseeder.tileCountExtent"
                        values={{ n: formatNumber(inExtent), layer: extentLayer, from: zFrom, to: zTo }}
                        components={{ strong: <Text strong /> }}
                      />
                    ) : (
                      <Trans
                        i18nKey={extentLayer ? 'tileseeder.tileCountGridExtent' : 'tileseeder.tileCountGrid'}
                        values={{ n: formatNumber(tileCount), from: zFrom, to: zTo }}
                        components={{ strong: <Text strong /> }}
                      />
                    )}
                    {tileCount > LARGE_SEED && <> {t('tileseeder.largeSeedWarning')}</>}
                  </>
                }
              />
            )}
            {submitError && (
              <Alert
                style={{ marginBottom: 16 }}
                type="error"
                showIcon
                closable
                onClose={() => setSubmitError(null)}
                message={submitError}
              />
            )}
            <Button type="primary" icon={<RocketOutlined />} loading={submitting} onClick={handleSubmit}>
              {t('tileseeder.queueSeedJob')}
            </Button>
          </Form>
        )}
      </Card>

      <Card
        title={t('tileseeder.seedJobs')}
        size="small"
        extra={
          <Space>
            <Select
              allowClear
              placeholder={t('tileseeder.allStatuses')}
              style={{ width: 150 }}
              value={statusFilter}
              onChange={setStatusFilter}
              options={STATUSES.map((s) => ({ label: s, value: s }))}
            />
            <Input.Search allowClear placeholder={t('tileseeder.searchPlaceholder')} onChange={(e) => setSearch(e.target.value)} style={{ width: 240 }} />
            <Button icon={<ReloadOutlined />} onClick={() => jobsQuery.refetch()}>{t('common.refresh')}</Button>
          </Space>
        }
      >
        {jobsQuery.error ? (
          <Alert type="error" showIcon message={getErrorMessage(jobsQuery.error)} />
        ) : (
          <Table
            dataSource={jobs}
            rowKey="uuid"
            size="small"
            loading={jobsQuery.isLoading}
            pagination={{ pageSize: 25, hideOnSinglePage: true }}
            locale={{ emptyText: t('tileseeder.noSeedJobs') }}
            columns={[
              { title: t('common.status'), key: 'status', render: (_: unknown, j: SeedJob) => <JobStatus job={j} /> },
              { title: t('common.name'), dataIndex: 'name', key: 'name' },
              { title: t('tileseeder.tileset'), dataIndex: 'tileset', key: 'tileset', render: (v: string | null) => v ?? '—' },
              { title: t('tileseeder.grid'), dataIndex: 'grid', key: 'grid', render: (v: string | null) => v ?? '—' },
              {
                title: t('tileseeder.zoom'), key: 'zoom',
                render: (_: unknown, j: SeedJob) => (j.zoom_start !== null ? `${j.zoom_start}–${j.zoom_end}` : '—'),
              },
              { title: t('tileseeder.extent'), dataIndex: 'extent_layer', key: 'extent', render: (v: string | null) => v ?? '—' },
              { title: t('tileseeder.user'), dataIndex: 'username', key: 'user', render: (v: string | null) => v ?? '—' },
              { title: t('tileseeder.created'), dataIndex: 'created', key: 'created' },
              { title: t('tileseeder.finished'), dataIndex: 'finished', key: 'finished', render: (v: string | null) => v ?? '—' },
              {
                title: t('common.actions'), key: 'actions', width: 170,
                render: (_: unknown, j: SeedJob) => (
                  <Space>
                    <Button size="small" onClick={() => setDetailUuid(j.uuid)}>{t('tileseeder.details')}</Button>
                    {stopButton(j)}
                  </Space>
                ),
              },
            ]}
          />
        )}
      </Card>

      <Drawer
        title={detail ? t('tileseeder.seedJobNamed', { name: detail.name }) : t('tileseeder.seedJob')}
        open={!!detailUuid}
        onClose={() => setDetailUuid(null)}
        width={640}
        extra={detail ? stopButton(detail) : null}
      >
        {detail && (
          <Space direction="vertical" style={{ width: '100%' }}>
            <Descriptions size="small" column={2} bordered>
              <Descriptions.Item label={t('common.status')} span={2}><JobStatus job={detail} /></Descriptions.Item>
              <Descriptions.Item label={t('tileseeder.tileset')}>{detail.tileset ?? '—'}</Descriptions.Item>
              <Descriptions.Item label={t('tileseeder.grid')}>{detail.grid ?? '—'}</Descriptions.Item>
              <Descriptions.Item label={t('tileseeder.zoom')}>
                {/* i18n-ignore */}
                {detail.zoom_start !== null ? `${detail.zoom_start}–${detail.zoom_end}` : '—'}
              </Descriptions.Item>
              <Descriptions.Item label={t('tileseeder.threads')}>{detail.threads ?? t('tileseeder.threadsDefault')}</Descriptions.Item>
              <Descriptions.Item label={t('tileseeder.extentLayer')} span={2}>{detail.extent_layer ?? t('tileseeder.wholeGrid')}</Descriptions.Item>
              <Descriptions.Item label={t('tileseeder.created')}>{detail.created}</Descriptions.Item>
              <Descriptions.Item label={t('tileseeder.started')}>{detail.started ?? '—'}</Descriptions.Item>
              <Descriptions.Item label={t('tileseeder.heartbeat')}>{detail.heartbeat ?? '—'}</Descriptions.Item>
              <Descriptions.Item label={t('tileseeder.finished')}>{detail.finished ?? '—'}</Descriptions.Item>
              <Descriptions.Item label={t('tileseeder.hostPid')} span={2}>
                {/* i18n-ignore */}
                {detail.host ? `${detail.host} / ${detail.pid ?? '—'}` : '—'}
              </Descriptions.Item>
              {detail.cancel_requested && (
                <Descriptions.Item label={t('tileseeder.stopRequestedLabel')} span={2}>{detail.cancel_requested}</Descriptions.Item>
              )}
              <Descriptions.Item label={t('tileseeder.user')} span={2}>{detail.username ?? '—'}</Descriptions.Item>
            </Descriptions>
            {detail.status === 'pending' && (
              <Alert type="info" showIcon message={t('tileseeder.waitingForServer')} />
            )}
            {detail.error && <Alert type="error" showIcon message={detail.error} />}
            <Text strong>{t('tileseeder.log')}</Text>
            {detailQuery.isLoading ? (
              <Text type="secondary">{t('common.loading')}</Text>
            ) : detail.log ? (
              <pre
                style={{
                  fontSize: 12, maxHeight: 360, overflow: 'auto', margin: 0, whiteSpace: 'pre-wrap',
                  wordBreak: 'break-all', fontFamily: 'monospace',
                }}
              >
                {terminalText(detail.log)}
              </pre>
            ) : (
              <Text type="secondary">{t('tileseeder.noOutput')}</Text>
            )}
          </Space>
        )}
      </Drawer>
    </div>
  );
}
