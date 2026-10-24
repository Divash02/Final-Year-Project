/**
 * Lightweight syntax tokenizer for the Coding Lab editor.
 *
 * The editor renders a highlighted layer behind a transparent
 * textarea, so highlighting must be fast and allocation-light.
 * Each grammar family is one alternation regexp with named groups;
 * the group that matched decides the token type. The tokenizer is
 * deliberately conservative: unknown constructs fall through as
 * plain text rather than being mis-highlighted.
 */

export type GrammarFamily =
  | "python"
  | "c"
  | "java"
  | "javascript"
  | "typescript"
  | "csharp"
  | "php"
  | "go"
  | "rust"
  | "ruby"
  | "kotlin"
  | "swift"
  | "sql"
  | "html"
  | "css";

export type TokenType =
  | "keyword"
  | "string"
  | "comment"
  | "number"
  | "function"
  | "operator"
  | "property"
  | "tag"
  | "attr"
  | "variable"
  | "class"
  | "plain";

export interface Token {
  type: TokenType;
  value: string;
}

const C_EXTRA = new Set([
  "include", "define", "ifdef", "ifndef", "endif", "int", "long",
  "double", "float", "char", "unsigned", "signed", "short",
]);

const C_LIKE_KEYWORDS = new Set([
  "auto", "break", "case", "catch", "class", "const", "continue", "default",
  "delete", "do", "else", "enum", "extern", "final", "finally", "for", "goto",
  "if", "inline", "new", "private", "protected", "public", "return", "static",
  "struct", "switch", "this", "throw", "try", "typedef", "typeof", "using",
  "var", "void", "while",
]);

const JAVA_EXTRA = new Set([
  "abstract", "assert", "extends", "implements", "import", "instanceof",
  "interface", "module", "native", "package", "record", "sealed", "super",
  "synchronized", "throws", "transient", "volatile", "yield", "true", "false",
  "null", "int", "long", "double", "float", "char", "boolean", "byte", "short",
]);

const JAVASCRIPT_EXTRA = new Set([
  "await", "async", "export", "extends", "false", "import", "null", "of",
  "true", "undefined", "let", "from", "default",
]);

const TYPESCRIPT_EXTRA = new Set([...JAVASCRIPT_EXTRA, "any", "never", "unknown", "readonly"]);

const CSHARP_EXTRA = new Set([
  "abstract", "as", "base", "bool", "byte", "char", "checked", "decimal",
  "delegate", "event", "explicit", "external", "false", "fixed", "foreach",
  "implicit", "in", "internal", "is", "lock", "namespace", "null", "object",
  "operator", "out", "override", "params", "readonly", "ref", "sbyte",
  "sealed", "short", "stackalloc", "string", "struct", "true", "uint", "ulong",
  "unchecked", "unsafe", "ushort", "virtual",
]);

const GO_EXTRA = new Set([
  "chan", "defer", "fallthrough", "func", "go", "import", "interface", "map",
  "package", "range", "select", "type", "nil", "true", "false",
]);

const RUST_EXTRA = new Set([
  "as", "async", "await", "const", "crate", "dyn", "else", "enum", "extern",
  "false", "fn", "impl", "in", "let", "match", "mod", "move", "mut", "pub",
  "ref", "self", "Self", "static", "struct", "super", "trait", "true", "type",
  "unsafe", "use", "where",
]);

const KOTLIN_EXTRA = new Set([
  "abstract", "actual", "as", "async", "await", "by", "class", "companion",
  "const", "constructor", "data", "do", "dynamic", "else", "enum", "external",
  "false", "final", "fun", "if", "import", "in", "infix", "init", "inline",
  "internal", "interface", "is", "lateinit", "null", "object", "open", "operator",
  "out", "override", "package", "private", "protected", "public", "reified",
  "return", "sealed", "super", "suspend", "tailrec", "this", "throw", "true",
  "try", "typealias", "val", "var", "when",
]);

const SWIFT_EXTRA = new Set([
  "class", "deinit", "enum", "extension", "func", "import", "init", "inout",
  "internal", "let", "operator", "private", "protocol", "public", "static",
  "struct", "subscript", "typealias", "var", "true", "false", "nil", "self",
  "Self", "where",
]);

const PYTHON_KEYWORDS = new Set([
  "False", "None", "True", "and", "as", "assert", "async", "await", "break",
  "class", "continue", "def", "del", "elif", "else", "except", "finally",
  "for", "from", "global", "if", "import", "in", "is", "lambda", "nonlocal",
  "not", "or", "pass", "raise", "return", "try", "while", "with", "yield",
  "match", "case",
]);

