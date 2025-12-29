// `app/components/FileUploader.tsx`
import React, {useCallback, useRef, useState} from "react";

type Props = {
    id?: string;
    accept?: string;
    hint?: string;
    type: 'algorithm' | 'model' | 'config' | 'dataset'; // Required: type of file being uploaded
    onFile?: (file: File | null) => void;
    onUploadComplete?: (path: string) => void; // Callback when upload succeeds
};

export default function SingleFileUploader({id = "single-uploader", accept = "*", hint = "Drop or click to upload", type, onFile, onUploadComplete}: Props) {
    const [file, setFile] = useState<File | null>(null);
    const [isDragOver, setIsDragOver] = useState(false);
    const [isUploading, setIsUploading] = useState(false);
    const [uploadedPath, setUploadedPath] = useState<string | null>(null);
    const inputRef = useRef<HTMLInputElement | null>(null);

    const handleFiles = useCallback(
        (f: File | null) => {
            setFile(f);
            onFile?.(f);
        },
        [onFile]
    );

    const onChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const f = e.target.files?.[0] ?? null; // only first file
        handleFiles(f);
    };

    const onDrop = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragOver(false);
        const f = e.dataTransfer.files?.[0] ?? null; // only first file
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
        setUploadedPath(null);
    };

    const uploadFile = async () => {
        if (!file) return;

        setIsUploading(true);
        try {
            const formData = new FormData();
            formData.append('file', file);
            formData.append('type', type);

            const response = await fetch('/api/upload', {
                method: 'POST',
                body: formData,
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.error || 'Upload failed');
            }

            const data = await response.json();
            setUploadedPath(data.path);
            onUploadComplete?.(data.path);
            alert(`File uploaded successfully!`);
        } catch (error) {
            console.error('Upload error:', error);
            alert(`Upload failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
        } finally {
            setIsUploading(false);
        }
    };

    return (
        <div>
            <label
                htmlFor={id}
                className={`group relative flex flex-col items-center justify-center gap-2 rounded-md border p-3 text-sm transition
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
                    onClick={() => inputRef.current?.click()}
                    className="pointer-events-auto mt-2 rounded-md bg-blue-600 px-3 py-1 text-xs font-medium text-white hover:bg-blue-700"
                >
                    Choose file
                </button>
            </label>

            {file && (
                <div className={`mt-2 flex items-center justify-between rounded-md border p-2 text-sm ${uploadedPath ? 'bg-green-50 border-green-200' : 'bg-gray-50'}`}>
                    <div>
                        <p className="text-sm font-medium text-gray-800 truncate max-w-[18rem]">{file.name}</p>
                        <p className="text-[11px] text-gray-500">
                            {(file.size / 1024).toFixed(1)} KB
                            {uploadedPath && <span className="ml-2 text-green-600">✓ Uploaded</span>}
                        </p>
                    </div>
                    <div className="flex items-center gap-2">
                        {!uploadedPath && (
                            <button
                                onClick={uploadFile}
                                disabled={isUploading}
                                className="rounded-md bg-green-600 px-2 py-1 text-xs text-white hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {isUploading ? 'Uploading...' : 'Upload'}
                            </button>
                        )}
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
