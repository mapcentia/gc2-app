import { useTranslation } from 'react-i18next';
import { Drawer, Form, Input, Select, Button } from 'antd';

interface Props {
  open: boolean;
  columns: string[];
  onOk: (values: any) => void;
  onCancel: () => void;
  saving?: boolean;
}

export default function ConstraintFormModal({ open, columns, onOk, onCancel, saving }: Props) {
  const { t } = useTranslation();
  const [form] = Form.useForm();
  const constraintType = Form.useWatch('constraint', form);

  const handleOk = async () => {
    const values = await form.validateFields();
    onOk(values);
  };

  return (
    <Drawer title={t('tables.addConstraint')} open={open} onClose={onCancel} width={480}
      extra={<Button type="primary" onClick={handleOk} loading={saving}>{t('common.save')}</Button>}
      afterOpenChange={(visible) => { if (!visible) form.resetFields(); }}>
      <Form form={form} layout="vertical" initialValues={{ constraint: 'primary' }}>
        <Form.Item name="constraint" label={t('common.type')} rules={[{ required: true }]}>
          <Select options={[
            // i18n-ignore
            { label: 'Primary Key', value: 'primary' },
            // i18n-ignore
            { label: 'Unique', value: 'unique' },
            // i18n-ignore
            { label: 'Foreign Key', value: 'foreign' },
            // i18n-ignore
            { label: 'Check', value: 'check' },
          ]} />
        </Form.Item>
        <Form.Item name="columns"
          // i18n-ignore
          label="Columns" rules={[{ required: true }]}>
          <Select mode="multiple" options={columns.map((c) => ({ label: c, value: c }))} />
        </Form.Item>
        {constraintType === 'foreign' && (
          <>
            <Form.Item name="referenced_table" label={t('tables.referencedTable')} rules={[{ required: true }]}>
              <Input
                // i18n-ignore
                placeholder="schema.table"
              />
            </Form.Item>
            <Form.Item name="referenced_columns" label={t('tables.referencedColumns')}>
              <Select mode="tags" />
            </Form.Item>
          </>
        )}
        {constraintType === 'check' && (
          <Form.Item name="check" label={t('tables.checkExpression')} rules={[{ required: true }]}>
            <Input.TextArea rows={2} />
          </Form.Item>
        )}
        <Form.Item name="name" label={t('tables.constraintName')}>
          <Input placeholder={t('tables.optional')} />
        </Form.Item>
      </Form>
    </Drawer>
  );
}
