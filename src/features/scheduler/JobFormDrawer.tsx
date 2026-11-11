import { Button, Checkbox, Drawer, Form, Input, InputNumber, Select, Space, Switch, Typography } from 'antd';
import type { SchedulerJob, SchedulerJobInput, SnapshotFormat } from '@mapcentia/gc2-sdk';
import { useEffect, useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import i18n from '../../i18n';

const { Text } = Typography;

const GEOMETRY_TYPES = [
  'AUTO', 'POINT', 'LINESTRING', 'POLYGON', 'MULTIPOINT', 'MULTILINESTRING', 'MULTIPOLYGON', 'GEOMETRY',
];

const SNAPSHOT_FORMATS: SnapshotFormat[] = ['parquet', 'flatgeobuf'];

const CRON_PRESETS: { label: string; value: string }[] = [
  { label: i18n.t('scheduler.presetHourly'), value: '0 * * * *' },
  { label: i18n.t('scheduler.presetDaily'), value: '0 2 * * *' },
  { label: i18n.t('scheduler.presetWeekly'), value: '0 3 * * 1' },
  { label: i18n.t('scheduler.presetMonthly'), value: '0 4 1 * *' },
];

/** 5 whitespace-separated cron fields; the server does the real validation. */
const CRON_SHAPE = /^\S+\s+\S+\s+\S+\s+\S+\s+\S+$/;

/**
 * Mirror of GC2's Model::toAscii(name, null, "_"): transliterate to ASCII,
 * drop everything but letters/digits and \/ _ | + space -, lower-case, trim
 * leading/trailing "-", collapse separator runs to one "_".
 */
export function normalizeJobName(name: string): string {
  return name
    .replace(/[æÆ]/g, 'ae')
    .replace(/[øØ]/g, 'oe')
    .replace(/[åÅ]/g, 'aa')
    .replace(/ß/g, 'ss')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z0-9/_|+ -]/g, '')
    .toLowerCase()
    .replace(/^-+|-+$/g, '')
    .replace(/[/_|+ -]+/g, '_');
}

