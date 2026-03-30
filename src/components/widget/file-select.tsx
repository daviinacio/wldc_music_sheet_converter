import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { FilePlus2Icon } from "lucide-react";
import {
  Fragment,
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
// import { acceptedFileExtensions, fileIconByExtension } from "./data";
import { FileSelectItem } from "./file-select-item";
import { distinct, getFilenameExtension } from "@/lib/utils";
import { cn } from "@/lib/utils";

export interface FileSelectProps {
  onFileRemove?: (file: File) => void;
  onFileProcess?: (file: File) => Promise<void>;
  fileIconByExtension: Map<String, ReactNode>;
}

export function FileSelect({
  onFileRemove,
  onFileProcess,
  fileIconByExtension,
}: FileSelectProps) {
  const acceptedFileExtensions = Array.from(fileIconByExtension.keys());
  const wrapperRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [fileList, setFileList] = useState<Array<File>>([]);

  const handleFiles = useCallback((filesList: FileList) => {
    const files = Array.from(filesList);
    setFileList((prev) => {
      const newFileList = [...prev, ...files]
        .filter(distinct("name"))
        .filter((it) =>
          acceptedFileExtensions.includes(getFilenameExtension(it.name))
        );

      return newFileList;
    });
  }, []);

  const handleOnChange = useCallback<
    React.ChangeEventHandler<HTMLInputElement>
  >((e) => {
    if (!e.target.files) return;

    handleFiles(e.target.files);

    e.target.value = "";
  }, []);

  const handleRemoveFile = useCallback(
    (file: File) =>
      setFileList((prev) => {
        const newFileList = prev.filter((it) => it !== file);
        onFileRemove && onFileRemove(file);
        return newFileList;
      }),
    []
  );

  useEffect(() => {
    if (!wrapperRef.current) return;

    function handleDrop(e: DragEvent) {
      e.preventDefault();
      e.stopPropagation();
      wrapperRef.current?.classList.remove("drag-over");

      if (!e.dataTransfer?.files) return;
      handleFiles(e.dataTransfer.files);
    }

    function handleDragOver(e: DragEvent) {
      e.preventDefault();
      e.stopPropagation();

      if (!e.dataTransfer) return;
      e.dataTransfer.dropEffect = "move";

      wrapperRef.current?.classList.add("drag-over");
    }

    function handleDragLeave(e: DragEvent) {
      e.preventDefault();
      e.stopPropagation();
      wrapperRef.current?.classList.remove("drag-over");
    }

    wrapperRef.current.addEventListener("drop", handleDrop);
    wrapperRef.current.addEventListener("dragover", handleDragOver);
    wrapperRef.current.addEventListener("dragleave", handleDragLeave);

    return function () {
      wrapperRef.current?.removeEventListener("drop", handleDrop);
      wrapperRef.current?.removeEventListener("dragover", handleDragOver);
      wrapperRef.current?.removeEventListener("dragleave", handleDragLeave);
    };
  }, [wrapperRef]);

  return (
    <div
      ref={wrapperRef}
      className={cn(
        "border-2 border-dashed border-transparent rounded-xl grid grid-rows-[1fr_auto] p-2 gap-2 relative transition-all duration-300",
        "ring-1 ring-border",
        "[&.drag-over]:border-primary [&.drag-over]:ring-transparent",
        "relative overflow-hidden",
        "h-full"
      )}
    >
      <input
        className="!hidden"
        type="file"
        multiple={true}
        ref={inputRef}
        onChange={handleOnChange}
        accept={Array.from(fileIconByExtension.keys())
          .map((it) => `.${it}`)
          .join(",")}
      />

      <ScrollArea
        className=""
        fitContainer
        scrollBarClassName="translate-x-2.5"
      >
        <ul>
          {fileList.length === 0 && (
            <li className="text-center text-slate-500 py-4">
              No files selected
            </li>
          )}
          {fileList.map((it, i, arr) => (
            <Fragment key={it.name}>
              <FileSelectItem
                file={it}
                fileIconByExtension={fileIconByExtension}
                onRemove={handleRemoveFile}
                onProcess={onFileProcess && (() => onFileProcess(it))}
              />
              {i < arr.length - 1 && <Separator className="my-0.5" />}
            </Fragment>
          ))}
        </ul>
      </ScrollArea>

      <div className="p-2">
        <Button
          className="gap-x-2 w-full"
          onClick={() => inputRef.current?.click()}
        >
          <FilePlus2Icon className="size-5" /> Add file
        </Button>
      </div>

      <div
        className={cn(
          "absolute inset-0 bg-muted/95 flex items-center justify-center",
          "text-2xl font-semibold pointer-events-none",
          "opacity-0 [.drag-over_&]:opacity-100",
          "transition-all duration-300"
        )}
      >
        <span className="animate-bounce">Drop here</span>
      </div>
    </div>
  );
}
