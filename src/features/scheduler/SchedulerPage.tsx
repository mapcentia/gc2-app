import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Alert, Button, Descriptions, Drawer, Input, Select, Space, Table, Tabs, Tag, Tooltip, Typography,
} from 'antd';
import {
  CaretRightOutlined, DeleteOutlined, EditOutlined, PlusOutlined, ReloadOutlined, StopOutlined,
} from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { Scheduler } from '@mapcentia/gc2-sdk';
import type { SchedulerJob, SchedulerJobInput, SchedulerRun, SchedulerRunStatus } from '@mapcentia/gc2-sdk';
import { message } from '../../utils/message';
import { getAdminClient, getApiErrorCode, getErrorMessage } from '../../baas/adminClient';
import { useAuth } from '../../auth/AuthProvider';
import { confirmDelete } from '../../components/ConfirmDelete';
import { queryClient } from '../../data/queryClient';
import JobFormDrawer from './JobFormDrawer';
import { useSchemaNames } from '../../hooks/useSchemaNames';

const { Text } = Typography;

function schedulerClient() {
  return new Scheduler(getAdminClient().http);
}

const RUN_STATUS_COLOR: Record<SchedulerRunStatus, string> = {
  running: 'processing',
  succeeded: 'success',
  failed: 'error',
  skipped: 'default',
  lost: 'warning',
};

const RUN_STATUSES: SchedulerRunStatus[] = ['running', 'succeeded', 'failed', 'skipped', 'lost'];