export default function JobFormDrawer({
  open,
  job,
  schemas,
  supportsSortby,
  saving,
  onSave,
  onClose,
}: {
  open: boolean;
  /** null = create. */
  job: SchedulerJob | null;
  schemas: string[];
  /** Whether the server knows use_sortby; older servers reject it as an unknown field. */
  supportsSortby: boolean;
  saving: boolean;
  onSave: (values: SchedulerJobInput) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [form] = Form.useForm();
  const [preset, setPreset] = useState<string | undefined>();
  const nameValue = Form.useWatch('name', form) as string | undefined;
  const snapshotOn = Form.useWatch('snapshot', form) as boolean | undefined;

  useEffect(() => {
    if (!open) return;
    setPreset(undefined);
    if (job) {
      form.setFieldsValue(job);
    } else {
      form.resetFields();
    }
  }, [open, job, form]);

  return (
    <Drawer
      title={job ? t('scheduler.editJobTitle', { name: job.name }) : t('scheduler.createJobTitle')}
      open={open}
      onClose={onClose}
      width={560}
      extra={
        <Button
          type="primary"
          loading={saving}
          onClick={async () => {
            const values = (await form.validateFields()) as SchedulerJobInput;
            // Empty selection means "server default" — the wire value is null, never [].
            values.snapshot_formats = values.snapshot_formats?.length ? values.snapshot_formats : null;
            if (!supportsSortby) delete values.use_sortby;
            onSave(values);
          }}
        >
          {t('common.save')}
        </Button>
      }
    >
      <Form
        form={form}
        layout="vertical"
        initialValues={{
          epsg: 4326,
          type: 'AUTO',
          encoding: 'UTF8',
          delete_append: false,
          download_schema: true,
          active: true,
          snapshot: false,
          use_sortby: true,
        }}
      >
        <Form.Item
          name="name"
          label={t('common.name')}
          rules={[{ required: true }]}
          extra={
            nameValue && normalizeJobName(nameValue) !== nameValue ? (
              <Trans
                i18nKey="scheduler.nameNormalized"
                values={{ name: normalizeJobName(nameValue) }}
                components={{ code: <Text code /> }}
              />
            ) : undefined
          }
        >
          <Input />
        </Form.Item>
        <Form.Item name="schema" label={t('scheduler.targetSchema')} rules={[{ required: true }]}>
          <Select showSearch options={schemas.map((s) => ({ label: s, value: s }))} />
        </Form.Item>
        <Form.Item
          name="url"
          label={t('scheduler.sourceUrl')}
          rules={[{ required: true }]}
          extra={t('scheduler.sourceUrlHelp')}
        >
          <Input
            // i18n-ignore
            placeholder="https://example.com/data.geojson"
          />
        </Form.Item>
        <Form.Item label={t('scheduler.schedule')} required style={{ marginBottom: 0 }}>
          <Space.Compact style={{ width: '100%' }}>
            <Select
              placeholder={t('scheduler.preset')}
              style={{ width: 200 }}
              allowClear
              value={preset}
              options={CRON_PRESETS}
              onChange={(v) => {
                setPreset(v);
                if (v) form.setFieldsValue({ schedule: v });
              }}
            />
            <Form.Item
              name="schedule"
              noStyle
              rules={[
                { required: true, message: t('scheduler.scheduleRequired') },
                { pattern: CRON_SHAPE, message: t('scheduler.cronShape') },
              ]}
            >
              <Input
                // i18n-ignore
                placeholder="0 3 * * *"
                onChange={() => setPreset(undefined)}
              />
            </Form.Item>
          </Space.Compact>
          <Text type="secondary" style={{ fontSize: 12 }}>
            {t('scheduler.cronHelp')}
          </Text>
        </Form.Item>
        <Space style={{ marginTop: 16 }} wrap>
          <Form.Item
            name="epsg"
            // i18n-ignore
            label="EPSG"
          >
            <InputNumber min={1} style={{ width: 120 }} />
          </Form.Item>
          <Form.Item name="type" label={t('scheduler.geometryType')}>
            <Select style={{ width: 180 }} options={GEOMETRY_TYPES.map((g) => ({ label: g, value: g }))} />
          </Form.Item>
          <Form.Item name="encoding" label={t('scheduler.encoding')}>
            <Select style={{ width: 120 }} options={['UTF8', 'LATIN1'].map((e) => ({ label: e, value: e }))} />
          </Form.Item>
        </Space>
        <Space wrap size="large">
          <Form.Item
            name="delete_append"
            label={t('scheduler.append')}
            valuePropName="checked"
            tooltip={t('scheduler.appendTip')}
          >
            <Switch />
          </Form.Item>
          <Form.Item
            name="download_schema"
            label={t('scheduler.downloadSchema')}
            valuePropName="checked"
            tooltip={t('scheduler.downloadSchemaTip')}
          >
            <Switch />
          </Form.Item>
          {supportsSortby && (
            <Form.Item
              name="use_sortby"
              label={t('scheduler.sortPages')}
              valuePropName="checked"
              tooltip={t('scheduler.sortPagesTip')}
            >
              <Switch />
            </Form.Item>
          )}
          <Form.Item name="active" label={t('scheduler.active')} valuePropName="checked">
            <Switch />
          </Form.Item>
          <Form.Item
            name="snapshot"
            label={t('scheduler.snapshot')}
            valuePropName="checked"
            tooltip={t('scheduler.snapshotTip')}
          >
            <Switch />
          </Form.Item>
          {snapshotOn && (
            <Form.Item
              name="snapshot_formats"
              label={t('scheduler.snapshotFormats')}
              tooltip={t('scheduler.snapshotFormatsTip')}
            >
              <Checkbox.Group options={SNAPSHOT_FORMATS.map((f) => ({ label: f, value: f }))} />
            </Form.Item>
          )}
        </Space>
        <Form.Item name="presql" label={t('scheduler.presql')} extra={t('scheduler.presqlHelp')}>
          <Input.TextArea rows={2} />
        </Form.Item>
        <Form.Item name="postsql" label={t('scheduler.postsql')} extra={t('scheduler.postsqlHelp')}>
          <Input.TextArea rows={2} />
        </Form.Item>
        <Form.Item name="extra" label={t('scheduler.extraArgs')}>
          <Input
            // i18n-ignore
            placeholder="-nlt PROMOTE_TO_MULTI …"
          />
        </Form.Item>
      </Form>
    </Drawer>
  );
}
