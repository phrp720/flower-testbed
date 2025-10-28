"use client";
import React, { useState } from "react";
import SingleFileUploader from "@/app/components/FileUploader";
import { FileCard } from "@/app/components/FileCard";
import Image from 'next/image';

export default function DashboardPage() {
    const [preset, setPreset] = useState("preset-pytorch");

    return (
        <>
            <div className="flex items-center justify-between">
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
            </div>


            <div align={"right"} className="mt-4 flex items-center justify-end" style={{ marginRight: "2rem" }}>
                    <label className="font-bold">Framework</label>
                    <select
                        id="preset-select"
                        value={preset}
                        onChange={(e) => setPreset(e.target.value)}
                        aria-label="Select preset"
                        className="ml-4 rounded-md border px-3 py-2 bg-white text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                    >
                        <option value="preset-pytorch">PyTorch</option>
                        <option value="preset-tensorflow">TensorFlow</option>
                        <option value="preset-sklearn">sklearn</option>
                        <option value="preset-huggingface">Hugging Face</option>
                        <option value="preset-jax">JAX</option>
                        <option value="preset-mlx">MLX</option>
                        <option value="preset-numpy">NumPy</option>
                        <option value="preset-xgboost">XGBoost</option>
                        <option value="preset-flowertune">FlowerTune</option>
                        <option value="preset-flower-baseline">Flower Baseline</option>
                    </select>
                </div>

            <div align={"center"} className="mt-8 grid grid-cols-1 gap-4 md:grid-cols-3 items-stretch auto-rows-fr">
                <div>
                    <FileCard title="Model" subtitle="Upload model files (e.g. pt files)">
                        <SingleFileUploader id="model-uploader" accept=".pt" hint="Drop model file here" />
                    </FileCard>
                </div>

                <div className="h-full">
                    <FileCard title="Server" subtitle="Upload the server implementation">
                        <SingleFileUploader id="server-uploader" accept=".py" hint="Drop server implementation" />
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
                    <FileCard title="Client" subtitle="Upload the client implementation">
                        <SingleFileUploader id="algorithm-uploader" accept=".py" hint="Drop client implementation" />
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
