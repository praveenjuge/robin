"use client"

import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupTextarea,
} from "@workspace/ui/components/input-group"
import { Spinner } from "@workspace/ui/components/spinner"
import { cn } from "@workspace/ui/lib/utils"
import type { ChatStatus, FileUIPart } from "ai"
import {
  CornerDownLeftIcon,
  PaperclipIcon,
  SquareIcon,
  XIcon,
} from "lucide-react"
import { useCallback, useRef, useState } from "react"
import type {
  ComponentProps,
  FormEvent,
  HTMLAttributes,
  KeyboardEventHandler,
} from "react"

export interface PromptInputMessage {
  text: string
  files: FileUIPart[]
}

export type PromptInputProps = Omit<
  HTMLAttributes<HTMLFormElement>,
  "onSubmit"
> & {
  onSubmit: (
    message: PromptInputMessage,
    event: FormEvent<HTMLFormElement>
  ) => void | Promise<void>
}

export function PromptInput({
  children,
  className,
  onSubmit,
  ...props
}: PromptInputProps) {
  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const text = String(form.get("message") ?? "").trim()
    if (text) void onSubmit({ files: [], text }, event)
  }

  return (
    <form
      className={cn("w-full", className)}
      onSubmit={handleSubmit}
      {...props}
    >
      <InputGroup className="overflow-hidden">{children}</InputGroup>
    </form>
  )
}

export type PromptInputTextareaProps = ComponentProps<typeof InputGroupTextarea>

export function PromptInputTextarea({
  className,
  onKeyDown,
  placeholder = "What would you like to know?",
  ...props
}: PromptInputTextareaProps) {
  const [isComposing, setIsComposing] = useState(false)
  const handleKeyDown: KeyboardEventHandler<HTMLTextAreaElement> = useCallback(
    (event) => {
      onKeyDown?.(event)
      if (
        event.defaultPrevented ||
        event.key !== "Enter" ||
        event.shiftKey ||
        isComposing ||
        event.nativeEvent.isComposing
      )
        return
      event.preventDefault()
      const submit = event.currentTarget.form?.querySelector(
        'button[type="submit"]'
      ) as HTMLButtonElement | null
      if (!submit?.disabled) event.currentTarget.form?.requestSubmit()
    },
    [isComposing, onKeyDown]
  )

  return (
    <InputGroupTextarea
      className={cn("field-sizing-content max-h-48 min-h-16", className)}
      name="message"
      onCompositionEnd={() => setIsComposing(false)}
      onCompositionStart={() => setIsComposing(true)}
      onKeyDown={handleKeyDown}
      placeholder={placeholder}
      {...props}
    />
  )
}

export type PromptInputFooterProps = Omit<
  ComponentProps<typeof InputGroupAddon>,
  "align"
>

export function PromptInputFooter({
  className,
  ...props
}: PromptInputFooterProps) {
  return (
    <InputGroupAddon
      align="block-end"
      className={cn("justify-between gap-1", className)}
      {...props}
    />
  )
}

export type PromptInputUploadProps = Omit<
  ComponentProps<typeof InputGroupButton>,
  "onClick"
> & {
  onFiles: (files: FileList) => void
  uploading?: boolean
}

export function PromptInputUpload({
  onFiles,
  uploading,
  disabled,
  children,
  ...props
}: PromptInputUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null)

  return (
    <>
      <input
        className="hidden"
        multiple
        onChange={(event) => {
          if (event.target.files?.length) onFiles(event.target.files)
          event.target.value = ""
        }}
        ref={inputRef}
        type="file"
      />
      <InputGroupButton
        aria-label="Upload files"
        disabled={disabled || uploading}
        onClick={() => inputRef.current?.click()}
        size="icon-sm"
        variant="ghost"
        {...props}
      >
        {children ??
          (uploading ? <Spinner /> : <PaperclipIcon className="size-4" />)}
      </InputGroupButton>
    </>
  )
}

export type PromptInputSubmitProps = ComponentProps<typeof InputGroupButton> & {
  status?: ChatStatus
  onStop?: () => void
}

export function PromptInputSubmit({
  children,
  className,
  onClick,
  onStop,
  size = "icon-sm",
  status,
  variant = "default",
  ...props
}: PromptInputSubmitProps) {
  const isGenerating = status === "submitted" || status === "streaming"
  const handleClick = useCallback<
    NonNullable<PromptInputSubmitProps["onClick"]>
  >(
    (event) => {
      if (isGenerating && onStop) {
        event.preventDefault()
        onStop()
      } else {
        onClick?.(event)
      }
    },
    [isGenerating, onClick, onStop]
  )

  let icon = <CornerDownLeftIcon className="size-4" />
  if (status === "submitted") icon = <Spinner />
  if (status === "streaming") icon = <SquareIcon className="size-4" />
  if (status === "error") icon = <XIcon className="size-4" />

  return (
    <InputGroupButton
      aria-label={isGenerating ? "Stop" : "Submit"}
      className={cn(className)}
      onClick={handleClick}
      size={size}
      type={isGenerating && onStop ? "button" : "submit"}
      variant={variant}
      {...props}
    >
      {children ?? icon}
    </InputGroupButton>
  )
}
