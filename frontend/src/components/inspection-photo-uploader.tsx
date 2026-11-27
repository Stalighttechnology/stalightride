import React, { useRef, useState, useEffect } from "react";
import { Camera, Plus, X, UploadCloud, Eye, Trash2, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export interface InspectionPhotoUploaderProps {
  files: File[];
  onChange: (files: File[]) => void;
  maxPhotos?: number;
  label?: string;
  description?: string;
  disabled?: boolean;
  className?: string;
  recommendedTags?: string[];
  tagLabel?: string;
  required?: boolean;
}

const DEFAULT_RECOMMENDED_ANGLES = [
  "Front bumper & hood",
  "Rear & number plate",
  "Left side & doors",
  "Right side & doors",
  "Dashboard & odometer",
  "Any existing scratches",
];

export function InspectionPhotoUploader({
  files,
  onChange,
  maxPhotos = 8,
  label = "Vehicle photos",
  description = "Take or upload clear photos of all sides, dashboard, and odometer to record vehicle condition.",
  disabled = false,
  className,
  recommendedTags,
  tagLabel = "Recommended:",
  required = false,
}: InspectionPhotoUploaderProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [previews, setPreviews] = useState<string[]>([]);
  const [previewModalIndex, setPreviewModalIndex] = useState<number | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const tagsToShow =
    recommendedTags === undefined ? DEFAULT_RECOMMENDED_ANGLES : recommendedTags;

  // Sync previews with files and clean up object URLs
  useEffect(() => {
    const urls = files.map((f) => URL.createObjectURL(f));
    setPreviews(urls);

    return () => {
      urls.forEach((u) => URL.revokeObjectURL(u));
    };
  }, [files]);

  const handleAddFiles = (incoming: FileList | File[]) => {
    if (disabled) return;
    const fileList = Array.from(incoming);
    const validImages = fileList.filter((f) => {
      if (!f.type.startsWith("image/")) {
        toast.error(`"${f.name}" is not an image file.`);
        return false;
      }
      if (f.size > 15 * 1024 * 1024) {
        toast.error(`"${f.name}" exceeds the 15MB limit.`);
        return false;
      }
      return true;
    });

    if (validImages.length === 0) return;

    const remaining = maxPhotos - files.length;
    if (remaining <= 0) {
      toast.error(`Maximum limit of ${maxPhotos} photos reached.`);
      return;
    }

    // Filter out duplicates (same name & size)
    const existingKeys = new Set(files.map((f) => `${f.name}-${f.size}`));
    const newUnique = validImages.filter((f) => !existingKeys.has(`${f.name}-${f.size}`));

    if (newUnique.length === 0) {
      toast.info("Selected photo(s) are already added.");
      return;
    }

    const toAdd = newUnique.slice(0, remaining);
    if (newUnique.length > remaining) {
      toast.warning(
        `Added ${remaining} photo(s). Maximum ${maxPhotos} photos allowed.`,
      );
    } else {
      toast.success(
        `Added ${toAdd.length} photo${toAdd.length > 1 ? "s" : ""} (${files.length + toAdd.length}/${maxPhotos})`,
      );
    }

    onChange([...files, ...toAdd]);

    // Reset input value so selecting the same file again triggers onChange
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleRemove = (index: number, e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (disabled) return;
    const removedFile = files[index];
    const updated = files.filter((_, i) => i !== index);
    onChange(updated);
    if (previewModalIndex === index) {
      setPreviewModalIndex(null);
    } else if (previewModalIndex !== null && previewModalIndex > index) {
      setPreviewModalIndex(previewModalIndex - 1);
    }
    toast.info(`Removed "${removedFile?.name || "photo"}"`);
  };

  const handleClearAll = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (disabled || files.length === 0) return;
    onChange([]);
    setPreviewModalIndex(null);
    toast.info("All photos removed");
  };

  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    if (!disabled && files.length < maxPhotos) {
      setIsDragging(true);
    }
  };

  const onDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleAddFiles(e.dataTransfer.files);
    }
  };

  const openPicker = () => {
    if (disabled || files.length >= maxPhotos) return;
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
    fileInputRef.current?.click();
  };

  return (
    <div className={cn("grid gap-3", className)}>
      {/* Hidden native input with multiple selection */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        disabled={disabled || files.length >= maxPhotos}
        className="hidden"
        onChange={(e) => {
          if (e.target.files) {
            handleAddFiles(e.target.files);
          }
        }}
      />

      {/* Header with counter and helper badge */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-primary dark:bg-primary/20">
            <Camera className="h-4 w-4" />
          </div>
          <span className="font-medium text-sm text-foreground">
            {label}
            {required && (
              <span className="ml-0.5 text-destructive" aria-hidden="true">
                *
              </span>
            )}
          </span>
          <Badge
            variant={files.length > 0 ? "default" : "secondary"}
            className={cn(
              "text-[11px] font-semibold transition-colors",
              files.length > 0
                ? "bg-emerald-600 text-white dark:bg-emerald-500"
                : "bg-muted text-muted-foreground",
            )}
          >
            {files.length} / {maxPhotos} photos
          </Badge>
        </div>

        {files.length > 0 && !disabled && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={handleClearAll}
            className="h-7 px-2 text-xs text-muted-foreground hover:text-destructive transition-colors"
          >
            <Trash2 className="mr-1 h-3 w-3" />
            Clear all
          </Button>
        )}
      </div>

      <p className="text-xs text-muted-foreground">{description}</p>

      {/* Recommended angles reference chips (Swiggy/Zepto style) */}
      {tagsToShow && tagsToShow.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
          <span className="text-[11px] font-medium text-muted-foreground mr-1">
            {tagLabel}
          </span>
          {tagsToShow.map((angle) => (
            <span
              key={angle}
              className="inline-flex items-center rounded-md border border-border/70 bg-muted/40 px-2 py-0.5 text-[10px] text-muted-foreground transition-colors dark:bg-muted/20"
            >
              {angle}
            </span>
          ))}
        </div>
      )}

      {/* Main Upload / Grid Area */}
      {files.length === 0 ? (
        /* Empty State Dropzone */
        <div
          onClick={openPicker}
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onDrop={onDrop}
          className={cn(
            "group relative flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed p-7 text-center transition-all duration-200",
            isDragging
              ? "border-primary bg-primary/5 dark:bg-primary/10 scale-[1.01]"
              : "border-border/80 bg-muted/30 hover:border-primary/60 hover:bg-muted/50 dark:bg-muted/15 dark:hover:bg-muted/30",
            disabled && "cursor-not-allowed opacity-60",
          )}
        >
          <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary transition-transform duration-200 group-hover:scale-110 dark:bg-primary/20">
            <UploadCloud className="h-6 w-6" />
          </div>
          <p className="font-semibold text-sm text-foreground">
            Tap to upload or take vehicle photos
          </p>
          <p className="mt-1 max-w-sm text-xs text-muted-foreground">
            Select one or multiple photos at once. You can continue adding more photos anytime.
          </p>
          <div className="mt-3.5 flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={disabled}
              className="pointer-events-none rounded-lg border-border bg-background/80 text-xs shadow-xs dark:bg-card"
            >
              <Plus className="mr-1.5 h-3.5 w-3.5" />
              Choose Photos
            </Button>
            <span className="text-[11px] text-muted-foreground">
              Up to {maxPhotos} photos • JPG, PNG, WebP
            </span>
          </div>
        </div>
      ) : (
        /* Populated Photo Gallery Grid */
        <div
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onDrop={onDrop}
          className={cn(
            "grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 rounded-xl transition-all",
            isDragging && "ring-2 ring-primary ring-offset-2 rounded-xl",
          )}
        >
          {previews.map((src, i) => (
            <div
              key={`${files[i]?.name || i}-${i}`}
              onClick={() => setPreviewModalIndex(i)}
              className="group relative aspect-square cursor-pointer overflow-hidden rounded-xl border border-border bg-card shadow-xs transition-all duration-200 hover:shadow-md hover:border-primary/50"
            >
              {/* Image Preview */}
              <img
                src={src}
                alt={`Inspection photo ${i + 1}`}
                className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-105"
              />

              {/* Photo Index Badge */}
              <div className="absolute top-2 left-2 z-10 flex items-center gap-1 rounded-md bg-black/60 px-1.5 py-0.5 text-[10px] font-medium text-white shadow-xs backdrop-blur-md dark:bg-black/80">
                <span>#{i + 1}</span>
              </div>

              {/* Quick Action Overlay (View / Zoom) */}
              <div className="absolute inset-0 flex items-center justify-center bg-black/30 opacity-0 backdrop-blur-[2px] transition-opacity duration-150 group-hover:opacity-100">
                <span className="inline-flex items-center gap-1 rounded-full bg-background/90 px-2.5 py-1 text-[11px] font-medium text-foreground shadow-md backdrop-blur-md dark:bg-card/90">
                  <Eye className="h-3 w-3" /> Preview
                </span>
              </div>

              {/* Swiggy/Zepto-style Remove Button */}
              {!disabled && (
                <button
                  type="button"
                  onClick={(e) => handleRemove(i, e)}
                  title="Remove this photo"
                  aria-label={`Remove photo ${i + 1}`}
                  className="absolute top-2 right-2 z-20 flex h-7 w-7 items-center justify-center rounded-full border border-border/80 bg-background/95 text-foreground shadow-md backdrop-blur-md transition-all duration-150 hover:scale-110 hover:border-destructive hover:bg-destructive hover:text-white active:scale-95 dark:bg-card/95 dark:text-foreground dark:hover:bg-destructive"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}

              {/* File details at bottom */}
              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent p-2 text-white">
                <p className="truncate text-[10px] font-normal leading-tight opacity-90">
                  {files[i]?.name || `Photo ${i + 1}`}
                </p>
              </div>
            </div>
          ))}

          {/* "+ Add More" Tile (Swiggy / Zepto style) */}
          {files.length < maxPhotos && !disabled && (
            <div
              onClick={openPicker}
              className="group flex aspect-square cursor-pointer flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed border-border/80 bg-muted/20 p-3 text-center transition-all duration-200 hover:border-primary/60 hover:bg-muted/40 hover:scale-[1.02] active:scale-[0.98] dark:bg-muted/10 dark:hover:bg-muted/25"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary transition-all duration-200 group-hover:scale-110 group-hover:bg-primary group-hover:text-primary-foreground dark:bg-primary/20">
                <Plus className="h-5 w-5" />
              </div>
              <span className="font-medium text-xs text-foreground">Add photo</span>
              <span className="text-[10px] text-muted-foreground">
                {maxPhotos - files.length} more remaining
              </span>
            </div>
          )}
        </div>
      )}

      {/* Lightbox / Full-size Photo Preview Dialog */}
      <Dialog
        open={previewModalIndex !== null}
        onOpenChange={(open) => !open && setPreviewModalIndex(null)}
      >
        <DialogContent className="max-w-2xl p-4 sm:p-6 bg-card border-border text-card-foreground">
          {previewModalIndex !== null && previews[previewModalIndex] && (
            <div className="grid gap-4">
              <DialogHeader className="flex flex-row items-center justify-between pb-2 border-b border-border">
                <DialogTitle className="text-base font-semibold text-foreground flex items-center gap-2">
                  <Camera className="h-4 w-4 text-primary" />
                  Photo {previewModalIndex + 1} of {files.length}
                </DialogTitle>
                <div className="text-xs text-muted-foreground pr-6">
                  {files[previewModalIndex]?.name}
                </div>
              </DialogHeader>

              <div className="relative aspect-video max-h-[60vh] w-full overflow-hidden rounded-xl border border-border bg-black/10 dark:bg-black/40">
                <img
                  src={previews[previewModalIndex]}
                  alt={`Full size preview ${previewModalIndex + 1}`}
                  className="h-full w-full object-contain"
                />
              </div>

              <div className="flex items-center justify-between pt-1">
                <div className="text-xs text-muted-foreground">
                  Size: {(files[previewModalIndex]?.size / (1024 * 1024)).toFixed(2)} MB
                </div>
                <div className="flex gap-2">
                  {!disabled && (
                    <Button
                      type="button"
                      variant="destructive"
                      size="sm"
                      onClick={() => handleRemove(previewModalIndex)}
                      className="gap-1.5 text-xs"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      Remove photo
                    </Button>
                  )}
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setPreviewModalIndex(null)}
                    className="text-xs"
                  >
                    Done
                  </Button>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
