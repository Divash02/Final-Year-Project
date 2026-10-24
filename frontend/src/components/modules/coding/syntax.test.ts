import test from "node:test";
import assert from "node:assert/strict";
import { tokenize, tokensToHtml } from "./syntax.ts";

test("python tokenizer highlights keywords, strings, comments and numbers", () => {
  const tokens = tokenize(
    '# comment\ndef greet(name):\n    print("hi", 42)\n',
    "python",
  );
  const byType = (type: string) =>
    tokens.filter((token) => token.type === type).map((token) => token.value);

  assert.ok(byType("comment").includes("# comment"));
  assert.ok(byType("keyword").includes("def"));
  assert.ok(byType("keyword").includes("print") === false); // builtin, not keyword
  assert.ok(byType("function").includes("print"));
  assert.ok(byType("string").includes('"hi"'));
  assert.ok(byType("number").includes("42"));
});

test("javascript tokenizer highlights keywords, template strings and numbers", () => {
  const tokens = tokenize(
    'const total = 0;\nfor (let i = 1; i <= 5; i++) {\n  console.log(`sum ${i}`);\n}\n',
    "javascript",
  );
  const keywords = tokens
    .filter((token) => token.type === "keyword")
    .map((token) => token.value);
  assert.ok(keywords.includes("const"));
  assert.ok(keywords.includes("for"));
  assert.ok(keywords.includes("let"));
  const strings = tokens
    .filter((token) => token.type === "string")
    .map((token) => token.value);
  assert.ok(strings.some((value) => value.includes("sum ${i}")));
  assert.ok(
    tokens.some(
      (token) => token.type === "function" && token.value === "log",
    ),
  );
});

test("c tokenizer handles preprocessor directives and comments", () => {
  const tokens = tokenize(
    '#include <stdio.h>\nint main(void) { /* done */ return 0; }\n',
    "c",
  );
  const comments = tokens
    .filter((token) => token.type === "comment")
    .map((token) => token.value);
  assert.ok(comments.some((value) => value.startsWith("#include")));
  assert.ok(comments.includes("/* done */"));
  assert.ok(tokens.some((token) => token.type === "keyword" && token.value === "int"));
  assert.ok(tokens.some((token) => token.type === "number" && token.value === "0"));
});

test("html tokenizer marks tags and attributes", () => {
  const tokens = tokenize('<div class="card" id="main">hi</div>\n', "html");
  const tags = tokens
    .filter((token) => token.type === "tag")
    .map((token) => token.value);
  assert.ok(tags.includes("<div"));
  assert.ok(tags.includes("</div"));
  const attrs = tokens
    .filter((token) => token.type === "attr")
    .map((token) => token.value);
  assert.ok(attrs.includes("class"));
  assert.ok(attrs.includes("id"));
  const strings = tokens
    .filter((token) => token.type === "string")
    .map((token) => token.value);
  assert.ok(strings.includes('"card"'));
});

test("css tokenizer marks selectors, properties and values", () => {
  const tokens = tokenize(
    "body {\n  margin: 0;\n  background: #f1f5f9;\n}\n",
    "css",
  );
  const properties = tokens
    .filter((token) => token.type === "property")
    .map((token) => token.value);
  assert.ok(properties.includes("margin"));
  assert.ok(properties.includes("background"));
  const numbers = tokens
    .filter((token) => token.type === "number")
    .map((token) => token.value);
  assert.ok(numbers.includes("0"));
  assert.ok(numbers.includes("#f1f5f9"));
});

test("tokensToHtml escapes markup and wraps token types", () => {
  const html = tokensToHtml([
    { type: "keyword", value: "if" },
    { type: "plain", value: " <b> " },
  ]);
  assert.ok(html.includes('<span class="tok-keyword">if</span>'));
  assert.ok(html.includes("&lt;b&gt;"));
  assert.ok(!html.includes("<b>"));
});

test("sql tokenizer highlights clauses and string literals", () => {
  const tokens = tokenize(
    "SELECT name FROM students WHERE semester = 4 AND name = 'Maya';\n",
    "sql",
  );
  const keywords = tokens
    .filter((token) => token.type === "keyword")
    .map((token) => token.value);
  assert.ok(keywords.includes("SELECT"));
  assert.ok(keywords.includes("FROM"));
  assert.ok(keywords.includes("WHERE"));
  const strings = tokens
    .filter((token) => token.type === "string")
    .map((token) => token.value);
  assert.ok(strings.includes("'Maya'"));
});

test("ruby tokenizer highlights methods, symbols and interpolation strings", () => {
  const tokens = tokenize('puts "Hello, #{name}"\n', "ruby");
  assert.ok(
    tokens.some((token) => token.type === "function" && token.value === "puts"),
  );
  const strings = tokens
    .filter((token) => token.type === "string")
    .map((token) => token.value);
  assert.ok(strings.some((value) => value.includes("#{name}")));
});
