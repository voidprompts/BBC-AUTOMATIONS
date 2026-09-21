"use client";

import * as React from "react";
import Image from "next/image";
import { upload } from "@vercel/blob/client";
import { CloudUpload, ImageIcon, Loader2, RefreshCw, X } from "lucide-react";
import { toast } from "sonner";
import { cn, truncate } from "@/lib/utils";
import { Button } from "@/components/ui/button";

const MAX_SIZE_BYTES = 12 * 1024 * 1024;

export interface UploadedBlob {
  url: string;
  fileName: string;
}

interface ImageDropzoneProps {
  label: string;
  hint: string;
  /** Folder namespace on the blob store: "product" | "model" */
  kind: "product" | "model";
  value: UploadedBlob | null;
  onChange: (value: UploadedBlob | null) => void;
  disabled?: boolean;
}

type Status = "idle" | "uploading" | "done" | "error";

export function ImageDropzone({
  label,
  hint,
  kind,
  value,
  onChange,
  disabled,
}: ImageDropzoneProps) {
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [status, setStatus] = React.useState<Status>(value ? "done" : "idle");
  const [isDragging, setIsDragging] = React.useState(false);
  const [progress, setProgress] = React.useState(0);
  const [localPreview, setLocalPreview] = React.useState<string | null>(null);

  React.useEffect(() => {
    return () => {
      if (localPreview) URL.revokeObjectURL(localPreview);
    };
  }, [localPreview]);

  const validate = (file: File): string | null => {
    if (!file.type.startsWith("image/")) {
      return "Only image files are accepted.";
    }
    if (file.size > MAX_SIZE_BYTES) {
      return "Image is too large (max 12 MB).";
    }
    return null;
  };

  const handleFile = async (file: File) => {
    const validationError = validate(file);
    if (validationError) {
      toast.error(`${label}: ${validationError}`);
      return;
    }

    setStatus("uploading");
    setProgress(0);
    const preview = URL.createObjectURL(file);
    setLocalPreview(preview);

    try {
      const blob = await upload(`uploads/${kind}/${file.name}`, file, {
        access: "public",
        handleUploadUrl: "/api/upload",
        onUploadProgress: ({ percentage }) => setProgress(percentage),
      });
      onChange({ url: blob.url, fileName: file.name });
      setStatus("done");
      toast.success(`${label} uploaded`, {
        description: truncate(file.name, 40),
      });
    } catch (err) {
      console.error(`[upload:${kind}]`, err);
      setStatus("error");
      onChange(null);
      toast.error(`${label} upload failed`, {
        description:
          err instanceof Error
            ? err.message
            : "Check your connection and BLOB_READ_WRITE_TOKEN, then retry.",
      });
    }
  };

  const clear = () => {
    onChange(null);
    setStatus("idle");
    setLocalPreview(null);
    setProgress(0);
    if (inputRef.current) inputRef.current.value = "";
  };

  const previewSrc = value?.url ?? localPreview;

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium">{label}</p>
        {value && (
          <button
            type="button"
            onClick={clear}
            disabled={disabled}
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-destructive transition-colors"
          >
            <X className="h-3 w-3" /> Remove
          </button>
        )}
      </div>

      <div
        role="button"
        tabIndex={0}
        aria-label={`Upload ${label}`}
        onClick={() => !disabled && inputRef.current?.click()}
        onKeyDown={(e) => {
          if ((e.key === "Enter" || e.key === " ") && !disabled) {
            e.preventDefault();
            inputRef.current?.click();
          }
        }}
        onDragOver={(e) => {
          e.preventDefault();
          if (!disabled) setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setIsDragging(false);
          if (disabled) return;
          const file = e.dataTransfer.files?.[0];
          if (file) void handleFile(file);
        }}
        className={cn(
          "relative flex aspect-[4/3] w-full cursor-pointer flex-col items-center justify-center overflow-hidden rounded-lg border-2 border-dashed transition-colors",
          isDragging
            ? "border-primary bg-primary/5"
            : "border-muted-foreground/25 hover:border-primary/50 hover:bg-accent/50",
          status === "error" && "border-destructive/60",
          disabled && "pointer-events-none opacity-60"
        )}
      >
        {previewSrc ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={previewSrc}
              alt={`${label} preview`}
              className="absolute inset-0 h-full w-full object-cover"
            />
            {status === "uploading" && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-background/70 backdrop-blur-sm">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
                <p className="text-xs font-medium">
                  Uploading… {Math.round(progress)}%
                </p>
              </div>
            )}
            {status === "done" && value && (
              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-2">
                <p className="truncate text-xs text-white">
                  {truncate(value.fileName, 36)}
                </p>
              </div>
            )}
          </>
        ) : (
          <div className="flex flex-col items-center gap-2 p-4 text-center">
            {status === "error" ? (
              <>
                <RefreshCw className="h-8 w-8 text-destructive" />
                <p className="text-sm font-medium text-destructive">
                  Upload failed — click to retry
                </p>
              </>
            ) : (
              <>
                <div className="rounded-full bg-primary/10 p-3">
                  {isDragging ? (
                    <CloudUpload className="h-6 w-6 text-primary" />
                  ) : (
                    <ImageIcon className="h-6 w-6 text-primary" />
                  )}
                </div>
                <p className="text-sm font-medium">
                  Drag &amp; drop or{" "}
                  <span className="text-primary underline underline-offset-2">
                    browse
                  </span>
                </p>
                <p className="text-xs text-muted-foreground">{hint}</p>
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                  Any image format · max 12 MB
                </p>
              </>
            )}
          </div>
        )}
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void handleFile(file);
          }}
        />
      </div>

      {value && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-6 px-2 text-xs text-muted-foreground"
          onClick={() => inputRef.current?.click()}
          disabled={disabled}
        >
          <RefreshCw className="h-3 w-3" /> Replace image
        </Button>
      )}
    </div>
  );
}
