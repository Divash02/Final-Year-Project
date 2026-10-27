import React, { useMemo } from "react";
import { sanitizeRichHtml } from "../../lib/sanitizeHtml";

interface RichTextDisplayProps {
  content: string | null | undefined;
  className?: string;
  fallbackText?: string;
}

/**
 * Safely renders rich HTML or formatted plain text.
 * Never outputs raw HTML tags like `<p>Hi</p>` to the user.
 * Sanitizes all content via DOMPurify before rendering.
 */
export const RichTextDisplay: React.FC<RichTextDisplayProps> = ({
  content,
  className = "",
  fallbackText = "",
}) => {
  const sanitizedHtml = useMemo(() => {
    if (!content || !content.trim()) return "";
    // If the content doesn't contain HTML tags, wrap it in a paragraph
    const hasHtmlTags = /<[a-z][\s\S]*>/i.test(content);
    const htmlToSanitize = hasHtmlTags ? content : `<p>${content}</p>`;
    return sanitizeRichHtml(htmlToSanitize);
  }, [content]);

  if (!sanitizedHtml) {
    if (!fallbackText) return null;
    return <span className={`text-slate-400 italic text-sm ${className}`}>{fallbackText}</span>;
  }

  return (
    <div
      className={`prose prose-sm max-w-none dark:prose-invert text-slate-800 dark:text-slate-200 leading-relaxed [&>p]:mb-2 [&>p:last-child]:mb-0 [&>ul]:list-disc [&>ul]:ml-4 [&>ol]:list-decimal [&>ol]:ml-4 [&>code]:bg-slate-100 dark:[&>code]:bg-slate-800 [&>code]:px-1 [&>code]:py-0.5 [&>code]:rounded [&>pre]:p-2.5 [&>pre]:bg-slate-900 [&>pre]:text-slate-100 [&>pre]:rounded-lg ${className}`}
      dangerouslySetInnerHTML={{ __html: sanitizedHtml }}
    />
  );
};

export default RichTextDisplay;