export default function SchedulerPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const isSuperUser = user?.superUser === true;

  const [selectedJobIds, setSelectedJobIds] = useState<number[]>([]);
  const [jobSearch, setJobSearch] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [editJob, setEditJob] = useState<SchedulerJob | null>(null);
  const [saving, setSaving] = useState(false);
  const [runJobFilter, setRunJobFilter] = useState<number | null>(null);
  const [runStatusFilter, setRunStatusFilter] = useState<SchedulerRunStatus | null>(null);
  const [detailRun, setDetailRun] = useState<SchedulerRun | null>(null);
  const [stopping, setStopping] = useState<string | null>(null);
  /** Keep the runs panel polling for a while after a manual start (the run may not exist yet). */
  const [pollUntil, setPollUntil] = useState(0);

  const schemas = useSchemaNames().data?.map((s) => s.name) ?? [];

  const jobsQuery = useQuery({
    queryKey: ['scheduler-jobs'],
    queryFn: async () => await schedulerClient().getSchedulerJobs(),
    enabled: isSuperUser,
    staleTime: 10_000,
  });
  const jobs = jobsQuery.data ?? [];
  // Servers without use_sortby reject it as an unknown field, so only offer it where jobs carry it.
  const supportsSortby = jobs.some((j) => 'use_sortby' in j);
  const jobById = new Map(jobs.map((j) => [j.id, j]));
  // Legacy rows can carry null name/url despite the declared types — stay null-safe.
  const visibleJobs = jobSearch
    ? jobs.filter((j) =>
        [j.name, j.schema, j.url, String(j.id)].some((v) =>
          (v ?? '').toLowerCase().includes(jobSearch.toLowerCase()),
        ),
      )
    : jobs;

  const runsQuery = useQuery({
    queryKey: ['scheduler-runs', runJobFilter, runStatusFilter],
    queryFn: async () =>
      await schedulerClient().getSchedulerRuns({
        job: runJobFilter ?? undefined,
        status: runStatusFilter ?? undefined,
      }),
    enabled: isSuperUser,
    refetchInterval: (q) => {
      const active = (q.state.data ?? []).some((r: SchedulerRun) => r.status === 'running');
      return active || Date.now() < pollUntil ? 5000 : false;
    },
  });
  const runs = runsQuery.data ?? [];
  const anyRunning = runs.some((r) => r.status === 'running');

  // The list omits the (up to 1 MB) log — fetch the single run for the drawer
  // and keep it fresh while the run is still going.
  const runDetailQuery = useQuery({
    queryKey: ['scheduler-run', detailRun?.uuid],
    queryFn: async () => await schedulerClient().getSchedulerRun(detailRun!.uuid),
    enabled: detailRun !== null,
    refetchInterval: (q) => (q.state.data?.status === 'running' ? 3000 : false),
  });
  const shownRun = runDetailQuery.data ?? detailRun;
  const runLog = runDetailQuery.data?.log ?? null;

  if (!isSuperUser) {
    return <Alert type="info" showIcon message={t('scheduler.superUserOnly')} />;
  }

  const refreshAll = () => {
    queryClient.invalidateQueries({ queryKey: ['scheduler-jobs'] });
    queryClient.invalidateQueries({ queryKey: ['scheduler-runs'] });
  };

  const handleSave = async (values: SchedulerJobInput) => {
    setSaving(true);
    try {
      if (editJob) {
        await schedulerClient().patchSchedulerJob(editJob.id, values);
        message.success(t('scheduler.jobUpdated'));
      } else {
        await schedulerClient().postSchedulerJob(values);
        message.success(t('scheduler.jobCreated'));
      }
      setFormOpen(false);
      setEditJob(null);
      queryClient.invalidateQueries({ queryKey: ['scheduler-jobs'] });
    } catch (e) {
      if (getApiErrorCode(e) === 'INVALID_CRON_FIELD') {
        message.error(t('scheduler.invalidCron', { message: getErrorMessage(e) }));
      } else {
        message.error(getErrorMessage(e));
      }
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = (ids: number[]) => {
    const names = ids.map((id) => jobById.get(id)?.name ?? id).join(', ');
    confirmDelete(names, async () => {
      try {
        await schedulerClient().deleteSchedulerJob(ids.length === 1 ? ids[0] : ids);
        message.success(t('scheduler.jobsDeleted', { count: ids.length }));
        setSelectedJobIds([]);
        queryClient.invalidateQueries({ queryKey: ['scheduler-jobs'] });
      } catch (e) {
        if (getApiErrorCode(e) === 'JOB_RUNNING') {
          message.warning(t('scheduler.jobRunningDelete'));
        } else {
          message.error(getErrorMessage(e));
        }
      }
    });
  };

  const handleRunNow = async (job: SchedulerJob) => {
    try {
      await schedulerClient().postSchedulerRun({ job: job.id });
      message.success(t('scheduler.started', { name: job.name }));
      setPollUntil(Date.now() + 30_000);
      queryClient.invalidateQueries({ queryKey: ['scheduler-runs'] });
    } catch (e) {
      if (getApiErrorCode(e) === 'JOB_RUNNING') {
        message.warning(t('scheduler.jobAlreadyRunning'));
      } else {
        message.error(getErrorMessage(e));
      }
    }
  };

  const handleStop = (run: SchedulerRun) => {
    confirmDelete(t('scheduler.stopTarget', { id: run.uuid.slice(0, 8) }), async () => {
      setStopping(run.uuid);
      try {
        const res = await schedulerClient().deleteSchedulerRun(run.uuid);
        message.success(t('scheduler.runStopped', { signal: res.signal }));
      } catch (e) {
        message.error(getErrorMessage(e));
      } finally {
        setStopping(null);
        refreshAll();
      }
    });
  };

  return (
    <div>
      <Space style={{ marginBottom: 16, justifyContent: 'space-between', width: '100%' }}>
        {/* i18n-ignore */}
        <h2>Scheduler</h2>
      </Space>

      <Alert
        style={{ marginBottom: 16 }}
        type="info"
        showIcon
        message={t('scheduler.intro')}
      />

      <Tabs
        defaultActiveKey="jobs"
        tabBarExtraContent={
          <Button size="small" icon={<ReloadOutlined />} onClick={refreshAll}>
            {t('common.refresh')}
          </Button>
        }
        items={[
          { key: 'jobs',
            label: t('scheduler.jobsTab', { count: jobs.length }),
            children: (
              <>
                <Space style={{ marginBottom: 12, justifyContent: 'space-between', width: '100%' }}>
                  <Input.Search
                    placeholder={t('scheduler.searchPlaceholder')}
                    allowClear
                    onChange={(e) => setJobSearch(e.target.value)}
                    style={{ width: 320 }}
                  />
                  <Space>
                    {selectedJobIds.length > 0 && (
                      <Button danger icon={<DeleteOutlined />} onClick={() => handleDelete(selectedJobIds)}>
                        {t('scheduler.deleteSelected', { count: selectedJobIds.length })}
                      </Button>
                    )}
                    <Button
                      type="primary"
                      icon={<PlusOutlined />}
                      onClick={() => {
                        setEditJob(null);
                        setFormOpen(true);
                      }}
                    >
                      {t('scheduler.newJob')}
                    </Button>
                  </Space>
                </Space>
                <Table
          dataSource={visibleJobs}
          rowKey="id"
          size="small"
          pagination={{ pageSize: 25, showSizeChanger: true }}
          loading={jobsQuery.isLoading}
          rowSelection={{
            selectedRowKeys: selectedJobIds,
            onChange: (keys) => setSelectedJobIds(keys as number[]),
          }}
          expandable={{
            rowExpandable: (j: SchedulerJob) => j.report !== null,
            expandedRowRender: (j: SchedulerJob) => (
              <>
                <Text strong>{t('scheduler.lastReport')}</Text>
                <pre style={{ fontSize: 12, maxHeight: 320, overflow: 'auto', margin: 0 }}>
                  {JSON.stringify(j.report, null, 2)}
                </pre>
              </>
            ),
          }}
          locale={{ emptyText: t('scheduler.noJobs') }}
          columns={[
            { title: t('scheduler.colId'), dataIndex: 'id', key: 'id', width: 80,
              sorter: (a: SchedulerJob, b: SchedulerJob) => a.id - b.id,
            },
            { title: t('common.name'), dataIndex: 'name', key: 'name',
              sorter: (a: SchedulerJob, b: SchedulerJob) => (a.name ?? '').localeCompare(b.name ?? ''),
            },
            { title: t('scheduler.colSchema'), dataIndex: 'schema', key: 'schema',
              sorter: (a: SchedulerJob, b: SchedulerJob) => (a.schema ?? '').localeCompare(b.schema ?? ''),
            },
            { title: t('scheduler.colUrl'), dataIndex: 'url', key: 'url', ellipsis: true,
              sorter: (a: SchedulerJob, b: SchedulerJob) => (a.url ?? '').localeCompare(b.url ?? ''),
              render: (v: string) => <Tooltip title={v}>{v}</Tooltip>,
            },
            { title: t('scheduler.schedule'), dataIndex: 'schedule', key: 'schedule',
              sorter: (a: SchedulerJob, b: SchedulerJob) => (a.schedule ?? '').localeCompare(b.schedule ?? ''),
              render: (v: string) => <Text code>{v}</Text>,
            },
            { title: t('scheduler.active'), dataIndex: 'active', key: 'active',
              sorter: (a: SchedulerJob, b: SchedulerJob) => Number(a.active) - Number(b.active),
              render: (v: boolean) => (v ? <Tag color="green">{t('scheduler.activeTag')}</Tag> : <Tag>{t('scheduler.inactiveTag')}</Tag>),
            },
            { title: t('scheduler.snapshot'), dataIndex: 'snapshot', key: 'snapshot',
              sorter: (a: SchedulerJob, b: SchedulerJob) => Number(a.snapshot) - Number(b.snapshot),
              render: (v: boolean, j: SchedulerJob) =>
                v ? (
                  <Tooltip title={t('scheduler.formatsTip', { formats: j.snapshot_formats?.join(', ') ?? t('scheduler.serverDefault') })}>
                    <Tag color="blue">{j.snapshot_formats?.join('+') ?? t('scheduler.yesLower')}</Tag>
                  </Tooltip>
                ) : null,
            },
            { title: t('scheduler.lastRun'), key: 'lastrun',
              // ok/failed first by status, then newest run; never-run rows sort last.
              sorter: (a: SchedulerJob, b: SchedulerJob) =>
                (a.lastrun ?? '').localeCompare(b.lastrun ?? ''),
              render: (_: unknown, j: SchedulerJob) =>
                j.lastcheck === null ? (
                  <Text type="secondary">{t('scheduler.never')}</Text>
                ) : (
                  <Space size={6}>
                    <Tag color={j.lastcheck ? 'success' : 'error'} style={{ margin: 0 }}>
                      {j.lastcheck ? t('scheduler.okLower') : t('scheduler.failedLower')}
                    </Tag>
                    <Text type="secondary" style={{ fontSize: 12 }}>{j.lastrun ?? ''}</Text>
                  </Space>
                ),
            },
            { title: t('common.actions'), key: 'actions', width: 140,
              render: (_: unknown, j: SchedulerJob) => (
                <Space>
                  <Tooltip title={t('scheduler.runNow')}>
                    <Button size="small" icon={<CaretRightOutlined />} onClick={() => handleRunNow(j)} />
                  </Tooltip>
                  <Button
                    size="small"
                    icon={<EditOutlined />}
                    onClick={() => {
                      setEditJob(j);
                      setFormOpen(true);
                    }}
                  />
                  <Button size="small" danger icon={<DeleteOutlined />} onClick={() => handleDelete([j.id])} />
                </Space>
              ),
            },
          ]}
        />
              </>
            ),
          },
          { key: 'runs',
            label: (
              <Space size={6}>
                {t('scheduler.runsTab')}
                {anyRunning && <Tag color="processing" style={{ margin: 0 }}>{t('scheduler.live')}</Tag>}
              </Space>
            ),
            children: (
              <>
                <Space style={{ marginBottom: 12 }}>
            <Select
              placeholder={t('scheduler.allJobs')}
              style={{ width: 240 }}
              size="small"
              allowClear
              value={runJobFilter}
              onChange={(v) => setRunJobFilter(v ?? null)}
              options={jobs.map((j) => ({ label: j.name, value: j.id }))}
            />
            <Select
              placeholder={t('scheduler.allStatuses')}
              style={{ width: 140 }}
              size="small"
              allowClear
              value={runStatusFilter}
              onChange={(v) => setRunStatusFilter(v ?? null)}
              options={RUN_STATUSES.map((s) => ({ label: s, value: s }))}
            />
                </Space>
                <Table
          dataSource={runs}
          rowKey="uuid"
          size="small"
          pagination={{ pageSize: 25 }}
          loading={runsQuery.isLoading}
          locale={{ emptyText: t('scheduler.noRuns') }}
          columns={[
            { title: t('scheduler.colJob'), key: 'job',
              render: (_: unknown, r: SchedulerRun) => jobById.get(r.job)?.name ?? `#${r.job}`,
            },
            { title: t('common.status'), key: 'status',
              render: (_: unknown, r: SchedulerRun) => (
                <Space size={4}>
                  <Tag color={RUN_STATUS_COLOR[r.status]} style={{ margin: 0 }}>{r.status}</Tag>
                  {r.stale && (
                    <Tooltip title={t('scheduler.staleTip')}>
                      <Tag color="orange" style={{ margin: 0 }}>{t('scheduler.staleTag')}</Tag>
                    </Tooltip>
                  )}
                </Space>
              ),
            },
            { title: t('scheduler.colStarted'), dataIndex: 'started_at', key: 'started' },
            { title: t('scheduler.colFinished'), dataIndex: 'finished_at', key: 'finished',
              render: (v: string | null) => v ?? '—',
            },
            { title: t('scheduler.startedBy'), dataIndex: 'name', key: 'by',
              render: (v: string | null) => v ?? '—',
            },
            { title: t('common.actions'), key: 'actions', width: 120,
              render: (_: unknown, r: SchedulerRun) => (
                <Space>
                  <Button size="small" onClick={() => setDetailRun(r)}>
                    {t('scheduler.details')}
                  </Button>
                  {r.status === 'running' && (
                    <Tooltip title={t('scheduler.stopRun')}>
                      <Button
                        size="small"
                        danger
                        icon={<StopOutlined />}
                        loading={stopping === r.uuid}
                        onClick={() => handleStop(r)}
                      />
                    </Tooltip>
                  )}
                </Space>
              ),
            },
          ]}
        />
              </>
            ),
          },
        ]}
      />

      <JobFormDrawer
        open={formOpen}
        job={editJob}
        schemas={schemas}
        supportsSortby={supportsSortby}
        saving={saving}
        onSave={handleSave}
        onClose={() => {
          setFormOpen(false);
          setEditJob(null);
        }}
      />

      <Drawer
        title={detailRun ? t('scheduler.runTitle', { id: detailRun.uuid.slice(0, 8) }) : ''}
        open={detailRun !== null}
        onClose={() => setDetailRun(null)}
        width={560}
      >
        {shownRun && (
          <Space direction="vertical" style={{ width: '100%' }}>
            <Descriptions size="small" column={2}>
              <Descriptions.Item label={t('scheduler.colJob')}>
                {/* i18n-ignore */}
                {jobById.get(shownRun.job)?.name ?? `#${shownRun.job}`}
              </Descriptions.Item>
              <Descriptions.Item label={t('common.status')}>
                <Tag color={RUN_STATUS_COLOR[shownRun.status]}>{shownRun.status}</Tag>
              </Descriptions.Item>
              <Descriptions.Item label={t('scheduler.colStarted')}>{shownRun.started_at}</Descriptions.Item>
              <Descriptions.Item label={t('scheduler.colFinished')}>{shownRun.finished_at ?? '—'}</Descriptions.Item>
              <Descriptions.Item label={t('scheduler.heartbeat')}>{shownRun.heartbeat ?? '—'}</Descriptions.Item>
              <Descriptions.Item label={t('scheduler.hostPid')}>
                {/* i18n-ignore */}
                {`${shownRun.host ?? '—'} / ${shownRun.pid}`}
              </Descriptions.Item>
              <Descriptions.Item label={t('scheduler.startedBy')} span={2}>{shownRun.name ?? '—'}</Descriptions.Item>
            </Descriptions>
            {shownRun.exit_reason && (
              <Alert type={shownRun.status === 'failed' ? 'error' : 'info'} showIcon message={shownRun.exit_reason} />
            )}
            {runLog !== null && (
              <>
                <Text strong>{t('scheduler.log')}</Text>
                <pre style={{ fontSize: 12, maxHeight: 360, overflow: 'auto', margin: 0, whiteSpace: 'pre-wrap' }}>
                  {runLog}
                </pre>
              </>
            )}
          </Space>
        )}
      </Drawer>
    </div>
  );
}