const RUBY_KEYWORDS = new Set([
  "BEGIN", "END", "alias", "and", "begin", "break", "case", "class", "def",
  "defined?", "do", "else", "elsif", "end", "ensure", "false", "for", "if",
  "in", "module", "next", "nil", "not", "or", "redo", "rescue", "retry",
  "return", "self", "super", "then", "true", "undef", "unless", "until",
  "when", "while", "yield",
]);

const SQL_KEYWORDS = new Set([
  "ALTER", "AND", "AS", "ASC", "BEGIN", "BETWEEN", "BY", "CASE", "COMMIT",
  "CREATE", "CROSS", "DEFAULT", "DELETE", "DESC", "DISTINCT", "DROP", "ELSE",
  "END", "EXISTS", "FOREIGN", "FROM", "FULL", "GROUP", "HAVING", "IN",
  "INDEX", "INNER", "INSERT", "INTO", "IS", "JOIN", "LEFT", "LIKE", "LIMIT",
  "NOT", "NULL", "OFFSET", "ON", "OR", "ORDER", "OUTER", "PRIMARY", "REFERENCES",
  "RIGHT", "ROLLBACK", "SELECT", "SET", "TABLE", "THEN", "TRANSACTION",
  "UNION", "UPDATE", "VALUES", "VIEW", "WHEN", "WHERE",
]);

const RUBY_BUILTINS = new Set([
  "puts", "print", "p", "require", "require_relative", "raise", "attr_accessor",
  "attr_reader", "attr_writer", "gets", "chomp",
]);

const PYTHON_BUILTINS = new Set([
  "print", "input", "len", "range", "str", "int", "float", "list", "dict",
  "set", "tuple", "bool", "type", "enumerate", "zip", "map", "filter",
  "sorted", "sum", "min", "max", "abs", "open", "format", "isinstance",
]);

const PHP_KEYWORDS = new Set([
  "abstract", "array", "as", "break", "case", "catch", "class", "clone",
  "const", "continue", "declare", "default", "do", "echo", "else", "elseif",
  "empty", "enddeclare", "endfor", "endforeach", "endif", "endswitch",
  "endwhile", "enum", "extends", "final", "finally", "fn", "for", "foreach",
  "function", "global", "if", "implements", "include", "include_once",
  "instanceof", "insteadof", "interface", "isset", "list", "match", "namespace",
  "new", "print", "private", "protected", "public", "readonly", "require",
  "require_once", "return", "static", "switch", "throw", "trait", "try",
  "unset", "use", "while", "yield", "true", "false", "null",
]);

function cLikeKeywords(extra: Set<string>): Set<string> {
  const merged = new Set(C_LIKE_KEYWORDS);
  for (const keyword of extra) merged.add(keyword);
  return merged;
}

interface GrammarSpec {
  keywords: Set<string>;
  builtins?: Set<string>;
  commentPatterns: string;
  stringPatterns: string;
  numberPattern: string;
  extraPatterns?: string;
}

const NUMBER_PATTERN =
  "\\b0[xX][0-9a-fA-F]+\\b|\\b0[bB][01]+\\b|\\b\\d[\\d_]*(?:\\.\\d+)?(?:[eE][+-]?\\d+)?\\b";

const C_STYLE_STRINGS = String.raw`"(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*'|\`(?:\\.|[^\`\\])*\``;

const C_STYLE_COMMENTS = `\\/\\/[^\\n]*|\\/\\*[\\s\\S]*?(?:\\*\\/|$)`;

