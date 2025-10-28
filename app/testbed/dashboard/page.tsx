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

            <div className="mt-8 grid grid-cols-1 gap-4 md:grid-cols-2 items-stretch auto-rows-fr" align={"center"}>
                <div>
                    <FileCard title="Model" subtitle="Upload model files (e.g. pt files)">
                            <SingleFileUploader id="model-uploader" accept=".pt" hint="Drop model file here" />
                    </FileCard>
                </div>

                <div className="h-full">
                    <FileCard title="Training" subtitle="Upload training data or config">
                            <SingleFileUploader id="training-uploader" accept=".py" hint="Drop training dataset or config" />
                    </FileCard>
                </div>

                <div className="h-full">
                    <FileCard title="Testing" subtitle="Upload test datasets">
                            <SingleFileUploader id="testing-uploader" accept=".py" hint="Drop test dataset" />
                    </FileCard>
                </div>

                <div className="h-full">
                    <FileCard title="Algorithm" subtitle="Upload algorithm implementations">
                            <SingleFileUploader id="algorithm-uploader" accept=".py" hint="Drop algorithm code" />
                    </FileCard>
                </div>
            </div>


            <div className="flex justify-center mt-6">
                <button
                    type="submit"
                    className="inline-flex items-center gap-3 rounded-full bg-gradient-to-r from-blue-600 to-indigo-600 px-5 py-2 text-white font-semibold shadow-lg
               hover:from-blue-700 hover:to-indigo-700 focus:outline-none focus:ring-4 focus:ring-indigo-200 transition-transform active:scale-95"
                    aria-label="Start experiment"
                >
                    Start Experiment
                </button>
            </div>

        </>
    );
}
