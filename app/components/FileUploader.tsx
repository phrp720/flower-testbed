// `app/components/FileUploader.tsx`
import React, {useCallback, useRef, useState} from "react";

type Props = {
    id?: string;
    accept?: string;
    hint?: string;
    type: 'algorithm' | 'model' | 'config' | 'dataset';
    onFileSelect?: (file: File | null) => void;
};

export default function SingleFileUploader({id = "single-uploader", accept = "*", hint = "Drop or click to upload", type, onFileSelect}: Props) {
    const [file, setFile] = useState<File | null>(null);
    const [isDragOver, setIsDragOver] = useState(false);
    const inputRef = useRef<HTMLInputElement | null>(null);

    const handleFiles = useCallback(
        (f: File | null) => {
            setFile(f);
            onFileSelect?.(f);
        },
        [onFileSelect]
    );

    const onChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const f = e.target.files?.[0] ?? null;
        handleFiles(f);
    };

    const onDrop = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragOver(false);
        const f = e.dataTransfer.files?.[0] ?? null;
        handleFiles(f);
    };

    const onDragOver = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragOver(true);
    };

    const onDragLeave = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragOver(false);
    };

    const remove = () => {
        handleFiles(null);
        if (inputRef.current) {
            inputRef.current.value = '';
        }
    };

    return (
        <div>
            <label
                htmlFor={id}
                className={`group relative flex flex-col items-center justify-center gap-2 rounded-md border p-3 text-sm transition
          ${isDragOver ? "border-blue-400 bg-blue-50" : "border-gray-200 bg-white"}
          hover:border-gray-300 cursor-pointer`}
                onDrop={onDrop}
                onDragOver={onDragOver}
                onDragLeave={onDragLeave}
            >
                <input
                    id={id}
                    ref={inputRef}
                    type="file"
                    accept={accept}
                    multiple={false}
                    className="sr-only"
                    onChange={onChange}
                />

                <div className="text-center">
                    <p className="text-xs font-medium text-gray-700">{hint}</p>
                    <p className="mt-0.5 text-[11px] text-gray-400">Supported: {accept === "*" ? "any" : accept}</p>
                </div>

                <button
                    type="button"
                    onClick={(e) => {
                        e.preventDefault();
                        inputRef.current?.click();
                    }}
                    className="pointer-events-auto mt-2 rounded-md bg-blue-600 px-3 py-1 text-xs font-medium text-white hover:bg-blue-700"
                >
                    Choose file
                </button>
            </label>

            {file && (
                <div className="mt-2 flex items-center justify-between rounded-md border border-gray-200 bg-gray-50 p-2 text-sm">
                    <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-800 truncate">{file.name}</p>
                        <p className="text-[11px] text-gray-500">
                            {(file.size / 1024).toFixed(1)} KB
                        </p>
                    </div>
                    <button
                        onClick={remove}
                        className="ml-2 rounded-md bg-red-50 px-2 py-1 text-xs text-red-600 hover:bg-red-100"
                    >
                        Remove
                    </button>
                </div>
            )}
        </div>
    );
}