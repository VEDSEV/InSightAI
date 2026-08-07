// @vitest-environment node

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, extname, isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import ts from "typescript";
import { describe, it } from "vitest";

const REPOSITORY_ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const SOURCE_ROOT = resolve(REPOSITORY_ROOT, "src");
const ANALYTICS_ROOT = resolve(SOURCE_ROOT, "analytics");
const APP_ROOT = resolve(SOURCE_ROOT, "app");
const COMPONENTS_ROOT = resolve(SOURCE_ROOT, "components");
const DASHBOARD_ROOT = resolve(SOURCE_ROOT, "features", "dashboard");
const SAMPLE_DATA_ROOT = resolve(REPOSITORY_ROOT, "data", "sample");
const SAMPLE_GENERATOR_ROOT = resolve(REPOSITORY_ROOT, "scripts", "sample-data");

const CODE_EXTENSIONS = new Set([".cjs", ".cts", ".js", ".jsx", ".mjs", ".mts", ".ts", ".tsx"]);

const EXCLUDED_DIRECTORIES = new Set([
  ".agents",
  ".codex",
  ".git",
  ".next",
  ".pnpm-store",
  "build",
  "coverage",
  "dist",
  "node_modules",
  "out",
]);

const METRIC_WORDS = new Set([
  "cost",
  "discount",
  "margin",
  "profit",
  "quantity",
  "revenue",
  "spend",
]);

const ARITHMETIC_OPERATORS = new Set<ts.SyntaxKind>([
  ts.SyntaxKind.AsteriskAsteriskToken,
  ts.SyntaxKind.AsteriskEqualsToken,
  ts.SyntaxKind.AsteriskToken,
  ts.SyntaxKind.MinusEqualsToken,
  ts.SyntaxKind.MinusToken,
  ts.SyntaxKind.PercentEqualsToken,
  ts.SyntaxKind.PercentToken,
  ts.SyntaxKind.PlusEqualsToken,
  ts.SyntaxKind.PlusToken,
  ts.SyntaxKind.SlashEqualsToken,
  ts.SyntaxKind.SlashToken,
]);

const ASSIGNMENT_OPERATORS = new Set<ts.SyntaxKind>([
  ts.SyntaxKind.AsteriskAsteriskEqualsToken,
  ts.SyntaxKind.AsteriskEqualsToken,
  ts.SyntaxKind.AmpersandAmpersandEqualsToken,
  ts.SyntaxKind.AmpersandEqualsToken,
  ts.SyntaxKind.BarBarEqualsToken,
  ts.SyntaxKind.BarEqualsToken,
  ts.SyntaxKind.CaretEqualsToken,
  ts.SyntaxKind.EqualsToken,
  ts.SyntaxKind.GreaterThanGreaterThanEqualsToken,
  ts.SyntaxKind.GreaterThanGreaterThanGreaterThanEqualsToken,
  ts.SyntaxKind.LessThanLessThanEqualsToken,
  ts.SyntaxKind.MinusEqualsToken,
  ts.SyntaxKind.PercentEqualsToken,
  ts.SyntaxKind.PlusEqualsToken,
  ts.SyntaxKind.QuestionQuestionEqualsToken,
  ts.SyntaxKind.SlashEqualsToken,
]);

type ModuleReference = {
  readonly specifier: string;
  readonly node: ts.Node;
};

function collectCodeFiles(directory: string): readonly string[] {
  if (!existsSync(directory)) return [];

  return readdirSync(directory, { withFileTypes: true })
    .flatMap((entry) => {
      const path = resolve(directory, entry.name);
      if (entry.isDirectory()) {
        return EXCLUDED_DIRECTORIES.has(entry.name) ? [] : collectCodeFiles(path);
      }
      return entry.isFile() && CODE_EXTENSIONS.has(extname(entry.name).toLowerCase()) ? [path] : [];
    })
    .sort((left, right) => left.localeCompare(right));
}

function scriptKind(file: string): ts.ScriptKind {
  switch (extname(file).toLowerCase()) {
    case ".js":
    case ".cjs":
    case ".mjs":
      return ts.ScriptKind.JS;
    case ".jsx":
      return ts.ScriptKind.JSX;
    case ".tsx":
      return ts.ScriptKind.TSX;
    default:
      return ts.ScriptKind.TS;
  }
}

function parseSourceFile(file: string): ts.SourceFile {
  return ts.createSourceFile(
    file,
    readFileSync(file, "utf8"),
    ts.ScriptTarget.Latest,
    true,
    scriptKind(file),
  );
}

function collectModuleReferences(sourceFile: ts.SourceFile): readonly ModuleReference[] {
  const references: ModuleReference[] = [];
  const add = (node: ts.Node | undefined): void => {
    if (node && ts.isStringLiteralLike(node)) {
      references.push({ specifier: node.text, node });
    }
  };

  const visit = (node: ts.Node): void => {
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
      add(node.moduleSpecifier);
    } else if (
      ts.isImportEqualsDeclaration(node) &&
      ts.isExternalModuleReference(node.moduleReference)
    ) {
      add(node.moduleReference.expression);
    } else if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument)) {
      add(node.argument.literal);
    } else if (ts.isCallExpression(node) && node.arguments.length > 0) {
      const isDynamicImport = node.expression.kind === ts.SyntaxKind.ImportKeyword;
      const isRequire = ts.isIdentifier(node.expression) && node.expression.text === "require";
      if (isDynamicImport || isRequire) add(node.arguments[0]);
    }
    ts.forEachChild(node, visit);
  };

  visit(sourceFile);
  return references;
}

