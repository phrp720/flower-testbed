import React, { useCallback, useRef, useState } from "react";

type Props = {
    id?: string;
    accept?: string;
    hint?: string;
    onFile?: (file: File | null) => void;
};

export default function SingleFileUploader({id = "single-uploader", accept = "*", hint = "Drop or click to upload", onFile,}: Props) {
    const [file, setFile] = useState<File | null>(null);
    const [isDragOver, setIsDragOver] = useState(false);
    const inputRef = useRef<HTMLInputElement | null>(null);

    const handleFiles = useCallback(
        (f: File | null) => {
            setFile(f);
            onFile?.(f);
        },
        [onFile]
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

    const remove = () => handleFiles(null);

    return (
        <div>
            <label
                htmlFor={id}
                className={`group relative flex flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed p-4 transition
          ${isDragOver ? "border-blue-400 bg-blue-50" : "border-gray-200 bg-white"}
          hover:border-gray-300`}
                onDrop={onDrop}
                onDragOver={onDragOver}
                onDragLeave={onDragLeave}
            >
                <input
                    id={id}
                    ref={inputRef}
                    type="file"
                    accept={accept}
                    className="sr-only"
                    onChange={onChange}
                />

                <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="h-8 w-8 text-gray-400 group-hover:text-gray-600"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    aria-hidden
                >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16v-4a4 4 0 118 0v4m-5-4v4" />
                </svg>

                <div className="text-center">
                    <p className="text-sm font-medium text-gray-700">{hint}</p>
                    <p className="mt-1 text-xs text-gray-400">Supported: {accept === "*" ? "any" : accept}</p>
                </div>

                <button
                    type="button"
                    onClick={() => inputRef.current?.click()}
                    className="pointer-events-auto mt-2 rounded-md bg-blue-600 px-3 py-1 text-sm font-medium text-white hover:bg-blue-700"
                >
                    Choose file
                </button>
            </label>

            {file && (
                <div className="mt-3 flex items-center justify-between rounded-md border bg-gray-50 p-3">
                    <div>
                        <p className="text-sm font-medium text-gray-800">{file.name}</p>
                        <p className="text-xs text-gray-500">{(file.size / 1024).toFixed(1)} KB</p>
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={() => {
                                // simple client-side "process" placeholder
                                alert(`Selected file: ${file.name}`);
                            }}
                            className="rounded-md bg-green-600 px-2 py-1 text-xs text-white hover:bg-green-700"
                        >
                            Upload
                        </button>
                        <button
                            onClick={remove}
                            className="rounded-md bg-red-50 px-2 py-1 text-xs text-red-600 hover:bg-red-100"
                        >
                            Remove
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
