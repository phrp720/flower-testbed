"use client";
import React from "react";
import SingleFileUploader from "@/app/components/FileUploader";
import { FileCard } from "@/app/components/FileCard";
import Image from 'next/image';

export default function DashboardPage() {
    return (
        <>
            <h1 className="text-2xl font-semibold flex items-center gap-3">
                <Image
                    src="/flower-testbed-icon.png"
                    alt="Flower Testbed"
                    width={64}
                    height={64}
                    className="inline-block"
                />
                Testbed Dashboard
            </h1>

            <div className="mt-4 grid grid-cols-1 gap-6 md:grid-cols-2">
                <FileCard title="Model" subtitle="Upload model files (e.g. pt files)">
                    <SingleFileUploader id="model-uploader" accept=".pt" hint="Drop model file here" />
                </FileCard>

                <FileCard title="Training" subtitle="Upload training data or config">
                    <SingleFileUploader id="training-uploader" accept=".py" hint="Drop training dataset or config" />
                </FileCard>

                <FileCard title="Testing" subtitle="Upload test datasets">
                    <SingleFileUploader id="testing-uploader" accept=".py" hint="Drop test dataset" />
                </FileCard>

                <FileCard title="Algorithm" subtitle="Upload algorithm implementations">
                    <SingleFileUploader id="algorithm-uploader" accept=".py" hint="Drop algorithm code" />
                </FileCard>
            </div>
        </>
    );
}