const GRAMMARS: Record<GrammarFamily, GrammarSpec> = {
  python: {
    keywords: PYTHON_KEYWORDS,
    builtins: PYTHON_BUILTINS,
    commentPatterns: "#[^\\n]*",
    stringPatterns:
      `(?:"""[\\s\\S]*?(?:"""|$)|'''[\\s\\S]*?(?:'''|$))|(?:[rbfRuU]{0,2})"(?:\\\\.|[^"\\\\\\n])*"|(?:[rbfRuU]{0,2})'(?:\\\\.|[^'\\\\\\n])*'`,
    numberPattern: `\\b0[xX][0-9a-fA-F]+\\b|\\b0[bB][01]+\\b|\\b\\d[\\d_]*(?:\\.\\d+)?(?:[eE][+-]?\\d+)?j?\\b`,
  },
  c: {
    keywords: cLikeKeywords(C_EXTRA),
    commentPatterns: C_STYLE_COMMENTS,
    stringPatterns: C_STYLE_STRINGS,
    numberPattern: NUMBER_PATTERN,
    extraPatterns: `#\\s*\\w+[^\\n]*`,
  },
  java: {
    keywords: cLikeKeywords(JAVA_EXTRA),
    commentPatterns: C_STYLE_COMMENTS,
    stringPatterns: C_STYLE_STRINGS,
    numberPattern: NUMBER_PATTERN,
  },
  javascript: {
    keywords: cLikeKeywords(JAVASCRIPT_EXTRA),
    commentPatterns: C_STYLE_COMMENTS,
    stringPatterns: C_STYLE_STRINGS,
    numberPattern: NUMBER_PATTERN,
  },
  typescript: {
    keywords: cLikeKeywords(TYPESCRIPT_EXTRA),
    commentPatterns: C_STYLE_COMMENTS,
    stringPatterns: C_STYLE_STRINGS,
    numberPattern: NUMBER_PATTERN,
  },
  csharp: {
    keywords: cLikeKeywords(CSHARP_EXTRA),
    commentPatterns: `\\/\\/[^\\n]*|\\/\\*[\\s\\S]*?(?:\\*\\/|$)`,
    stringPatterns: C_STYLE_STRINGS,
    numberPattern: NUMBER_PATTERN,
  },
  php: {
    keywords: PHP_KEYWORDS,
    commentPatterns: `\\/\\/[^\\n]*|#[^\\n]*|\\/\\*[\\s\\S]*?(?:\\*\\/|$)`,
    stringPatterns: C_STYLE_STRINGS,
    numberPattern: NUMBER_PATTERN,
    extraPatterns: `\\$[A-Za-z_]\\w*|<\\?php|<\\?=|\\?>`,
  },
  go: {
    keywords: cLikeKeywords(GO_EXTRA),
    commentPatterns: C_STYLE_COMMENTS,
    stringPatterns: String.raw`"(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*'|\`(?:\\.|[^\`\\])*\``,
    numberPattern: NUMBER_PATTERN,
  },
  rust: {
    keywords: cLikeKeywords(RUST_EXTRA),
    commentPatterns: `\\/\\/[^\\n]*|\\/\\*[\\s\\S]*?(?:\\*\\/|$)`,
    stringPatterns: `"(?:\\\\.|[^"\\\\\\n])*"|'(?:\\\\.|[^'\\\\\\n])*'|r"(?:[^"])*"`,
    numberPattern: NUMBER_PATTERN,
  },
  ruby: {
    keywords: RUBY_KEYWORDS,
    builtins: RUBY_BUILTINS,
    commentPatterns: `#[^\\n]*|=begin[\\s\\S]*?=end`,
    stringPatterns: `"(?:\\\\.|[^"\\\\\\n])*"|'(?:\\\\.|[^'\\\\\\n])*'|:[A-Za-z_]\\w*`,
    numberPattern: NUMBER_PATTERN,
    extraPatterns: `\\b[A-Z]\\w*\\b`,
  },
  kotlin: {
    keywords: cLikeKeywords(KOTLIN_EXTRA),
    commentPatterns: C_STYLE_COMMENTS,
    stringPatterns: C_STYLE_STRINGS,
    numberPattern: NUMBER_PATTERN,
  },
  swift: {
    keywords: cLikeKeywords(SWIFT_EXTRA),
    commentPatterns: C_STYLE_COMMENTS,
    stringPatterns: C_STYLE_STRINGS,
    numberPattern: NUMBER_PATTERN,
  },
  sql: {
    keywords: SQL_KEYWORDS,
    commentPatterns: `--[^\\n]*|\\/\\*[\\s\\S]*?(?:\\*\\/|$)`,
    stringPatterns: `'(?:''|[^'])*'|"(?:""|[^"])*"`,
    numberPattern: NUMBER_PATTERN,
    extraPatterns: `\\b[A-Za-z_]\\w*\\s*(?=\\()`,
  },
  html: {
    keywords: new Set(),
    commentPatterns: `<!--[\\s\\S]*?-->`,
    stringPatterns: `"(?:[^"\\\\]|\\\\.)*"|'(?:[^'\\\\]|\\\\.)*'`,
    numberPattern: NUMBER_PATTERN,
    extraPatterns: `<\\/?[A-Za-z][A-Za-z0-9-]*|[A-Za-z-]+(?=\\s*=)`,
  },
  css: {
    keywords: new Set(["!important", "and", "not", "only", "or"]),
    commentPatterns: `\\/\\*[\\s\\S]*?(?:\\*\\/|$)`,
    stringPatterns: `"(?:[^"\\\\]|\\\\.)*"|'(?:[^'\\\\]|\\\\.)*'`,
    numberPattern: `\\b\\d[\\d.]*(?:%|px|em|rem|vh|vw|vmin|vmax|s|ms|deg|rad|turn|ch|ex|cm|mm|in|pt|pc|q)?\\b`,
    extraPatterns: `@[a-z-]+|#[0-9a-fA-F]{3,8}\\b|[A-Za-z-][A-Za-z0-9-]*(?=\\s*:)`,
  },
};

