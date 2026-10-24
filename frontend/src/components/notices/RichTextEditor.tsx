import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faBold,
  faItalic,
  faUnderline,
  faStrikethrough,
  faListUl,
  faListOl,
  faAlignLeft,
  faAlignCenter,
  faAlignRight,
  faAlignJustify,
  faPalette,
  faEraser,
  faLink,
  faLinkSlash,
  faCheck,
} from "@fortawesome/free-solid-svg-icons";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import TextAlign from "@tiptap/extension-text-align";
import TextStyle from "@tiptap/extension-text-style";
import Color from "@tiptap/extension-color";
import Link from "@tiptap/extension-link";

/**
 * Rich text editor for institutional notices.
 *
 * Built on Tiptap: bold, italic, underline, strikethrough,
 * headings, lists, alignment, text colour, links and clear
 * formatting. The value is sanitized HTML — the server applies
 * the authoritative allow-list on save and the client sanitizes
 * again before rendering, so formatting survives the full
 * save/reopen/edit cycle without ever carrying markup the
 * institution does not allow.
 */

export interface RichTextEditorProps {
  /** Sanitized HTML content. */
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
  /** Minimum height of the editing surface. */
  minHeight?: string;
}

const PALETTE = [
  "#0f172a", "#475569", "#94a3b8",
  "#b91c1c", "#dc2626", "#ef4444",
  "#c2410c", "#ea580c", "#f97316",
  "#a16207", "#ca8a04", "#eab308",
  "#15803d", "#16a34a", "#22c55e",
  "#0e7490", "#0891b2", "#06b6d4",
  "#1d4ed8", "#2563eb", "#3b82f6",
  "#6d28d9", "#7c3aed", "#8b5cf6",
  "#be185d", "#db2777", "#ec4899",
];

