import { describe, it, expect } from 'vitest';
import { findHardcoded } from './findHardcoded';

const texts = (src: string) => findHardcoded(src, 'x.tsx').map((f) => f.text);

describe('findHardcoded', () => {
  it('flags JSX text', () => {
    const f = findHardcoded('const a = <Button>Save</Button>;', 'x.tsx');
    expect(f).toHaveLength(1);
    expect(f[0]).toEqual({ file: 'x.tsx', line: 1, text: 'Save' });
  });

  it('ignores JSX text without two consecutive letters', () => {
    expect(texts('const a = <div><span> — </span><b>{x}</b></div>;')).toEqual([]);
  });

  it.each([
    'title', 'label', 'placeholder', 'okText', 'cancelText', 'description', 'tooltip', 'extra',
    'message', 'help', 'content', 'alt', 'aria-label', 'emptyText', 'addonBefore', 'addonAfter',
  ])('flags JSX attribute %s (string and expression)', (name) => {
    expect(texts(`const a = <X ${name}="Hello" />;`)).toEqual(['Hello']);
    expect(texts(`const a = <X ${name}={'Hello'} />;`)).toEqual(['Hello']);
    expect(texts(`const a = <X ${name}={\`Hello\`} />;`)).toEqual(['Hello']);
  });

  it('flags object-literal properties with string values', () => {
    expect(texts(`const c = { title: 'Name', dataIndex: 'name' };`)).toEqual(['Name']);
    expect(texts(`const c = { 'label': "Name" };`)).toEqual(['Name']);
  });

  it.each(['success', 'error', 'warning', 'info', 'loading'])('flags message.%s first argument', (m) => {
    expect(texts(`message.${m}('Saved');`)).toEqual(['Saved']);
    expect(texts(`message.${m}(\`Saved\`);`)).toEqual(['Saved']);
  });

  it('does not flag message.* with a non-string first argument', () => {
    expect(texts('message.error(e.message); message.open(\'Saved\');')).toEqual([]);
  });

  it('looks inside conditionals and logical expressions', () => {
    expect(texts(`const a = <X title={ok ? 'Yes' : 'No'} />;`)).toEqual(['Yes', 'No']);
    expect(texts(`const a = <X title={a || 'Fallback'} />;`)).toEqual(['Fallback']);
    expect(texts(`const c = { label: a ? 'Yes' : t('x') };`)).toEqual(['Yes']);
    expect(texts(`message.error(a || 'Failed');`)).toEqual(['Failed']);
    expect(texts(`const a = <p>{ok ? 'Yes' : 'No'}</p>;`)).toEqual(['Yes', 'No']);
  });

  it('does not flag t() calls or non-text props', () => {
    expect(
      texts(`const a = <X title={t('a.b')} key="abc" dataIndex="name" className="foo bar" type="primary" value="Value" />;
const c = { key: 'name', dataIndex: 'name', type: 'text', value: 'Value', label: t('a') };`),
    ).toEqual([]);
  });

  it('honours i18n-ignore on the same line and the line above', () => {
    expect(texts(`const a = <X title="Schemas" />; // i18n-ignore`)).toEqual([]);
    expect(texts(`// i18n-ignore\nconst a = <X title="Schemas" />;`)).toEqual([]);
    expect(texts(`const a = <X title="Schemas" />;\n// i18n-ignore`)).toEqual(['Schemas']);
    expect(texts(`<div>\n  {/* i18n-ignore */}\n  Schemas\n</div>`)).toEqual([]);
  });

  it('flags template literals with substitutions', () => {
    expect(texts('const a = <X title={`Delete ${name}?`} />;')).toEqual(['Delete ${name}?']);
  });

  it('reports 1-based line numbers', () => {
    expect(findHardcoded('const a = (\n  <div>\n    Hello\n  </div>\n);', 'x.tsx')[0].line).toBe(3);
  });
});
