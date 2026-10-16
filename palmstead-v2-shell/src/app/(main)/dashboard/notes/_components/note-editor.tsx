"use client";

import { useEffect } from "react";

import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import TextAlign from "@tiptap/extension-text-align";
import Placeholder from "@tiptap/extension-placeholder";
import { TaskList, TaskItem } from "@tiptap/extension-list";
import Highlight from "@tiptap/extension-highlight";
import Typography from "@tiptap/extension-typography";
import { Bold, Italic, Underline as UnderlineIcon, List, ListOrdered, ListTodo, Highlighter, RemoveFormatting } from "lucide-react";

import { cn } from "cn";

import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";

// Real editor (10-notes-plan.md) -- same real TipTap core already proven in
// Memorandum's memo-editor.tsx, extended with the genuinely clonable slice
// of docmost's own extension set: TaskList/TaskItem (real checklists) and
// Highlight, both zero-backend-dependency, plus Typography (smart quotes).
// docmost's collaborative-editing extensions (Comment, live multi-cursor
// via Hocuspocus, Drawio/Excalidraw embeds) need infrastructure this
// single-owner notes app was never asked to stand up -- cloning those
// would silently fail, so they're deliberately left out.
interface NoteEditorProps {
  content: string;
  onChange: (html: string) => void;
}

export function useNoteEditor({ content, onChange }: NoteEditorProps) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [2, 3] } }),
      Underline,
      TextAlign.configure({ types: ["heading", "paragraph"] }),
      Placeholder.configure({ placeholder: "Type here…" }),
      TaskList,
      TaskItem.configure({ nested: true }),
      Highlight.configure({ multicolor: false }),
      Typography,
    ],
    content,
    immediatelyRender: false,
    onUpdate: ({ editor: e }) => onChange(e.getHTML()),
    editorProps: {
      attributes: {
        class: "prose prose-sm dark:prose-invert max-w-none focus:outline-none min-h-[220px] px-4 py-3",
      },
    },
  });

  useEffect(() => {
    if (!editor) return;
    if (content !== editor.getHTML() && !editor.isFocused) {
      editor.commands.setContent(content, { emitUpdate: false });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [content, editor]);

  return editor;
}

function ToolbarButton({
  active,
  onClick,
  label,
  children,
}: {
  active?: boolean;
  onClick: () => void;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <Button type="button" variant="ghost" size="icon-sm" aria-label={label} aria-pressed={active} onClick={onClick} className={cn(active && "bg-accent text-accent-foreground")}>
      {children}
    </Button>
  );
}

export function NoteEditorToolbar({ editor }: { editor: ReturnType<typeof useNoteEditor> }) {
  if (!editor) return null;
  return (
    <div className="flex flex-wrap items-center gap-0.5 border-b border-border px-2 py-1.5">
      <ToolbarButton label="Bold" active={editor.isActive("bold")} onClick={() => editor.chain().focus().toggleBold().run()}>
        <Bold />
      </ToolbarButton>
      <ToolbarButton label="Italic" active={editor.isActive("italic")} onClick={() => editor.chain().focus().toggleItalic().run()}>
        <Italic />
      </ToolbarButton>
      <ToolbarButton label="Underline" active={editor.isActive("underline")} onClick={() => editor.chain().focus().toggleUnderline().run()}>
        <UnderlineIcon />
      </ToolbarButton>
      <ToolbarButton label="Highlight" active={editor.isActive("highlight")} onClick={() => editor.chain().focus().toggleHighlight().run()}>
        <Highlighter />
      </ToolbarButton>
      <Separator orientation="vertical" className="mx-1 h-5" />
      <ToolbarButton label="Bullet list" active={editor.isActive("bulletList")} onClick={() => editor.chain().focus().toggleBulletList().run()}>
        <List />
      </ToolbarButton>
      <ToolbarButton label="Numbered list" active={editor.isActive("orderedList")} onClick={() => editor.chain().focus().toggleOrderedList().run()}>
        <ListOrdered />
      </ToolbarButton>
      <ToolbarButton label="Checklist" active={editor.isActive("taskList")} onClick={() => editor.chain().focus().toggleTaskList().run()}>
        <ListTodo />
      </ToolbarButton>
      <Separator orientation="vertical" className="mx-1 h-5" />
      <ToolbarButton label="Clear formatting" onClick={() => editor.chain().focus().clearNodes().unsetAllMarks().run()}>
        <RemoveFormatting />
      </ToolbarButton>
    </div>
  );
}

export function NoteEditorSurface({ editor }: { editor: ReturnType<typeof useNoteEditor> }) {
  return (
    <div className="rounded-b-lg border border-t-0 border-border bg-background [&_ul[data-type=taskList]]:list-none [&_ul[data-type=taskList]]:pl-0 [&_ul[data-type=taskList]_li]:flex [&_ul[data-type=taskList]_li]:items-start [&_ul[data-type=taskList]_li]:gap-2">
      <EditorContent editor={editor} />
    </div>
  );
}
