import { ExclamationCircleOutlined } from '@ant-design/icons';
import i18n from '../i18n';
import { modal } from '../utils/modal';

export function confirmDelete(name: string, onOk: () => Promise<void> | void) {
  modal.confirm({
    title: i18n.t('components.confirmDeleteTitle'),
    icon: <ExclamationCircleOutlined />,
    content: i18n.t('components.confirmDeleteContent', { name }),
    okText: i18n.t('common.delete'),
    okType: 'danger',
    onOk,
  });
}
