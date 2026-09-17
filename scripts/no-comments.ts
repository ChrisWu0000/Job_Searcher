import { Glob } from "bun";

const projectRoot = new URL("..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const scanRoot = `${projectRoot}src`;
const exemptPathFragments = ["components/ui/"];

type Finding = { file: string; line: number; column: number; kind: "line" | "block" };

const REGEX_ALLOWED_BEFORE = new Set([
  "(",
  ",",
  "=",
  ":",
  "[",
  "!",
  "&",
  "|",
  "?",
  "{",
  "}",
  ";",
  "+",
  "-",
  "*",
  "%",
  "~",
  "^",
  "\n",
]);

const REGEX_ALLOWED_KEYWORDS = new Set([
  "return",
  "typeof",
  "instanceof",
  "in",
  "of",
  "new",
  "delete",
  "void",
  "throw",
  "case",
  "do",
  "else",
  "yield",
  "await",
]);

function previousSignificantIndex(source: string, index: number): number {
  let cursor = index - 1;
  while (cursor >= 0) {
    const character = source[cursor];
    if (character === undefined) return -1;
    if (character !== " " && character !== "\t" && character !== "\r") return cursor;
    cursor -= 1;
  }
  return -1;
}

function regexIsAllowedAt(source: string, index: number): boolean {
  const previousIndex = previousSignificantIndex(source, index);
  if (previousIndex < 0) return true;
  const previous = source[previousIndex];
  if (previous === undefined) return true;
  if (REGEX_ALLOWED_BEFORE.has(previous)) return true;
  if (!/[A-Za-z0-9_$]/.test(previous)) return false;
  let wordStart = previousIndex;
  while (wordStart >= 0) {
    const character = source[wordStart];
    if (character === undefined || !/[A-Za-z0-9_$]/.test(character)) break;
    wordStart -= 1;
  }
  return REGEX_ALLOWED_KEYWORDS.has(source.slice(wordStart + 1, previousIndex + 1));
}

function findComments(source: string): Finding[] {
  const findings: Finding[] = [];
  let line = 1;
  let lineStart = 0;
  let index = 0;

  const push = (kind: "line" | "block", at: number) => {
    findings.push({ file: "", line, column: at - lineStart + 1, kind });
  };

  while (index < source.length) {
    const character = source[index];
    if (character === undefined) break;
    const next = source[index + 1];

    if (character === "\n") {
      line += 1;
      index += 1;
      lineStart = index;
      continue;
    }

    if (character === "/" && next === "/") {
      push("line", index);
      while (index < source.length && source[index] !== "\n") index += 1;
      continue;
    }

    if (character === "/" && next === "*") {
      push("block", index);
      index += 2;
      while (index < source.length && !(source[index] === "*" && source[index + 1] === "/")) {
        if (source[index] === "\n") {
          line += 1;
          lineStart = index + 1;
        }
        index += 1;
      }
      index += 2;
      continue;
    }

    if (character === '"' || character === "'") {
      index += 1;
      while (index < source.length) {
        const inner = source[index];
        if (inner === "\\") {
          index += 2;
          continue;
        }
        if (inner === character) {
          index += 1;
          break;
        }
        if (inner === "\n") {
          line += 1;
          lineStart = index + 1;
        }
        index += 1;
      }
      continue;
    }

    if (character === "`") {
      index += 1;
      while (index < source.length) {
        const inner = source[index];
        if (inner === "\\") {
          index += 2;
          continue;
        }
        if (inner === "\n") {
          line += 1;
          lineStart = index + 1;
          index += 1;
          continue;
        }
        if (inner === "$" && source[index + 1] === "{") {
          index += 2;
          let braceDepth = 1;
          while (index < source.length && braceDepth > 0) {
            const expressionCharacter = source[index];
            if (expressionCharacter === "{") braceDepth += 1;
            else if (expressionCharacter === "}") braceDepth -= 1;
            else if (expressionCharacter === "\n") {
              line += 1;
              lineStart = index + 1;
            } else if (expressionCharacter === '"' || expressionCharacter === "'") {
              index += 1;
              while (index < source.length && source[index] !== expressionCharacter) {
                if (source[index] === "\\") index += 1;
                index += 1;
              }
            }
            index += 1;
          }
          continue;
        }
        if (inner === "`") {
          index += 1;
          break;
        }
        index += 1;
      }
      continue;
    }

    if (character === "/" && regexIsAllowedAt(source, index)) {
      let cursor = index + 1;
      let inClass = false;
      let terminated = false;
      while (cursor < source.length) {
        const inner = source[cursor];
        if (inner === undefined || inner === "\n") break;
        if (inner === "\\") {
          cursor += 2;
          continue;
        }
        if (inner === "[") inClass = true;
        else if (inner === "]") inClass = false;
        else if (inner === "/" && !inClass) {
          terminated = true;
          cursor += 1;
          break;
        }
        cursor += 1;
      }
      if (terminated) {
        index = cursor;
        continue;
      }
    }

    index += 1;
  }

  return findings;
}

const sourceGlob = new Glob("**/*.{ts,tsx,js,jsx,mts,cts}");
const violations: Finding[] = [];

for await (const relativePath of sourceGlob.scan({ cwd: scanRoot })) {
  const normalized = relativePath.split("\\").join("/");
  if (exemptPathFragments.some((fragment) => normalized.includes(fragment))) continue;
  const absolutePath = `${scanRoot}/${normalized}`;
  const source = await Bun.file(absolutePath).text();
  for (const finding of findComments(source)) {
    violations.push({ ...finding, file: `src/${normalized}` });
  }
}

if (violations.length > 0) {
  for (const violation of violations) {
    console.error(
      `${violation.file}:${violation.line}:${violation.column} ${violation.kind} comment`,
    );
  }
  console.error(`no-comments: ${violations.length} comment(s) found in src/`);
  process.exit(1);
}

console.log("no-comments: clean");
