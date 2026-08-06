import type { ReactNode } from "react";

/**
 * Render de markdown mínimo y seguro para las respuestas de NOA. Sin
 * dependencias y sin `dangerouslySetInnerHTML`: todo son nodos de React, así
 * que el texto del modelo no puede inyectar HTML.
 *
 * Cubre lo que Gemini usa en el chat: párrafos, saltos, **negrita**, *cursiva*,
 * `código` y listas con viñeta / numeradas. No pretende ser CommonMark.
 */

// Orden importante: **bold** antes que *italic* para que no se solapen.
const INLINE = /(\*\*([^*]+)\*\*|`([^`]+)`|\*([^*\n]+)\*|_([^_\n]+)_)/g;

function renderInline(text: string): ReactNode[] {
  const out: ReactNode[] = [];
  let last = 0;
  let k = 0;
  let m: RegExpExecArray | null;
  INLINE.lastIndex = 0;
  while ((m = INLINE.exec(text)) !== null) {
    if (m.index > last) out.push(text.slice(last, m.index));
    if (m[2] != null) {
      out.push(<strong key={k++}>{m[2]}</strong>);
    } else if (m[3] != null) {
      out.push(
        <code key={k++} className="rounded bg-background/60 px-1 py-0.5 font-mono text-xs">
          {m[3]}
        </code>,
      );
    } else {
      out.push(<em key={k++}>{m[4] ?? m[5]}</em>);
    }
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

export function Markdown({ text }: { text: string }) {
  const lines = text.split(/\r?\n/);
  const blocks: ReactNode[] = [];
  let para: string[] = [];
  let list: { ordered: boolean; items: string[] } | null = null;

  const flushPara = () => {
    if (para.length === 0) return;
    blocks.push(
      <p key={blocks.length} className="whitespace-pre-wrap">
        {renderInline(para.join("\n"))}
      </p>,
    );
    para = [];
  };

  const flushList = () => {
    if (!list) return;
    const items = list.items.map((it, idx) => <li key={idx}>{renderInline(it)}</li>);
    blocks.push(
      list.ordered ? (
        <ol key={blocks.length} className="flex list-decimal flex-col gap-1 pl-5">
          {items}
        </ol>
      ) : (
        <ul key={blocks.length} className="flex list-disc flex-col gap-1 pl-5">
          {items}
        </ul>
      ),
    );
    list = null;
  };

  for (const raw of lines) {
    const line = raw.trimEnd();
    const ul = /^\s*[-*]\s+(.*)$/.exec(line);
    const ol = /^\s*\d+\.\s+(.*)$/.exec(line);

    if (ul) {
      flushPara();
      if (!list || list.ordered) {
        flushList();
        list = { ordered: false, items: [] };
      }
      list.items.push(ul[1]);
      continue;
    }
    if (ol) {
      flushPara();
      if (!list || !list.ordered) {
        flushList();
        list = { ordered: true, items: [] };
      }
      list.items.push(ol[1]);
      continue;
    }
    if (line.trim() === "") {
      flushPara();
      flushList();
      continue;
    }
    flushList();
    para.push(line);
  }
  flushPara();
  flushList();

  return <div className="flex flex-col gap-2">{blocks}</div>;
}
