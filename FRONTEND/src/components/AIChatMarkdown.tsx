import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface AIChatMarkdownProps {
  content: string;
}

export default function AIChatMarkdown({ content }: AIChatMarkdownProps) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        p: ({ children }) => (
          <p className="whitespace-pre-wrap break-words">{children}</p>
        ),
        ul: ({ children }) => (
          <ul className="my-1 list-disc space-y-0.5 pl-5">{children}</ul>
        ),
        ol: ({ children }) => (
          <ol className="my-1 list-decimal space-y-0.5 pl-5">{children}</ol>
        ),
        li: ({ children }) => <li className="break-words">{children}</li>,
        strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
      }}
    >
      {content}
    </ReactMarkdown>
  );
}
