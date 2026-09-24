'use client';

import React, { useState } from 'react';
import { Copy, Check, Terminal } from 'lucide-react';
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '@/components/ui/table';

interface MarkdownRendererProps {
  content: string;
  className?: string;
}

/**
 * Parses inline markdown: bold, italic, inline code, links
 */
function renderInline(text: string): React.ReactNode[] {
  const pattern = /(`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*|\[[^\]]+\]\([^)]+\))/g;
  const parts = text.split(pattern);

  return parts.map((part, index) => {
    if (!part) return null;

    // Inline code
    if (part.startsWith('`') && part.endsWith('`') && part.length >= 2) {
      return (
        <code
          key={index}
          className="px-1.5 py-0.5 mx-0.5 rounded bg-slate-800 text-slate-200 font-mono text-[11px] border border-slate-700/60 font-normal"
        >
          {part.slice(1, -1)}
        </code>
      );
    }

    // Bold
    if (part.startsWith('**') && part.endsWith('**') && part.length >= 4) {
      return (
        <strong key={index} className="font-semibold text-slate-100">
          {renderInline(part.slice(2, -2))}
        </strong>
      );
    }

    // Italic
    if (part.startsWith('*') && part.endsWith('*') && part.length >= 2) {
      return (
        <em key={index} className="italic text-slate-300">
          {renderInline(part.slice(1, -1))}
        </em>
      );
    }

    // Links
    const linkMatch = part.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
    if (linkMatch) {
      return (
        <a
          key={index}
          href={linkMatch[2]}
          target="_blank"
          rel="noopener noreferrer"
          className="text-blue-400 hover:text-blue-300 underline underline-offset-2 transition-colors font-medium"
        >
          {linkMatch[1]}
        </a>
      );
    }

    return <span key={index}>{part}</span>;
  });
}

/**
 * Code block with clean copy button
 */
function CodeBlock({ code, language }: { code: string; language?: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="my-2.5 rounded-lg overflow-hidden border border-slate-800 bg-slate-950">
      <div className="flex items-center justify-between px-3 py-1 bg-slate-900 border-b border-slate-800 text-[10px] font-mono text-slate-400">
        <span className="flex items-center gap-1.5 text-slate-300">
          <Terminal className="w-3 h-3 text-slate-500" />
          {language ? language.toUpperCase() : 'CODE'}
        </span>
        <button
          onClick={handleCopy}
          className="flex items-center gap-1 px-1.5 py-0.5 rounded hover:bg-slate-800 text-slate-400 hover:text-slate-200 transition-colors"
          title="복사"
        >
          {copied ? (
            <>
              <Check className="w-3 h-3 text-emerald-400" />
              <span className="text-emerald-400 font-sans text-[10px]">복사됨</span>
            </>
          ) : (
            <>
              <Copy className="w-3 h-3" />
              <span className="font-sans text-[10px]">복사</span>
            </>
          )}
        </button>
      </div>
      <pre className="p-3 overflow-x-auto font-mono text-[11px] text-slate-300 leading-relaxed">
        <code>{code}</code>
      </pre>
    </div>
  );
}

/**
 * Markdown Table component with clean minimalist styling
 */
function MarkdownTable({ lines }: { lines: string[] }) {
  if (lines.length < 2) return null;

  // Header row
  const headerCells = lines[0]
    .split('|')
    .slice(1, -1)
    .map((c) => c.trim());

  // Alignment row (e.g. :---, :---:, ---:)
  const alignCells = lines[1]
    .split('|')
    .slice(1, -1)
    .map((c) => {
      const trimmed = c.trim();
      if (trimmed.startsWith(':') && trimmed.endsWith(':')) return 'center';
      if (trimmed.endsWith(':')) return 'right';
      return 'left';
    });

  // Body rows
  const bodyRows = lines.slice(2).map((row) =>
    row
      .split('|')
      .slice(1, -1)
      .map((c) => c.trim()),
  );

  return (
    <div className="my-2.5 overflow-hidden rounded-lg border border-slate-800/90 bg-slate-900/40">
      <div className="overflow-x-auto">
        <Table>
          <TableHeader className="bg-slate-900/80 border-b border-slate-800">
            <TableRow className="border-b border-slate-800 hover:bg-transparent">
              {headerCells.map((header, idx) => (
                <TableHead
                  key={idx}
                  className={`text-[11px] font-semibold text-slate-200 py-2 px-3 ${
                    alignCells[idx] === 'center'
                      ? 'text-center'
                      : alignCells[idx] === 'right'
                        ? 'text-right'
                        : 'text-left'
                  }`}
                >
                  {renderInline(header)}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {bodyRows.map((row, rowIdx) => (
              <TableRow
                key={rowIdx}
                className="border-b border-slate-800/50 hover:bg-slate-800/30 even:bg-slate-900/20 transition-colors"
              >
                {row.map((cell, cellIdx) => (
                  <TableCell
                    key={cellIdx}
                    className={`text-[11px] text-slate-300 py-1.5 px-3 ${
                      alignCells[cellIdx] === 'center'
                        ? 'text-center'
                        : alignCells[cellIdx] === 'right'
                          ? 'text-right'
                          : 'text-left'
                    }`}
                  >
                    {renderInline(cell)}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

/**
 * Full Markdown Renderer for Chat Messages
 */
export function MarkdownRenderer({ content, className = '' }: MarkdownRendererProps) {
  if (!content) return null;

  const lines = content.split('\n');
  const elements: React.ReactNode[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // 1. Fenced Code Block: ```lang ... ```
    if (line.trim().startsWith('```')) {
      const language = line.trim().slice(3).trim();
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith('```')) {
        codeLines.push(lines[i]);
        i++;
      }
      if (i < lines.length && lines[i].trim().startsWith('```')) {
        i++; // skip closing ```
      }
      elements.push(
        <CodeBlock
          key={`code-${elements.length}`}
          code={codeLines.join('\n')}
          language={language}
        />,
      );
      continue;
    }

    // 2. Markdown Table: starts with | and next line has |---
    if (
      line.trim().startsWith('|') &&
      line.trim().endsWith('|') &&
      i + 1 < lines.length &&
      lines[i + 1].includes('---') &&
      lines[i + 1].trim().startsWith('|')
    ) {
      const tableLines: string[] = [];
      while (
        i < lines.length &&
        lines[i].trim().startsWith('|') &&
        lines[i].trim().endsWith('|')
      ) {
        tableLines.push(lines[i]);
        i++;
      }
      elements.push(
        <MarkdownTable key={`table-${elements.length}`} lines={tableLines} />,
      );
      continue;
    }

    // 3. Blockquote: starts with >
    if (line.trim().startsWith('>')) {
      const quoteLines: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith('>')) {
        quoteLines.push(lines[i].trim().replace(/^>\s?/, ''));
        i++;
      }
      elements.push(
        <blockquote
          key={`quote-${elements.length}`}
          className="my-2 pl-3 py-1.5 border-l-2 border-slate-600 bg-slate-900/40 text-[11px] text-slate-300 rounded-r space-y-0.5"
        >
          {quoteLines.map((ql, qIdx) => (
            <p key={qIdx} className="leading-relaxed">
              {renderInline(ql)}
            </p>
          ))}
        </blockquote>,
      );
      continue;
    }

    // 4. Horizontal Rule: --- or ***
    if (/^(\s*[-*_]\s*){3,}$/.test(line.trim())) {
      elements.push(
        <hr key={`hr-${elements.length}`} className="my-2.5 border-slate-800" />,
      );
      i++;
      continue;
    }

    // 5. Headings: #, ##, ###, ####
    if (line.startsWith('#')) {
      const match = line.match(/^(#{1,4})\s+(.+)$/);
      if (match) {
        const level = match[1].length;
        const headingText = match[2];
        if (level === 1) {
          elements.push(
            <h1
              key={`h1-${elements.length}`}
              className="text-sm font-bold text-white mt-3 mb-1.5 pb-1 border-b border-slate-800"
            >
              {renderInline(headingText)}
            </h1>,
          );
        } else if (level === 2) {
          elements.push(
            <h2
              key={`h2-${elements.length}`}
              className="text-xs font-semibold text-slate-100 mt-2.5 mb-1 pb-0.5 border-b border-slate-800/60"
            >
              {renderInline(headingText)}
            </h2>,
          );
        } else if (level === 3) {
          elements.push(
            <h3
              key={`h3-${elements.length}`}
              className="text-xs font-semibold text-slate-200 mt-2 mb-1"
            >
              {renderInline(headingText)}
            </h3>,
          );
        } else {
          elements.push(
            <h4
              key={`h4-${elements.length}`}
              className="text-[11px] font-medium text-slate-400 mt-1.5 mb-0.5"
            >
              {renderInline(headingText)}
            </h4>,
          );
        }
        i++;
        continue;
      }
    }

    // 6. Unordered List items: - or *
    if (/^\s*[-*]\s+/.test(line)) {
      const listItems: string[] = [];
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) {
        listItems.push(lines[i].replace(/^\s*[-*]\s+/, ''));
        i++;
      }
      elements.push(
        <ul
          key={`ul-${elements.length}`}
          className="my-1.5 space-y-0.5 text-xs text-slate-300 pl-4 list-disc marker:text-slate-500"
        >
          {listItems.map((item, idx) => (
            <li key={idx} className="leading-relaxed">
              {renderInline(item)}
            </li>
          ))}
        </ul>,
      );
      continue;
    }

    // 7. Ordered List items: 1. 2.
    if (/^\s*\d+\.\s+/.test(line)) {
      const listItems: string[] = [];
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) {
        listItems.push(lines[i].replace(/^\s*\d+\.\s+/, ''));
        i++;
      }
      elements.push(
        <ol
          key={`ol-${elements.length}`}
          className="my-1.5 space-y-0.5 text-xs text-slate-300 pl-4 list-decimal marker:text-slate-500"
        >
          {listItems.map((item, idx) => (
            <li key={idx} className="leading-relaxed">
              {renderInline(item)}
            </li>
          ))}
        </ol>,
      );
      continue;
    }

    // 8. Regular paragraph / text line
    if (line.trim() === '') {
      i++;
      continue;
    }

    const paragraphLines: string[] = [line];
    i++;
    while (
      i < lines.length &&
      lines[i].trim() !== '' &&
      !lines[i].trim().startsWith('```') &&
      !lines[i].trim().startsWith('|') &&
      !lines[i].trim().startsWith('>') &&
      !lines[i].startsWith('#') &&
      !/^\s*[-*]\s+/.test(lines[i]) &&
      !/^\s*\d+\.\s+/.test(lines[i]) &&
      !/^(\s*[-*_]\s*){3,}$/.test(lines[i].trim())
    ) {
      paragraphLines.push(lines[i]);
      i++;
    }

    elements.push(
      <p key={`p-${elements.length}`} className="my-1 text-xs text-slate-200 leading-relaxed">
        {paragraphLines.map((pl, plIdx) => (
          <React.Fragment key={plIdx}>
            {plIdx > 0 && <br />}
            {renderInline(pl)}
          </React.Fragment>
        ))}
      </p>,
    );
  }

  return <div className={`markdown-content space-y-1 text-xs ${className}`}>{elements}</div>;
}
