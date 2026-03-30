import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { bytesToString } from "@/lib/utils";
import { QuestionMarkIcon } from "@radix-ui/react-icons";
import { Slot } from "@radix-ui/react-slot";
import {
  AlertCircleIcon,
  CheckCircleIcon,
  Loader2Icon,
  Trash2Icon,
} from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
export interface FileSelectItemProps {
  file: File;
  fileIconByExtension: Map<String, ReactNode>;
  onRemove?: (file: File) => void;
  onProcess?: () => Promise<void>;
}

export function FileSelectItem({
  file,
  fileIconByExtension,
  onRemove,
  onProcess,
}: FileSelectItemProps) {
  const fileExtension = file.name.split(".").slice(-1)[0];
  const icon = fileIconByExtension.get(fileExtension);
  const [isProcessing, setIsProcessing] = useState(true);
  const [error, setError] = useState<Error>();

  useEffect(() => {
    if (!onProcess) return;
    setIsProcessing(true);
    onProcess()
      .then(() => setIsProcessing(false))
      .catch((err) => setError(err));
  }, []);

  return (
    <TooltipProvider>
      <Tooltip open={true}>
        <TooltipTrigger asChild>
          <li
            className={cn(
              "grid grid-cols-[1fr_auto_auto] items-center",
              "hover:bg-muted transition-all",
              "rounded-lg group/item",
              "p-0.5 border-2 border-transparent",
              !!error && "border-destructive !bg-background"
            )}
          >
            <div
              className={cn(
                "grid grid-cols-[auto_1fr_auto] items-center gap-1"
              )}
            >
              <Slot className="size-6" title={`${fileExtension} file`}>
                {icon || <QuestionMarkIcon />}
              </Slot>
              <span className={cn("truncate text-sm")}>{file.name}</span>
              <Badge className="px-1 py-0 bg-slate-500">
                {bytesToString(file.size)}
              </Badge>
            </div>
            <div className="inline-flex ml-1">
              {error ? (
                <div className="p-0.5">
                  <AlertCircleIcon className="size-6 text-destructive" />
                </div>
              ) : isProcessing ? (
                <div className="p-0.5">
                  <Loader2Icon className="size-6 animate-spin" />
                </div>
              ) : (
                <div className="p-0.5">
                  <CheckCircleIcon className="size-6 text-green-600" />
                </div>
              )}
            </div>
            <Button
              className={cn(
                "hover:bg-destructive! hover:text-destructive-foreground!",
                "w-0 h-7 transition-all duration-300 overflow-hidden",
                "group-hover/item:w-7 group-hover/item:ml-1"
              )}
              size="icon"
              variant="ghost"
              onClick={() => onRemove && onRemove(file)}
            >
              <Trash2Icon className="size-5" />
            </Button>
          </li>
        </TooltipTrigger>
        <TooltipContent
          className="bg-destructive px-1.5 py-0.5 font-semibold text-sm"
          side="right"
          hidden={!error}
        >
          {error?.message}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
