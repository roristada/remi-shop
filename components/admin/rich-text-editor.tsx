"use client";

import { useState, type ReactNode } from "react";
import { EditorContent, useEditor, useEditorState, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import TextAlign from "@tiptap/extension-text-align";
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Bold,
  Heading2,
  Heading3,
  Italic,
  Link2,
  List,
  ListOrdered,
  Underline,
  Unlink,
} from "lucide-react";
import { toRichHtml } from "@/lib/rich-text";
import { cn } from "@/lib/utils";

type Props = {
  label: string;
  /** Form field name; the HTML is submitted through a hidden input. */
  name: string;
  defaultValue: string;
  error?: string;
};

/**
 * Rich text for product descriptions: bold, italic, underline, headings, lists, alignment and
 * links. The stored HTML is sanitized on the server on save and again before it is shown.
 */
export function RichTextEditor({ label, name, defaultValue, error }: Props) {
  const [html, setHtml] = useState(() => toRichHtml(defaultValue));
  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3] },
        link: { openOnClick: false, autolink: true, protocols: ["http", "https", "mailto"], defaultProtocol: "https" },
      }),
      TextAlign.configure({ types: ["heading", "paragraph"] }),
    ],
    content: html,
    editorProps: {
      attributes: {
        class: "rich-text min-h-40 px-3 py-2.5 text-sm outline-none",
        "aria-label": label,
        "aria-multiline": "true",
        role: "textbox",
      },
    },
    // The hidden input changes on every edit; the surrounding form notices it on input events.
    onUpdate: ({ editor }) => setHtml(editor.isEmpty ? "" : editor.getHTML()),
  });

  return (
    <div className="space-y-1.5 md:col-span-2">
      <span className="text-sm font-medium">{label}</span>
      <div
        className={cn(
          "overflow-hidden rounded-xl border bg-background focus-within:ring-2 focus-within:ring-ring",
          error && "border-destructive",
        )}
      >
        {editor && <Toolbar editor={editor} />}
        <EditorContent editor={editor} />
      </div>
      <input type="hidden" name={name} value={html} />
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}

function Toolbar({ editor }: { editor: Editor }) {
  const [linking, setLinking] = useState(false);
  const [url, setUrl] = useState("");
  const state = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      bold: e.isActive("bold"),
      italic: e.isActive("italic"),
      underline: e.isActive("underline"),
      h2: e.isActive("heading", { level: 2 }),
      h3: e.isActive("heading", { level: 3 }),
      bullet: e.isActive("bulletList"),
      ordered: e.isActive("orderedList"),
      link: e.isActive("link"),
      left: e.isActive({ textAlign: "left" }),
      center: e.isActive({ textAlign: "center" }),
      right: e.isActive({ textAlign: "right" }),
    }),
  });
  const chain = () => editor.chain().focus();

  function applyLink() {
    const href = url.trim();
    if (href === "") chain().extendMarkRange("link").unsetLink().run();
    else chain().extendMarkRange("link").setLink({ href: /^(https?:|mailto:)/i.test(href) ? href : `https://${href}` }).run();
    setLinking(false);
    setUrl("");
  }

  return (
    <div className="border-b bg-muted/40">
      <div role="toolbar" aria-label="จัดรูปแบบข้อความ" className="flex flex-wrap gap-0.5 p-1">
        <Tool label="ตัวหนา" active={state.bold} onClick={() => chain().toggleBold().run()} icon={<Bold />} />
        <Tool label="ตัวเอียง" active={state.italic} onClick={() => chain().toggleItalic().run()} icon={<Italic />} />
        <Tool label="ขีดเส้นใต้" active={state.underline} onClick={() => chain().toggleUnderline().run()} icon={<Underline />} />
        <Divider />
        <Tool label="หัวข้อ" active={state.h2} onClick={() => chain().toggleHeading({ level: 2 }).run()} icon={<Heading2 />} />
        <Tool label="หัวข้อย่อย" active={state.h3} onClick={() => chain().toggleHeading({ level: 3 }).run()} icon={<Heading3 />} />
        <Divider />
        <Tool label="รายการแบบ Bullet" active={state.bullet} onClick={() => chain().toggleBulletList().run()} icon={<List />} />
        <Tool label="รายการแบบตัวเลข" active={state.ordered} onClick={() => chain().toggleOrderedList().run()} icon={<ListOrdered />} />
        <Divider />
        <Tool label="ชิดซ้าย" active={state.left} onClick={() => chain().setTextAlign("left").run()} icon={<AlignLeft />} />
        <Tool label="กึ่งกลาง" active={state.center} onClick={() => chain().setTextAlign("center").run()} icon={<AlignCenter />} />
        <Tool label="ชิดขวา" active={state.right} onClick={() => chain().setTextAlign("right").run()} icon={<AlignRight />} />
        <Divider />
        <Tool
          label="เพิ่มลิงก์"
          active={state.link || linking}
          onClick={() => {
            setUrl(editor.getAttributes("link").href ?? "");
            setLinking((v) => !v);
          }}
          icon={<Link2 />}
        />
        {state.link && <Tool label="เอาลิงก์ออก" onClick={() => chain().extendMarkRange("link").unsetLink().run()} icon={<Unlink />} />}
      </div>
      {linking && (
        <div className="flex gap-2 border-t p-2">
          <input
            type="url"
            value={url}
            autoFocus
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                applyLink();
              }
              if (e.key === "Escape") setLinking(false);
            }}
            placeholder="https://… (เลือกข้อความก่อน แล้ววางลิงก์)"
            aria-label="ลิงก์"
            className="h-8 min-w-0 flex-1 rounded-lg border bg-background px-2 text-sm"
          />
          <button type="button" onClick={applyLink} className="h-8 rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground">
            ใส่ลิงก์
          </button>
        </div>
      )}
    </div>
  );
}

function Tool({ label, active = false, onClick, icon }: { label: string; active?: boolean; onClick: () => void; icon: ReactNode }) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={active}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className={cn(
        "grid size-8 place-items-center rounded-lg text-muted-foreground hover:bg-background hover:text-foreground [&_svg]:size-4",
        active && "bg-background text-foreground shadow-soft",
      )}
    >
      {icon}
    </button>
  );
}

const Divider = () => <span aria-hidden className="mx-0.5 my-1.5 w-px bg-border" />;
