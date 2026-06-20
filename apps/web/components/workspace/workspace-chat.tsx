"use client"

import { useState, type ReactNode } from "react"
import { Bot, Check, Copy } from "lucide-react"
import { Action, Actions } from "@/components/ai-elements/actions"
import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation"
import { Loader } from "@/components/ai-elements/loader"
import {
  Message,
  MessageContent,
  MessageResponse,
} from "@/components/ai-elements/message"
import {
  PromptInput,
  PromptInputFooter,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputUpload,
} from "@/components/ai-elements/prompt-input"
import { Suggestion, Suggestions } from "@/components/ai-elements/suggestion"

const STARTER_PROMPTS = [
  "Describe the product and who it's for",
  "Set brand colors and typography",
  "Define voice and tone guidelines",
  "Add accessibility and contrast rules",
]

// The eve session is the source of record for the transcript. The browser
// renders this lightweight shape, hydrated by replaying the session on load
// and appended optimistically as turns complete.
export type ChatMessage = {
  id: string
  role: "user" | "assistant"
  content: string
}

export function WorkspaceChat({
  messages,
  busy,
  error,
  draft,
  onDraftChange,
  onSubmit,
  onUploadFiles,
  uploading,
  pending,
}: {
  messages: ChatMessage[]
  busy: boolean
  error: string | null
  draft: string
  onDraftChange: (value: string) => void
  onSubmit: (value: string) => void
  onUploadFiles: (files: FileList) => void
  uploading: boolean
  pending?: ReactNode
}) {
  const isEmpty = messages.length === 0

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <Conversation>
        <ConversationContent className="mx-auto w-full max-w-3xl">
          {isEmpty ? (
            <ConversationEmptyState>
              <div className="flex flex-col items-center gap-4">
                <span className="grid size-10 place-items-center rounded-xl bg-muted text-muted-foreground">
                  <Bot className="size-5" />
                </span>
                <div className="space-y-1">
                  <h3 className="text-sm font-medium">
                    Teach Robin about this project
                  </h3>
                  <p className="max-w-sm text-sm text-muted-foreground">
                    Tell Robin about the audience, platform, and visual
                    direction. Robin proposes a design.md diff for you to
                    approve.
                  </p>
                </div>
                <Suggestions className="justify-center">
                  {STARTER_PROMPTS.map((prompt) => (
                    <Suggestion
                      key={prompt}
                      onClick={onSubmit}
                      suggestion={prompt}
                    />
                  ))}
                </Suggestions>
              </div>
            </ConversationEmptyState>
          ) : (
            messages.map((message) => (
              <Message from={message.role} key={message.id}>
                <MessageContent>
                  {message.role === "assistant" ? (
                    <MessageResponse>{message.content}</MessageResponse>
                  ) : (
                    message.content
                  )}
                </MessageContent>
                {message.role === "assistant" && (
                  <Actions>
                    <CopyAction text={message.content} />
                  </Actions>
                )}
              </Message>
            ))
          )}
          {pending && <div className="mx-auto w-full max-w-3xl">{pending}</div>}
          {busy && <Loader />}
        </ConversationContent>
        <ConversationScrollButton />
      </Conversation>

      <div className="border-t p-3">
        <div className="mx-auto w-full max-w-3xl">
          <PromptInput onSubmit={({ text }) => onSubmit(text)}>
            <PromptInputTextarea
              disabled={busy}
              maxLength={4000}
              onChange={(event) => onDraftChange(event.target.value)}
              placeholder="Describe the product, audience, tone, tokens, or constraints..."
              value={draft}
            />
            <PromptInputFooter>
              <PromptInputUpload
                disabled={busy}
                onFiles={onUploadFiles}
                uploading={uploading}
              />
              <PromptInputSubmit
                disabled={busy || !draft.trim()}
                status={busy ? "submitted" : "ready"}
              />
            </PromptInputFooter>
          </PromptInput>
          {error && <p className="pt-2 text-sm text-destructive">{error}</p>}
        </div>
      </div>
    </div>
  )
}

function CopyAction({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)

  return (
    <Action
      label="Copy message"
      onClick={() => {
        void navigator.clipboard.writeText(text)
        setCopied(true)
        setTimeout(() => setCopied(false), 1500)
      }}
      tooltip={copied ? "Copied" : "Copy"}
    >
      {copied ? <Check /> : <Copy />}
    </Action>
  )
}