interface CompiledGrammar {
  pattern: RegExp;
  keywords: Set<string>;
  builtins: Set<string>;
  /** Named-group → token type map, evaluated in order. */
  groups: Array<[string, TokenType]>;
}

const compiled = new Map<GrammarFamily, CompiledGrammar>();

function compileGrammar(family: GrammarFamily): CompiledGrammar {
  const cached = compiled.get(family);
  if (cached) return cached;

  const spec = GRAMMARS[family];
  const alternatives: string[] = [];
  const groups: Array<[string, TokenType]> = [];

  if (spec.commentPatterns) {
    alternatives.push(`(${spec.commentPatterns})`);
    groups.push(["comment", "comment"]);
  }
  if (spec.stringPatterns) {
    alternatives.push(`(${spec.stringPatterns})`);
    groups.push(["string", "string"]);
  }
  if (spec.extraPatterns) {
    alternatives.push(`(${spec.extraPatterns})`);
    groups.push(["extra", "plain"]);
  }
  alternatives.push(`(\\b[A-Za-z_]\\w*\\b)`);
  groups.push(["word", "plain"]);
  alternatives.push(`(${spec.numberPattern})`);
  groups.push(["number", "number"]);
  alternatives.push(`([+\\-*/%=<>!&|^~?:]+|\\.|,|;|:|\\(|\\)|\\[|\\]|\\{|\\})`);
  groups.push(["operator", "operator"]);

  const pattern = new RegExp(alternatives.join("|"), "g");
  const compiledGrammar: CompiledGrammar = {
    pattern,
    keywords: spec.keywords,
    builtins: spec.builtins || new Set(),
    groups,
  };
  compiled.set(family, compiledGrammar);
  return compiledGrammar;
}

/**
 * Classifies one matched word for grammars where context decides
 * (HTML tags/attributes, CSS properties, PHP variables, SQL calls).
 */
function classifyExtra(
  family: GrammarFamily,
  value: string,
  fullSource: string,
  matchIndex: number,
): TokenType | null {
  switch (family) {
    case "php": {
      if (value.startsWith("$")) return "variable";
      if (/^<\?/.test(value)) return "keyword";
      return null;
    }
    case "ruby": {
      if (/^[A-Z]/.test(value)) return "class";
      return null;
    }
    case "sql": {
      return "function";
    }
    case "html": {
      if (/^<\/?[A-Za-z]/.test(value)) return "tag";
      return "attr";
    }
    case "css": {
      if (value.startsWith("@")) return "keyword";
      if (/^#[0-9a-fA-F]{3,8}$/.test(value)) return "number";
      return "property";
    }
    default:
      return null;
  }
}

export function tokenize(source: string, family: GrammarFamily): Token[] {
  const grammar = compileGrammar(family);
  const tokens: Token[] = [];
  const pattern = new RegExp(grammar.pattern.source, "g");
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(source)) !== null) {
    const matched = match[0];
    if (!matched) {
      pattern.lastIndex += 1;
      continue;
    }
    if (match.index > lastIndex) {
      tokens.push({ type: "plain", value: source.slice(lastIndex, match.index) });
    }
    lastIndex = pattern.lastIndex;

    let type: TokenType = "plain";
    for (let index = 1; index < match.length; index += 1) {
      const groupValue = match[index];
      if (groupValue === undefined) continue;
      const [name, fallback] = grammar.groups[index - 1];
      if (name === "word") {
        const lower = matched.toLowerCase();
        if (grammar.keywords.has(matched) || grammar.keywords.has(lower)) {
          type = "keyword";
        } else if (grammar.builtins.has(matched)) {
          type = "function";
        } else if (source[pattern.lastIndex] === "(") {
          type = "function";
        } else {
          type = "plain";
        }
        break;
      }
      if (name === "extra") {
        const classified = classifyExtra(family, matched, source, match.index);
        type = classified || fallback;
        if (family === "c" && matched.startsWith("#")) type = "comment";
        if (type === "class") type = "keyword";
        break;
      }
      type = fallback;
      break;
    }

    tokens.push({ type, value: matched });
  }

  if (lastIndex < source.length) {
    tokens.push({ type: "plain", value: source.slice(lastIndex) });
  }
  return tokens;
}

/** Renders tokens as React-ready spans for the highlight layer. */
export function tokensToHtml(tokens: Token[]): string {
  const escape = (value: string) =>
    value
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  return tokens
    .map((token) =>
      token.type === "plain"
        ? escape(token.value)
        : `<span class="tok-${token.type}">${escape(token.value)}</span>`,
    )
    .join("");
}