export const RichTextEditor: React.FC<RichTextEditorProps> = ({
  value,
  onChange,
  placeholder = "Write the notice…",
  autoFocus = false,
  minHeight = "12rem",
}) => {
  const lastEmittedRef = useRef(value);
  const [colorOpen, setColorOpen] = useState(false);
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkHref, setLinkHref] = useState("");
  const [isEmpty, setIsEmpty] = useState(!value);
  const colorButtonRef = useRef<HTMLButtonElement>(null);
  const linkButtonRef = useRef<HTMLButtonElement>(null);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
      }),
      Underline,
      TextAlign.configure({ types: ["heading", "paragraph"] }),
      TextStyle,
      Color,
      Link.configure({
        openOnClick: false,
        autolink: true,
        HTMLAttributes: { rel: "noopener noreferrer" },
      }),
    ],
    content: value,
    autofocus: autoFocus ? "end" : false,
    onTransaction: ({ editor: instance }) => {
      setIsEmpty(instance.isEmpty);
    },
    onUpdate: ({ editor: instance }) => {
      const html = instance.getHTML();
      lastEmittedRef.current = html;
      onChange(html);
    },
  });

  // Sync external value changes (loading an existing draft) without
  // clobbering the cursor position on every keystroke.
  useEffect(() => {
    if (!editor) return;
    if (value !== lastEmittedRef.current && value !== editor.getHTML()) {
      editor.commands.setContent(value, false);
      lastEmittedRef.current = value;
    }
  }, [value, editor]);

  // Close popovers on outside click.
  useEffect(() => {
    if (!colorOpen && !linkOpen) return;
    const handleClick = (event: MouseEvent) => {
      const target = event.target as Node;
      if (
        colorButtonRef.current?.contains(target) ||
        linkButtonRef.current?.contains(target)
      ) {
        return;
      }
      if (
        (event.target as HTMLElement).closest?.("[data-color-popover]") ||
        (event.target as HTMLElement).closest?.("[data-link-popover]")
      ) {
        return;
      }
      setColorOpen(false);
      setLinkOpen(false);
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [colorOpen, linkOpen]);

  const applyColor = useCallback(
    (colour: string | null) => {
      if (!editor) return;
      if (colour) {
        editor.chain().focus().setColor(colour).run();
      } else {
        editor.chain().focus().unsetColor().run();
      }
      setColorOpen(false);
    },
    [editor],
  );

  const applyLink = useCallback(() => {
    if (!editor) return;
    const href = linkHref.trim();
    if (!href) {
      editor.chain().focus().unsetLink().run();
    } else {
      editor.chain().focus().setLink({ href }).run();
    }
    setLinkOpen(false);
    setLinkHref("");
  }, [editor, linkHref]);

  const toolbar = useMemo(() => {
    if (!editor) return null;

    const button = (
      label: string,
      icon: React.ReactNode,
      active: boolean,
      action: () => void,
      key: string,
    ) => (
      <button
        key={key}
        type="button"
        aria-label={label}
        title={label}
        data-active={active || undefined}
        className="cos-toolbar-btn"
        onMouseDown={(event) => event.preventDefault()}
        onClick={action}
      >
        {icon}
      </button>
    );

    const fa = (icon: Parameters<typeof FontAwesomeIcon>[0]["icon"]) => (
      <FontAwesomeIcon icon={icon} aria-hidden="true" />
    );

    return (
      <div className="flex flex-wrap items-center gap-y-1 border-b border-slate-200 bg-slate-50 px-2 py-1.5">
        <span className="cos-toolbar-group">
          {button("Bold", fa(faBold), editor.isActive("bold"), () =>
            editor.chain().focus().toggleBold().run(), "bold")}
          {button("Italic", fa(faItalic), editor.isActive("italic"), () =>
            editor.chain().focus().toggleItalic().run(), "italic")}
          {button("Underline", fa(faUnderline), editor.isActive("underline"), () =>
            editor.chain().focus().toggleUnderline().run(), "underline")}
          {button("Strikethrough", fa(faStrikethrough), editor.isActive("strike"), () =>
            editor.chain().focus().toggleStrike().run(), "strike")}
        </span>

        <span className="cos-toolbar-separator" aria-hidden="true" />

        <span className="cos-toolbar-group">
          {button("Heading 1", <span className="px-0.5">H1</span>, editor.isActive("heading", { level: 1 }), () =>
            editor.chain().focus().toggleHeading({ level: 1 }).run(), "h1")}
          {button("Heading 2", <span className="px-0.5">H2</span>, editor.isActive("heading", { level: 2 }), () =>
            editor.chain().focus().toggleHeading({ level: 2 }).run(), "h2")}
          {button("Heading 3", <span className="px-0.5">H3</span>, editor.isActive("heading", { level: 3 }), () =>
            editor.chain().focus().toggleHeading({ level: 3 }).run(), "h3")}
          {button("Paragraph", <span className="px-0.5 text-[0.6875rem]">¶</span>, editor.isActive("paragraph"), () =>
            editor.chain().focus().setParagraph().run(), "paragraph")}
        </span>

        <span className="cos-toolbar-separator" aria-hidden="true" />

        <span className="cos-toolbar-group">
          {button("Bulleted list", fa(faListUl), editor.isActive("bulletList"), () =>
            editor.chain().focus().toggleBulletList().run(), "ul")}
          {button("Numbered list", fa(faListOl), editor.isActive("orderedList"), () =>
            editor.chain().focus().toggleOrderedList().run(), "ol")}
        </span>

        <span className="cos-toolbar-separator" aria-hidden="true" />

        <span className="cos-toolbar-group">
          {button("Align left", fa(faAlignLeft), editor.isActive({ textAlign: "left" }), () =>
            editor.chain().focus().setTextAlign("left").run(), "align-left")}
          {button("Align center", fa(faAlignCenter), editor.isActive({ textAlign: "center" }), () =>
            editor.chain().focus().setTextAlign("center").run(), "align-center")}
          {button("Align right", fa(faAlignRight), editor.isActive({ textAlign: "right" }), () =>
            editor.chain().focus().setTextAlign("right").run(), "align-right")}
          {button("Justify", fa(faAlignJustify), editor.isActive({ textAlign: "justify" }), () =>
            editor.chain().focus().setTextAlign("justify").run(), "align-justify")}
        </span>

        <span className="cos-toolbar-separator" aria-hidden="true" />

        <span className="cos-toolbar-group relative">
          <button
            ref={colorButtonRef}
            type="button"
            aria-label="Text colour"
            title="Text colour"
            aria-expanded={colorOpen}
            className="cos-toolbar-btn"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => setColorOpen((open) => !open)}
          >
            <FontAwesomeIcon icon={faPalette} aria-hidden="true" />
          </button>
          {colorOpen && (
            <div
              data-color-popover
              role="menu"
              aria-label="Text colour"
              className="absolute left-0 top-full z-20 mt-1 w-56 rounded-xl border border-slate-200 bg-white p-3 shadow-xl"
            >
              <div className="grid grid-cols-9 gap-1.5">
                {PALETTE.map((swatch) => (
                  <button
                    key={swatch}
                    type="button"
                    role="menuitem"
                    aria-label={`Colour ${swatch}`}
                    title={swatch}
                    onClick={() => applyColor(swatch)}
                    className="h-5 w-5 rounded-md ring-1 ring-slate-200 transition-transform hover:scale-110 focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
                    style={{ backgroundColor: swatch }}
                  />
                ))}
              </div>
              <div className="mt-2.5 flex items-center gap-2">
                <input
                  type="color"
                  value={editor.getAttributes("textStyle").color || "#0f172a"}
                  onChange={(event) => applyColor(event.target.value)}
                  aria-label="Custom colour"
                  className="h-7 w-10 cursor-pointer rounded-md border border-slate-200"
                />
                <span className="text-xs text-slate-500">Custom</span>
                <button
                  type="button"
                  className="cos-toolbar-btn ml-auto"
                  onClick={() => applyColor(null)}
                >
                  <FontAwesomeIcon icon={faCheck} className="mr-1" aria-hidden="true" />
                  None
                </button>
              </div>
            </div>
          )}
        </span>

        <span className="cos-toolbar-group relative">
          <button
            ref={linkButtonRef}
            type="button"
            aria-label={editor.isActive("link") ? "Remove link" : "Insert link"}
            title={editor.isActive("link") ? "Remove link" : "Insert link"}
            aria-expanded={linkOpen}
            className="cos-toolbar-btn"
            data-active={editor.isActive("link") || undefined}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => {
              setLinkOpen((open) => !open);
              setLinkHref(
                editor.isActive("link")
                  ? editor.getAttributes("link").href || ""
                  : "",
              );
            }}
          >
            <FontAwesomeIcon
              icon={editor.isActive("link") ? faLinkSlash : faLink}
              aria-hidden="true"
            />
          </button>
          {linkOpen && (
            <div
              data-link-popover
              role="dialog"
              aria-label="Insert link"
              className="absolute left-0 top-full z-20 mt-1 w-72 rounded-xl border border-slate-200 bg-white p-3 shadow-xl"
            >
              <label className="mb-1 block text-xs font-medium text-slate-600">
                Link URL
              </label>
              <input
                type="url"
                value={linkHref}
                onChange={(event) => setLinkHref(event.target.value)}
                placeholder="https://example.edu"
                autoFocus
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    applyLink();
                  }
                }}
                className="cos-input mb-2 w-full"
              />
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  className="cos-btn cos-btn-ghost min-h-[2rem] px-2.5 text-xs"
                  onClick={() => {
                    editor.chain().focus().unsetLink().run();
                    setLinkOpen(false);
                  }}
                >
                  Remove
                </button>
                <button
                  type="button"
                  className="cos-btn cos-btn-primary min-h-[2rem] px-2.5 text-xs"
                  onClick={applyLink}
                >
                  Apply
                </button>
              </div>
            </div>
          )}
        </span>

        <span className="cos-toolbar-separator" aria-hidden="true" />

        <span className="cos-toolbar-group">
          {button("Clear formatting", fa(faEraser), false, () =>
            editor.chain().focus().clearNodes().unsetAllMarks().run(), "clear")}
        </span>
      </div>
    );
  }, [editor, colorOpen, linkOpen, linkHref, applyColor, applyLink]);

  if (!editor) return null;

  return (
    <div
      className="cos-rich-text-editor relative overflow-hidden rounded-xl border border-slate-300 bg-white focus-within:border-[var(--color-primary)] focus-within:ring-2 focus-within:ring-[var(--color-primary-soft)]"
      style={{ minHeight }}
    >
      {toolbar}
      <EditorContent editor={editor} className="cos-rich-text-content" />
      {isEmpty && (
        <p
          aria-hidden="true"
          className="pointer-events-none absolute left-4 top-[2.75rem] text-sm text-slate-400"
        >
          {placeholder}
        </p>
      )}
    </div>
  );
};

export default RichTextEditor;
