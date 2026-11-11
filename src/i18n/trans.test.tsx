import { test, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { I18nextProvider, Trans } from 'react-i18next';
import i18n from './index';

test('<Trans> escapes interpolated values and keeps markup from the translation', () => {
  const html = renderToStaticMarkup(
    <I18nextProvider i18n={i18n}>
      <Trans
        i18nKey="ogc.schemaTilesetWarning"
        values={{ schema: '<b>x</b>&' }}
        components={{ code: <code /> }}
      />
    </I18nextProvider>,
  );
  expect(html).toContain('&lt;b&gt;x&lt;/b&gt;&amp;');
  expect(html).not.toContain('<b>x</b>');
  expect(html).toContain('<code>');
});
