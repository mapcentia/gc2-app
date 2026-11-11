import ts from 'typescript';

export interface Finding {
  file: string;
  line: number;
  text: string;
}

const TEXT_NAMES = new Set([
  'title', 'label', 'placeholder', 'okText', 'cancelText', 'description', 'tooltip', 'extra',
  'message', 'help', 'content', 'alt', 'aria-label', 'emptyText', 'addonBefore', 'addonAfter',
]);
const MESSAGE_METHODS = new Set(['success', 'error', 'warning', 'info', 'loading']);
const IGNORE = /i18n-ignore/;
/** A line that consists solely of an ignore comment. */
const OWN_LINE_IGNORE = /^\s*(\/\/\s*i18n-ignore\b.*|\{\/\*\s*i18n-ignore\b.*\*\/\}|\/\*\s*i18n-ignore\b.*\*\/)\s*$/;
const HAS_WORDS = /\p{L}{2}/u;

/** String and template literals that can end up as displayed text in `node`, looking through ?:, ||, &&, ??. */
function literalsIn(node: ts.Expression): ts.Expression[] {
  if (ts.isParenthesizedExpression(node) || ts.isAsExpression(node) || ts.isNonNullExpression(node)) {
    return literalsIn(node.expression);
  }
  if (ts.isConditionalExpression(node)) return [...literalsIn(node.whenTrue), ...literalsIn(node.whenFalse)];
  if (ts.isBinaryExpression(node)) {
    const k = node.operatorToken.kind;
    if (
      k === ts.SyntaxKind.BarBarToken ||
      k === ts.SyntaxKind.QuestionQuestionToken ||
      k === ts.SyntaxKind.AmpersandAmpersandToken
    ) {
      return [...literalsIn(node.left), ...literalsIn(node.right)];
    }
    return [];
  }
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node) || ts.isTemplateExpression(node)) {
    return [node];
  }
  return [];
}

export function findHardcoded(source: string, fileName: string): Finding[] {
  const sf = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const lines = source.split(/\r?\n/);
  const findings: Finding[] = [];
  const seen = new Set<number>();

  const report = (pos: number, text: string) => {
    if (seen.has(pos) || !HAS_WORDS.test(text)) return;
    const line = sf.getLineAndCharacterOfPosition(pos).line; // 0-based
    if (IGNORE.test(lines[line] ?? '') || (line > 0 && OWN_LINE_IGNORE.test(lines[line - 1] ?? ''))) return;
    seen.add(pos);
    findings.push({ file: fileName, line: line + 1, text });
  };

  const reportExpr = (expr: ts.Expression | undefined) => {
    if (!expr) return;
    for (const lit of literalsIn(expr)) {
      const text = ts.isTemplateExpression(lit) ? lit.getText(sf).slice(1, -1) : (lit as ts.StringLiteral).text;
      report(lit.getStart(sf), text);
    }
  };

  const visit = (node: ts.Node) => {
    if (ts.isJsxText(node)) {
      const text = node.text.replace(/\s+/g, ' ').trim();
      // getStart() already skips the leading whitespace of the text.
      if (text) report(node.getStart(sf), text);
    } else if (ts.isJsxExpression(node) && (ts.isJsxElement(node.parent) || ts.isJsxFragment(node.parent))) {
      reportExpr(node.expression);
    } else if (ts.isJsxAttribute(node) && TEXT_NAMES.has(node.name.getText(sf)) && node.initializer) {
      if (ts.isStringLiteral(node.initializer)) reportExpr(node.initializer);
      else if (ts.isJsxExpression(node.initializer)) reportExpr(node.initializer.expression);
    } else if (ts.isPropertyAssignment(node)) {
      const n = node.name;
      const name = ts.isIdentifier(n) || ts.isStringLiteral(n) ? n.text : undefined;
      if (name && TEXT_NAMES.has(name)) reportExpr(node.initializer);
    } else if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      ts.isIdentifier(node.expression.expression) &&
      node.expression.expression.text === 'message' &&
      MESSAGE_METHODS.has(node.expression.name.text)
    ) {
      reportExpr(node.arguments[0]);
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);

  return findings.sort((a, b) => a.line - b.line);
}