function cleanSpecifier(specifier: string): string {
  return specifier.split(/[?#]/u, 1)[0].replaceAll("\\", "/").replace(/\/+$/u, "");
}

function resolveLocalSpecifier(importer: string, specifier: string): string | undefined {
  const clean = cleanSpecifier(specifier);
  if (clean.startsWith("@/")) return resolve(SOURCE_ROOT, clean.slice(2));
  if (clean.startsWith("./") || clean.startsWith("../")) {
    return resolve(dirname(importer), clean);
  }
  if (isAbsolute(clean)) return resolve(clean);
  if (/^(?:data|scripts|src|tests)\//u.test(clean)) return resolve(REPOSITORY_ROOT, clean);
  return undefined;
}

function isWithin(candidate: string, directory: string): boolean {
  const pathFromDirectory = relative(directory, candidate);
  return (
    pathFromDirectory === "" ||
    (!pathFromDirectory.startsWith("..") && !isAbsolute(pathFromDirectory))
  );
}

function normalizedPath(path: string): string {
  return resolve(path).replaceAll("\\", "/").replace(/\/+$/u, "").toLowerCase();
}

function withoutCodeExtension(path: string): string {
  return normalizedPath(path).replace(/(?:\.d)?\.(?:[cm]?[jt]sx?)$/u, "");
}

function referencesDirectory(importer: string, specifier: string, directory: string): boolean {
  const target = resolveLocalSpecifier(importer, specifier);
  return Boolean(target && isWithin(target, directory));
}

function referencesAnalytics(importer: string, specifier: string): boolean {
  return referencesDirectory(importer, specifier, ANALYTICS_ROOT);
}

function referencesPublicAnalyticsEntry(importer: string, specifier: string): boolean {
  const target = resolveLocalSpecifier(importer, specifier);
  if (!target) return false;

  const normalizedTarget = withoutCodeExtension(target);
  const normalizedRoot = normalizedPath(ANALYTICS_ROOT);
  return normalizedTarget === normalizedRoot || normalizedTarget === `${normalizedRoot}/index`;
}

function referencesPhaseTwoData(importer: string, specifier: string): boolean {
  return referencesDirectory(importer, specifier, SAMPLE_DATA_ROOT);
}

function referencesSampleGenerator(importer: string, specifier: string): boolean {
  const normalizedSpecifier = cleanSpecifier(specifier).toLowerCase();
  const target = resolveLocalSpecifier(importer, specifier);
  return (
    Boolean(target && isWithin(target, SAMPLE_GENERATOR_ROOT)) ||
    /(?:^|\/)scripts\/(?:generate|verify)-sample-data(?:\.[cm]?[jt]s)?$/u.test(normalizedSpecifier)
  );
}

function isReactOrNextImport(specifier: string): boolean {
  return /^(?:next|react|react-dom)(?:\/|$)/u.test(cleanSpecifier(specifier).toLowerCase());
}

function location(sourceFile: ts.SourceFile, node: ts.Node): string {
  const start = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
  return `${relative(REPOSITORY_ROOT, sourceFile.fileName).replaceAll("\\", "/")}:${start.line + 1}`;
}

function assertNoViolations(violations: readonly string[]): void {
  const unique = [...new Set(violations)].sort((left, right) => left.localeCompare(right));
  if (unique.length > 0) {
    throw new Error(`Architecture boundary violations:\n- ${unique.join("\n- ")}`);
  }
}

function hasMetricWord(name: string): boolean {
  const words = name
    .replace(/([a-z\d])([A-Z])/gu, "$1 $2")
    .toLowerCase()
    .split(/[^a-z\d]+/u)
    .filter(Boolean);
  return words.some((word) => METRIC_WORDS.has(word));
}

function containsMetricReference(node: ts.Node): boolean {
  let found = false;
  const visit = (child: ts.Node): void => {
    if (found) return;
    if (ts.isIdentifier(child) && hasMetricWord(child.text)) {
      found = true;
      return;
    }
    if (
      ts.isElementAccessExpression(child) &&
      child.argumentExpression &&
      ts.isStringLiteralLike(child.argumentExpression) &&
      hasMetricWord(child.argumentExpression.text)
    ) {
      found = true;
      return;
    }
    ts.forEachChild(child, visit);
  };
  visit(node);
  return found;
}

function hasMetricAssignmentContext(node: ts.Node): boolean {
  let current = node;
  while (current.parent) {
    const parent = current.parent;
    if (ts.isVariableDeclaration(parent) && parent.initializer === current) {
      return containsMetricReference(parent.name);
    }
    if (ts.isPropertyAssignment(parent) && parent.initializer === current) {
      return containsMetricReference(parent.name);
    }
    if (
      ts.isBinaryExpression(parent) &&
      parent.right === current &&
      ASSIGNMENT_OPERATORS.has(parent.operatorToken.kind)
    ) {
      return containsMetricReference(parent.left);
    }
    current = parent;
  }
  return false;
}

function isClearlyStringConcatenation(node: ts.BinaryExpression): boolean {
  return (
    node.operatorToken.kind === ts.SyntaxKind.PlusToken &&
    (ts.isStringLiteralLike(node.left) || ts.isStringLiteralLike(node.right))
  );
}

function isReduceCall(node: ts.CallExpression): boolean {
  if (ts.isPropertyAccessExpression(node.expression)) {
    return node.expression.name.text === "reduce";
  }
  return (
    ts.isElementAccessExpression(node.expression) &&
    Boolean(
      node.expression.argumentExpression &&
      ts.isStringLiteralLike(node.expression.argumentExpression) &&
      node.expression.argumentExpression.text === "reduce",
    )
  );
}

function formulaViolations(file: string): readonly string[] {
  const sourceFile = parseSourceFile(file);
  const violations: string[] = [];

  const report = (node: ts.Node, description: string): void => {
    const expression = node.getText(sourceFile).replace(/\s+/gu, " ").slice(0, 160);
    violations.push(`${location(sourceFile, node)} ${description}: ${expression}`);
  };

  const visit = (node: ts.Node): void => {
    if (
      ts.isBinaryExpression(node) &&
      ARITHMETIC_OPERATORS.has(node.operatorToken.kind) &&
      !isClearlyStringConcatenation(node) &&
      (containsMetricReference(node) || hasMetricAssignmentContext(node))
    ) {
      report(node, "performs dashboard arithmetic over a business-metric value");
    }

    if (
      ts.isCallExpression(node) &&
      isReduceCall(node) &&
      (containsMetricReference(node) || hasMetricAssignmentContext(node))
    ) {
      report(node, "reduces business-metric values inside the dashboard");
    }

    ts.forEachChild(node, visit);
  };

  visit(sourceFile);
  return violations;
}

describe("analytics architecture boundaries", () => {
  it("keeps the existing application and dashboard disconnected from analytics and Phase 2 tooling", () => {
    const violations: string[] = [];
    const uiFiles = [APP_ROOT, COMPONENTS_ROOT, DASHBOARD_ROOT].flatMap((root) =>
      collectCodeFiles(root),
    );

    for (const file of uiFiles) {
      const sourceFile = parseSourceFile(file);
      for (const reference of collectModuleReferences(sourceFile)) {
        const reasons = [
          referencesAnalytics(file, reference.specifier) ? "analytics" : undefined,
          referencesPhaseTwoData(file, reference.specifier) ? "Phase 2 sample data" : undefined,
          referencesSampleGenerator(file, reference.specifier)
            ? "Phase 2 generator/verifier"
            : undefined,
        ].filter((reason): reason is string => Boolean(reason));

        if (reasons.length > 0) {
          violations.push(
            `${location(sourceFile, reference.node)} imports ${reasons.join(
              ", ",
            )} through "${reference.specifier}"`,
          );
        }
      }
    }

    assertNoViolations(violations);
  });

  it("keeps analytics framework-independent and isolated from presentation and sample generation", () => {
    const violations: string[] = [];

    for (const file of collectCodeFiles(ANALYTICS_ROOT)) {
      const sourceFile = parseSourceFile(file);
      for (const reference of collectModuleReferences(sourceFile)) {
        const importsPresentation = [APP_ROOT, COMPONENTS_ROOT, DASHBOARD_ROOT].some((root) =>
          referencesDirectory(file, reference.specifier, root),
        );
        if (
          isReactOrNextImport(reference.specifier) ||
          importsPresentation ||
          referencesSampleGenerator(file, reference.specifier)
        ) {
          violations.push(
            `${location(sourceFile, reference.node)} imports forbidden framework, presentation, or generator code through "${reference.specifier}"`,
          );
        }
      }
    }

    assertNoViolations(violations);
  });

  it("allows code outside analytics to use only the public analytics entry point", () => {
    const violations: string[] = [];

    for (const file of collectCodeFiles(REPOSITORY_ROOT)) {
      if (isWithin(file, ANALYTICS_ROOT)) continue;
      const sourceFile = parseSourceFile(file);
      for (const reference of collectModuleReferences(sourceFile)) {
        if (
          referencesAnalytics(file, reference.specifier) &&
          !referencesPublicAnalyticsEntry(file, reference.specifier)
        ) {
          violations.push(
            `${location(sourceFile, reference.node)} bypasses src/analytics/index.ts through "${reference.specifier}"`,
          );
        }
      }
    }

    assertNoViolations(violations);
  });

  it("keeps authoritative reducer and metric arithmetic out of dashboard code", () => {
    assertNoViolations(collectCodeFiles(DASHBOARD_ROOT).flatMap(formulaViolations));
  });
});
