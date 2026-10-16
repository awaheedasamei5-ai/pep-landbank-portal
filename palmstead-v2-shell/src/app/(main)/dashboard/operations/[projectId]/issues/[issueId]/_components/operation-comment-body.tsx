"use client";

import { memo } from "react";

import { safeOperationCommentHtml } from "@/lib/palmstead/operations-comment-html";

/** Avoid reparsing every comment while someone types a new draft. */
export const OperationCommentBody = memo(function OperationCommentBody({ html }: { html: string }) {
  return (
    <div
      className="min-w-0 break-words [&_a]:underline [&_pre]:whitespace-pre-wrap"
      // biome-ignore lint/security/noDangerouslySetInnerHtml: New and legacy HTML both pass the tested safeOperationCommentHtml allowlist at this sink.
      dangerouslySetInnerHTML={{ __html: safeOperationCommentHtml(html) }}
    />
  );
});
