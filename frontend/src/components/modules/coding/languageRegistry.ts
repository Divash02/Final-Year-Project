/**
 * Language metadata and starter templates for the Online Coding Lab.
 *
 * The backend remains the source of truth for which languages the
 * configured execution provider actually supports (`GET
 * /api/coding/languages`); this registry supplies the editor-side
 * metadata (display name, file extension, syntax highlighting mode)
 * and the starter code a new file opens with. `PLAYGROUND_LANGUAGE_IDS`
 * marks the languages that render in the sandboxed preview instead
 * of being sent to the execution service.
 */

export interface LanguageDefinition {
  id: string;
  label: string;
  extension: string;
  /** Syntax highlighting family used by the tokenizer. */
  grammar:
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
  playground: boolean;
  starter: string;
  starterFileName: string;
}

export const PLAYGROUND_LANGUAGE_IDS = ["html", "css", "javascript"] as const;

export function isPlaygroundLanguage(languageId: string): boolean {
  return (PLAYGROUND_LANGUAGE_IDS as readonly string[]).includes(languageId);
}

export const LANGUAGE_DEFINITIONS: LanguageDefinition[] = [
  {
    id: "python",
    label: "Python",
    extension: "py",
    grammar: "python",
    playground: false,
    starterFileName: "hello.py",
    starter: `# Python starter
name = input("What is your name? ")
print(f"Hello, {name}! Welcome to the CollegeOS Coding Lab.")

total = 0
for number in range(1, 6):
    total += number
print(f"Sum of 1..5 is {total}")
`,
  },
  {
    id: "java",
    label: "Java",
    extension: "java",
    grammar: "java",
    playground: false,
    starterFileName: "Main.java",
    starter: `// Java starter — the class name must match the file name
public class Main {
    public static void main(String[] args) {
        String name = "Student";
        System.out.println("Hello, " + name + "!");

        int total = 0;
        for (int i = 1; i <= 5; i++) {
            total += i;
        }
        System.out.println("Sum of 1..5 is " + total);
    }
}
`,
  },
  {
    id: "c",
    label: "C",
    extension: "c",
    grammar: "c",
    playground: false,
    starterFileName: "main.c",
    starter: `/* C starter */
#include <stdio.h>

int main(void) {
    char name[64];
    printf("What is your name? ");
    if (scanf("%63s", name) != 1) {
        return 1;
    }
    printf("Hello, %s!\\n", name);

    int total = 0;
    for (int i = 1; i <= 5; i++) {
        total += i;
    }
    printf("Sum of 1..5 is %d\\n", total);
    return 0;
}
`,
  },
  {
    id: "cpp",
    label: "C++",
    extension: "cpp",
    grammar: "c",
    playground: false,
    starterFileName: "main.cpp",
    starter: `// C++ starter
#include <iostream>
#include <string>

int main() {
    std::string name = "Student";
    std::cout << "Hello, " << name << "!" << std::endl;

    int total = 0;
    for (int i = 1; i <= 5; ++i) {
        total += i;
    }
    std::cout << "Sum of 1..5 is " << total << std::endl;
    return 0;
}
`,
  },
  {
    id: "javascript",
    label: "JavaScript (Node.js)",
    extension: "js",
    grammar: "javascript",
    playground: true,
    starterFileName: "script.js",
    starter: `// JavaScript (Node.js) starter
const name = "Student";
console.log(\`Hello, \${name}! Welcome to the CollegeOS Coding Lab.\`);

let total = 0;
for (let i = 1; i <= 5; i++) {
  total += i;
}
console.log("Sum of 1..5 is", total);
`,
  },
  {
    id: "typescript",
    label: "TypeScript",
    extension: "ts",
    grammar: "typescript",
    playground: false,
    starterFileName: "script.ts",
    starter: `// TypeScript starter
interface Greeter {
  name: string;
  greet(): string;
}

const greeter: Greeter = {
  name: "Student",
  greet() {
    return \`Hello, \${this.name}!\`;
  },
};

console.log(greeter.greet());

const numbers: number[] = [1, 2, 3, 4, 5];
const total = numbers.reduce((sum, n) => sum + n, 0);
console.log("Sum of 1..5 is", total);
`,
  },
  {
    id: "csharp",
    label: "C#",
    extension: "cs",
    grammar: "csharp",
    playground: false,
    starterFileName: "Program.cs",
    starter: `// C# starter
using System;

class Program {
    static void Main() {
        string name = "Student";
        Console.WriteLine($"Hello, {name}!");

        int total = 0;
        for (int i = 1; i <= 5; i++) {
            total += i;
        }
        Console.WriteLine($"Sum of 1..5 is {total}");
    }
}
`,
  },
  {
    id: "php",
    label: "PHP",
    extension: "php",
    grammar: "php",
    playground: false,
    starterFileName: "script.php",
    starter: `<?php
// PHP starter
$name = "Student";
echo "Hello, $name! Welcome to the CollegeOS Coding Lab.\\n";

$total = 0;
for ($i = 1; $i <= 5; $i++) {
    $total += $i;
}
echo "Sum of 1..5 is $total\\n";
`,
  },
  {
    id: "go",
    label: "Go",
    extension: "go",
    grammar: "go",
    playground: false,
    starterFileName: "main.go",
    starter: `// Go starter
package main

import "fmt"

func main() {
	name := "Student"
	fmt.Printf("Hello, %s!\\n", name)

	total := 0
	for i := 1; i <= 5; i++ {
		total += i
	}
	fmt.Printf("Sum of 1..5 is %d\\n", total)
}
`,
  },
  {
    id: "rust",
    label: "Rust",
    extension: "rs",
    grammar: "rust",
    playground: false,
    starterFileName: "main.rs",
    starter: `// Rust starter
fn main() {
    let name = "Student";
    println!("Hello, {}!", name);

    let mut total = 0;
    for i in 1..=5 {
        total += i;
    }
    println!("Sum of 1..5 is {}", total);
}
`,
  },
  {
    id: "ruby",
    label: "Ruby",
    extension: "rb",
    grammar: "ruby",
    playground: false,
    starterFileName: "main.rb",
    starter: `# Ruby starter
name = "Student"
puts "Hello, #{name}! Welcome to the CollegeOS Coding Lab."

total = 0
(1..5).each { |i| total += i }
puts "Sum of 1..5 is #{total}"
`,
  },
  {
    id: "kotlin",
    label: "Kotlin",
    extension: "kt",
    grammar: "kotlin",
    playground: false,
    starterFileName: "Main.kt",
    starter: `// Kotlin starter
fun main() {
    val name = "Student"
    println("Hello, $name!")

    var total = 0
    for (i in 1..5) {
        total += i
    }
    println("Sum of 1..5 is $total")
}
`,
  },
  {
    id: "swift",
    label: "Swift",
    extension: "swift",
    grammar: "swift",
    playground: false,
    starterFileName: "main.swift",
    starter: `// Swift starter
let name = "Student"
print("Hello, \\(name)!")

var total = 0
for i in 1...5 {
    total += i
}
print("Sum of 1..5 is \\(total)")
`,
  },
  {
    id: "sql",
    label: "SQL (SQLite)",
    extension: "sql",
    grammar: "sql",
    playground: false,
    starterFileName: "query.sql",
    starter: `-- SQL starter (SQLite)
CREATE TABLE students (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  semester INTEGER
);

INSERT INTO students (name, semester) VALUES
  ('Aarav', 4),
  ('Maya', 4),
  ('Kiran', 6);

SELECT name, semester
FROM students
WHERE semester = 4
ORDER BY name;
`,
  },
  {
    id: "html",
    label: "HTML",
    extension: "html",
    grammar: "html",
    playground: true,
    starterFileName: "index.html",
    starter: `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>My page</title>
  </head>
  <body>
    <main class="card">
      <h1>Hello from the Coding Lab</h1>
      <p>Edit this HTML, style it in <code>style.css</code> and add behaviour in <code>script.js</code>.</p>
      <button id="greet" type="button">Say hello</button>
      <p id="greeting" aria-live="polite"></p>
    </main>
  </body>
</html>
`,
  },
  {
    id: "css",
    label: "CSS",
    extension: "css",
    grammar: "css",
    playground: true,
    starterFileName: "style.css",
    starter: `/* CSS starter */
:root {
  color-scheme: light;
}

body {
  margin: 0;
  min-height: 100vh;
  display: grid;
  place-items: center;
  font-family: system-ui, sans-serif;
  background: #f1f5f9;
  color: #0f172a;
}

.card {
  padding: 2rem;
  border-radius: 0.75rem;
  background: #ffffff;
  box-shadow: 0 1px 3px rgb(15 23 42 / 0.12);
  text-align: center;
}

button {
  padding: 0.5rem 1rem;
  border: 0;
  border-radius: 0.5rem;
  background: #0d9488;
  color: #ffffff;
  cursor: pointer;
}

button:hover {
  background: #0f766e;
}
`,
  },
];

const BY_ID = new Map(LANGUAGE_DEFINITIONS.map((definition) => [definition.id, definition]));

export function getLanguageDefinition(languageId: string): LanguageDefinition {
  return (
    BY_ID.get(String(languageId || "").toLowerCase()) ||
    LANGUAGE_DEFINITIONS[0]
  );
}

export function defaultFileNameFor(languageId: string): string {
  return getLanguageDefinition(languageId).starterFileName;
}

export function starterFor(languageId: string): string {
  return getLanguageDefinition(languageId).starter;
}

/**
 * Infers the lab language id from a file name, so an uploaded
 * `solution.py` opens in the Python editor without asking.
 */
export function languageForFileName(fileName: string): string {
  const name = String(fileName || "").toLowerCase();
  const dot = name.lastIndexOf(".");
  const extension = dot >= 0 ? name.slice(dot + 1) : "";
  const match = LANGUAGE_DEFINITIONS.find(
    (definition) => definition.extension === extension,
  );
  if (match) return match.id;
  if (name.endsWith(".tsx") || name.endsWith(".jsx")) return "javascript";
  return "plaintext";
}

/** Playgrounds always manage these three files in this order. */
export const PLAYGROUND_FILES = [
  { name: "index.html", language: "html" },
  { name: "style.css", language: "css" },
  { name: "script.js", language: "javascript" },
] as const;
